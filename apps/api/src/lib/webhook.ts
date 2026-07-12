import { getSetting } from "./settings.js";

const DEFAULT_APP_PUBLIC_URL = "http://localhost:3000";

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
): InventoryWebhookPayload {
  const primary = item.barcodes.find((b) => b.isPrimary) ?? item.barcodes[0];

  return {
    event,
    itemId: item.id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    locationId: item.locationId,
    locationName: item.location?.name ?? null,
    barcodeValue: primary?.value ?? null,
    symbology: primary?.symbology ?? null,
    labelImageUrl: primary ? buildLabelImageUrl(primary.id, baseUrl) : null,
    timestamp: new Date().toISOString(),
  };
}

export async function isInventoryWebhookConfigured(): Promise<boolean> {
  const url = await getSetting("INVENTORY_WEBHOOK_URL", process.env.INVENTORY_WEBHOOK_URL);
  return Boolean(url);
}

// Fire-and-forget: 웹훅 수신 쪽 문제(다운/타임아웃)가 재고 CRUD를 막아서는 안 되므로
// 실패는 조용히 무시한다. 설정된 웹훅이 없으면 아무 것도 하지 않는다.
export async function fireInventoryWebhook(event: InventoryWebhookEvent, item: WebhookItem): Promise<void> {
  const url = await getSetting("INVENTORY_WEBHOOK_URL", process.env.INVENTORY_WEBHOOK_URL);
  if (!url) return;

  const baseUrl = (await getSetting("APP_PUBLIC_URL", process.env.APP_PUBLIC_URL)) || DEFAULT_APP_PUBLIC_URL;
  const payload = buildWebhookPayload(event, item, baseUrl);

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // 재시도는 웹훅을 받는 쪽 자동화의 몫 — 여기서는 그냥 무시한다.
  }
}
