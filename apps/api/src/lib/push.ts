import webpush from "web-push";
import { prisma } from "./prisma.js";
import { getSetting, setSetting } from "./settings.js";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface LocalizedPushSubscriptionRow extends PushSubscriptionRow {
  locale: string;
}

export type PushPayloadBuilder = (locale: string) => PushPayload;

async function getVapidConfig(): Promise<{ publicKey: string; privateKey: string; subject: string } | null> {
  const [publicKey, privateKey, subject] = await Promise.all([
    getSetting("VAPID_PUBLIC_KEY"),
    getSetting("VAPID_PRIVATE_KEY"),
    getSetting("VAPID_SUBJECT"),
  ]);
  if (!publicKey?.trim() || !privateKey?.trim()) return null;

  return {
    publicKey: publicKey.trim(),
    privateKey: privateKey.trim(),
    subject: subject?.trim() || "mailto:admin@stash.local",
  };
}

export async function isPushConfigured(): Promise<boolean> {
  return (await getVapidConfig()) !== null;
}

export async function getVapidPublicKey(): Promise<string | null> {
  return (await getVapidConfig())?.publicKey ?? null;
}

// 관리 화면에서 버튼 한 번으로 VAPID 키 쌍을 발급해 Setting 테이블에 저장한다
// (.env 수동 편집·서버 재시작 불필요 — 기존 외부 연동 키와 동일한 패턴).
export async function generateAndSaveVapidKeys(): Promise<{ publicKey: string }> {
  const { publicKey, privateKey } = webpush.generateVAPIDKeys();
  await Promise.all([setSetting("VAPID_PUBLIC_KEY", publicKey), setSetting("VAPID_PRIVATE_KEY", privateKey)]);
  return { publicKey };
}

async function ensureWebPush(): Promise<boolean> {
  const config = await getVapidConfig();
  if (!config) return false;
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return true;
}

export async function sendPushToSubscription(sub: PushSubscriptionRow, payload: PushPayload): Promise<void> {
  if (!(await ensureWebPush())) return;

  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      // 구독이 브라우저/기기 쪽에서 만료된 경우 — 다음에도 계속 실패할 것이므로 정리한다.
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
    } else {
      console.error("[push] send failed", sub.id, err);
    }
  }
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  await Promise.all(subs.map((sub) => sendPushToSubscription(sub, payload)));
}

// 가정용 공유 재고이므로 아이템별 접근권한 구분 없이 전체 사용자에게 보낸다.
export async function sendPushToAllUsers(payload: PushPayload): Promise<void> {
  const users = await prisma.user.findMany({ select: { id: true } });
  await Promise.all(users.map((u) => sendPushToUser(u.id, payload)));
}

// 구독마다 저장된 locale(가입 시점의 앱 언어)에 맞춰 다른 문구를 보낼 때 쓴다 — 예:
// 유통기한 알림처럼 서버가 자체적으로 문구를 생성해 보내는 배치성 푸시.
export async function sendLocalizedPushToUser(userId: string, buildPayload: PushPayloadBuilder): Promise<void> {
  const subs: LocalizedPushSubscriptionRow[] = await prisma.pushSubscription.findMany({ where: { userId } });
  await Promise.all(subs.map((sub) => sendPushToSubscription(sub, buildPayload(sub.locale))));
}

export async function sendLocalizedPushToAllUsers(buildPayload: PushPayloadBuilder): Promise<void> {
  const users = await prisma.user.findMany({ select: { id: true } });
  await Promise.all(users.map((u) => sendLocalizedPushToUser(u.id, buildPayload)));
}
