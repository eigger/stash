import { createHmac } from "node:crypto";
import { getSetting, setSetting } from "./settings.js";
import { prisma } from "./prisma.js";

const DEFAULT_APP_PUBLIC_URL = "http://localhost:3000";
const LAST_FAILURE_KEY = "WEBHOOK_LAST_FAILURE";

/** 총 시도 3회(최초 + 재시도 2). 간격은 1s → 4s — HA 재시작 정도의 짧은 끊김을 흡수하되 CRUD를 막지 않는다. */
export const WEBHOOK_MAX_ATTEMPTS = 3;
export const WEBHOOK_BACKOFF_MS = [0, 1000, 4000] as const;

export interface WebhookFailure {
  at: string;
  message: string;
  /** 최종 실패까지 수행한 시도 횟수(1–3). 구기록에는 없을 수 있다. */
  attempts?: number;
}

// 실패는 토스트 한 번으로 끝나서 나중에 "왜 프린터가 안 찍혔지"를 확인할 방법이 없었다 —
// 마지막 실패 시각/메시지만 최소한으로 남겨서 설정 화면에서 바로 보여준다.
export async function getLastWebhookFailure(): Promise<WebhookFailure | null> {
  const raw = await getSetting(LAST_FAILURE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WebhookFailure;
  } catch {
    return null;
  }
}

export async function clearLastWebhookFailure(): Promise<void> {
  await prisma.setting.deleteMany({ where: { key: LAST_FAILURE_KEY } });
}

export type InventoryWebhookEvent = "item.updated" | "item.print_requested";

interface WebhookBarcode {
  id: string;
  value: string;
  symbology: string;
  isPrimary: boolean;
}

interface WebhookItem {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  locationId: string | null;
  location?: { name: string } | null;
  barcodes: WebhookBarcode[];
}

export interface InventoryWebhookPayload {
  event: InventoryWebhookEvent;
  itemId: string;
  name: string;
  quantity: number;
  unit: string | null;
  locationId: string | null;
  locationName: string | null;
  barcodeValue: string | null;
  symbology: string | null;
  labelImageUrl: string | null;
  timestamp: string;
}

// 재고 이벤트 웹훅을 받는 쪽(웹훅 지원 프린터/라벨 기기 자동화)이 어떤 제품인지 이 서버는
// 몰라도 된다 — 각 기기 고유의 페이로드/기기ID 같은 세부사항은 전혀 다루지 않고, 최소한의
// 데이터 + (선택 사항인) 라벨 이미지 URL만 던진다. barcodeValue/symbology만으로도 받는 쪽에서
// 바코드/QR을 직접 렌더링할 수 있으므로 이미지 URL이 없어도 무방하다 (docs/ROADMAP.md 참고).
export function buildLabelImageUrl(barcodeId: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/barcodes/${barcodeId}/label.png`;
}

// 순수 함수로 분리 — 네트워크/DB 없이 페이로드 구성 로직만 테스트할 수 있게 한다.
// baseUrl은 호출부(fireInventoryWebhook)가 Setting("APP_PUBLIC_URL") → env 순으로 미리 구해서 넘긴다.
export function buildWebhookPayload(
  event: InventoryWebhookEvent,
  item: WebhookItem,
  baseUrl: string,
  barcodeId?: string,
): InventoryWebhookPayload {
  const target = barcodeId
    ? item.barcodes.find((b) => b.id === barcodeId)
    : (item.barcodes.find((b) => b.isPrimary) ?? item.barcodes[0]);

  return {
    event,
    itemId: item.id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    locationId: item.locationId,
    locationName: item.location?.name ?? null,
    barcodeValue: target?.value ?? null,
    symbology: target?.symbology ?? null,
    labelImageUrl: target ? buildLabelImageUrl(target.id, baseUrl) : null,
    timestamp: new Date().toISOString(),
  };
}

/** HMAC-SHA256 서명. 수신 측이 발신자를 검증할 수 있게 한다. body는 실제 전송 바이트와 동일해야 한다. */
export function signWebhookBody(secret: string, timestampSec: number, body: string): string {
  const mac = createHmac("sha256", secret).update(`${timestampSec}.${body}`).digest("hex");
  return `sha256=${mac}`;
}

/**
 * 4xx는 설정 오류라 반복해도 동일 — 재시도하지 않는다.
 * 5xx / 네트워크·타임아웃(status 없음)만 재시도 대상.
 */
export function isWebhookRetryableFailure(status: number | undefined): boolean {
  if (status === undefined) return true;
  return status >= 500 && status < 600;
}

/** 0-based attempt index → 다음 시도 전 대기 ms. 범위 밖이면 마지막 간격을 쓴다. */
export function webhookBackoffMs(attemptIndex: number): number {
  if (attemptIndex <= 0) return WEBHOOK_BACKOFF_MS[0];
  return WEBHOOK_BACKOFF_MS[Math.min(attemptIndex, WEBHOOK_BACKOFF_MS.length - 1)] ?? 4000;
}

export async function isInventoryWebhookConfigured(): Promise<boolean> {
  const url = await getSetting("INVENTORY_WEBHOOK_URL", process.env.INVENTORY_WEBHOOK_URL);
  return Boolean(url);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fire-and-forget: 웹훅 수신 쪽 문제(다운/타임아웃)가 재고 CRUD를 막아서는 안 되므로
// 호출부는 await 하지 않는다. 프로세스 메모리에서만 재시도하므로 재시작 시 진행 중 재시도는 유실된다.
export async function fireInventoryWebhook(
  event: InventoryWebhookEvent,
  item: WebhookItem,
  barcodeId?: string,
): Promise<void> {
  const url = await getSetting("INVENTORY_WEBHOOK_URL", process.env.INVENTORY_WEBHOOK_URL);
  if (!url) return;

  const baseUrl = (await getSetting("APP_PUBLIC_URL", process.env.APP_PUBLIC_URL)) || DEFAULT_APP_PUBLIC_URL;
  const payload = buildWebhookPayload(event, item, baseUrl, barcodeId);
  // stringify 결과를 변수에 담아 서명과 body에 같은 바이트를 쓴다.
  const body = JSON.stringify(payload);
  const secret = await getSetting("INVENTORY_WEBHOOK_SECRET");

  let lastError = "unknown";
  let attempts = 0;

  for (let i = 0; i < WEBHOOK_MAX_ATTEMPTS; i++) {
    const wait = webhookBackoffMs(i);
    if (wait > 0) await sleep(wait);
    attempts = i + 1;

    // 매 시도마다 타임스탬프·서명을 새로 만든다 — 수신 측이 신선도를 검사할 수 있다.
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (secret) {
      const ts = Math.floor(Date.now() / 1000);
      headers["X-Stash-Timestamp"] = String(ts);
      headers["X-Stash-Signature"] = signWebhookBody(secret, ts, body);
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        await clearLastWebhookFailure();
        return;
      }
      lastError = `HTTP ${res.status}`;
      if (!isWebhookRetryableFailure(res.status)) break;
    } catch (err: any) {
      lastError = err.message || String(err);
      // 네트워크/타임아웃 → 재시도
    }
  }

  await setSetting(
    LAST_FAILURE_KEY,
    JSON.stringify({
      at: new Date().toISOString(),
      message: lastError,
      attempts,
    } satisfies WebhookFailure),
  );
}
