import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { sendLocalizedPushToAllUsers } from "../lib/push.js";
import { getSetting, setSetting } from "../lib/settings.js";

const MAX_NAMES_IN_BODY = 5;
const MIN_INTERVAL_DAYS = 6;
const LAST_SENT_KEY = "LOW_STOCK_SUMMARY_LAST_SENT_AT";

const MESSAGES = {
  ko: {
    title: (n: number) => `재고부족 아이템 ${n}개`,
    body: (names: string[], extra: number) => (extra > 0 ? `${names.join(", ")} 외 ${extra}개` : names.join(", ")),
  },
  en: {
    title: (n: number) => `${n} item(s) low on stock`,
    body: (names: string[], extra: number) => (extra > 0 ? `${names.join(", ")} and ${extra} more` : names.join(", ")),
  },
} as const;

function messagesFor(locale: string) {
  return locale === "en" ? MESSAGES.en : MESSAGES.ko;
}

// 순수 함수로 분리해서 DB 없이 문구 조합 로직만 테스트할 수 있게 한다.
export function buildLowStockMessage(
  names: string[],
  total: number,
  locale: string = "ko",
): { title: string; body: string } {
  const m = messagesFor(locale);
  const shown = names.slice(0, MAX_NAMES_IN_BODY);
  const extra = total - shown.length;
  return { title: m.title(total), body: m.body(shown, extra) };
}

// 유통기한 알림과 달리 재고부족은 상태가 바뀌지 않는 한 계속 "부족"이라 아이템별 알림을
// 보내면 며칠이고 똑같은 알림이 반복된다 — 그래서 개별 알림 대신 주기적 요약 하나만 보낸다.
// 서버 재시작마다 다시 보내지 않도록 마지막 발송 시각을 Setting에 저장해 최소 간격을 둔다.
export async function sendLowStockSummary(): Promise<void> {
  const lastSentRaw = await getSetting(LAST_SENT_KEY);
  if (lastSentRaw) {
    const elapsedMs = Date.now() - new Date(lastSentRaw).getTime();
    if (elapsedMs < MIN_INTERVAL_DAYS * 24 * 60 * 60 * 1000) return;
  }

  const candidates = await prisma.item.findMany({
    where: { deletedAt: null, minQuantity: { not: null } },
    orderBy: { name: "asc" },
  });
  const lowStock = candidates.filter((i) => i.minQuantity != null && i.quantity <= i.minQuantity);
  if (lowStock.length === 0) return;

  const names = lowStock.map((i) => i.name);

  await sendLocalizedPushToAllUsers((locale) => ({
    ...buildLowStockMessage(names, lowStock.length, locale),
    url: "/shopping",
  }));
  await setSetting(LAST_SENT_KEY, new Date().toISOString());
}

export function startLowStockSummaryJob(): void {
  sendLowStockSummary().catch((err) => console.error("[low-stock-summary] initial run failed", err));
  // 매주 월요일 오전 9시 — 위 최소 간격 체크가 실제 발송 빈도를 최종적으로 보장한다.
  cron.schedule("0 9 * * 1", () => {
    sendLowStockSummary().catch((err) => console.error("[low-stock-summary] scheduled run failed", err));
  });
}
