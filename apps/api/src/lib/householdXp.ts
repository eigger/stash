import type { XpAward } from "@stash/shared";
import { getSetting, setSetting } from "./settings.js";

/** 가구 단위 누적 XP — 개인 순위표 없음. 백업 대상 Setting이 아니라 운영 수치만. */
export const HOUSEHOLD_XP_KEY = "HOUSEHOLD_XP_TOTAL";

export async function getHouseholdXp(): Promise<number> {
  const raw = await getSetting(HOUSEHOLD_XP_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/**
 * 가구 XP 가산. 순수 계산(compute*)과 분리 — DB 왕복은 여기만.
 * 스캔 경로에서는 await 하지 말고 void로 던져 응답을 막지 말 것.
 */
export async function grantHouseholdXp(award: XpAward): Promise<{ total: number; awarded: number }> {
  if (award.total <= 0) {
    const total = await getHouseholdXp();
    return { total, awarded: 0 };
  }
  const current = await getHouseholdXp();
  const next = current + award.total;
  await setSetting(HOUSEHOLD_XP_KEY, String(next));
  return { total: next, awarded: award.total };
}
