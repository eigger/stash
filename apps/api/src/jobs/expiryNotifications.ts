import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { sendLocalizedPushToAllUsers } from "../lib/push.js";

// 이 안에 들어오면(과거 포함) "임박"으로 취급해 알림을 보낸다.
const LOOKAHEAD_DAYS = 3;

// PushSubscription.locale(가입 시점의 앱 언어)에 맞춰 알림 문구를 고른다 — apps/web의
// UI 문자열은 lib/i18n/translations.ts에 있지만, 이건 서버가 자체적으로 생성해 보내는
// 배치 알림이라 별도의 작은 사전을 둔다.
const MESSAGES = {
  ko: {
    dday: (date: Date) => {
      const days = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (days < 0) return "지남";
      if (days === 0) return "오늘";
      return `D-${days}`;
    },
    expiryTitle: "유통기한 임박",
    expiryBody: (name: string, dday: string) => `${name} — 유통기한 ${dday}`,
    warrantyTitle: "보증 만료 임박",
    warrantyBody: (name: string, dday: string) => `${name} — 보증 만료 ${dday}`,
  },
  en: {
    dday: (date: Date) => {
      const days = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (days < 0) return "overdue";
      if (days === 0) return "today";
      return `D-${days}`;
    },
    expiryTitle: "Expiry approaching",
    expiryBody: (name: string, dday: string) => `${name} — expires ${dday}`,
    warrantyTitle: "Warranty expiring soon",
    warrantyBody: (name: string, dday: string) => `${name} — warranty expires ${dday}`,
  },
} as const;

function messagesFor(locale: string) {
  return locale === "en" ? MESSAGES.en : MESSAGES.ko;
}

// 테스트/외부에서 "지금 시점 기준 D-day 문구"만 필요할 때 쓰는 순수 함수.
export function formatDday(date: Date, locale: string = "ko"): string {
  return messagesFor(locale).dday(date);
}

// 유통기한/보증만료가 임박했지만 아직 알림을 보내지 않은 아이템을 찾아 전체 사용자에게
// (각자의 구독 locale에 맞는 문구로) 푸시를 보내고, 같은 날짜로 다시 보내지 않도록
// notifiedAt을 찍는다. 날짜를 바꾸면 items.ts의 PATCH 핸들러가 notifiedAt을 초기화해서
// 다시 알림 대상이 되게 한다.
export async function sendExpiryNotifications(): Promise<void> {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + LOOKAHEAD_DAYS);

  const [expiring, warrantyExpiring] = await Promise.all([
    prisma.item.findMany({
      where: { deletedAt: null, expiryDate: { not: null, lte: threshold }, expiryNotifiedAt: null },
    }),
    prisma.item.findMany({
      where: { deletedAt: null, warrantyExpiresAt: { not: null, lte: threshold }, warrantyNotifiedAt: null },
    }),
  ]);

  for (const item of expiring) {
    await sendLocalizedPushToAllUsers((locale) => {
      const m = messagesFor(locale);
      return { title: m.expiryTitle, body: m.expiryBody(item.name, m.dday(item.expiryDate!)), url: `/items/${item.id}` };
    });
    await prisma.item.update({ where: { id: item.id }, data: { expiryNotifiedAt: new Date() } });
  }

  for (const item of warrantyExpiring) {
    await sendLocalizedPushToAllUsers((locale) => {
      const m = messagesFor(locale);
      return {
        title: m.warrantyTitle,
        body: m.warrantyBody(item.name, m.dday(item.warrantyExpiresAt!)),
        url: `/items/${item.id}`,
      };
    });
    await prisma.item.update({ where: { id: item.id }, data: { warrantyNotifiedAt: new Date() } });
  }
}

export function startExpiryNotificationJob(): void {
  sendExpiryNotifications().catch((err) => console.error("[expiry-notifications] initial run failed", err));
  // 매일 아침 8시
  cron.schedule("0 8 * * *", () => {
    sendExpiryNotifications().catch((err) => console.error("[expiry-notifications] scheduled run failed", err));
  });
}
