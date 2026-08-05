import type { XpAward } from "@stash/shared";
import { prisma } from "./prisma.js";
import { getSetting } from "./settings.js";

/**
 * 확정 XP만 Setting에 누적한다. 품질 XP는 아이템 상태에서 파생(sumQualityXp).
 * 키를 분리해 예전 HOUSEHOLD_XP_TOTAL(품질+확정 혼합)과 섞이지 않게 한다.
 */
export const HOUSEHOLD_CONFIRM_XP_KEY = "HOUSEHOLD_CONFIRM_XP";

export async function getConfirmXp(): Promise<number> {
  const raw = await getSetting(HOUSEHOLD_CONFIRM_XP_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/**
 * 원자적 가산 — read-modify-write 레이스를 피한다.
 * void로 던져도 동시 스캔/확정이 서로 덮어쓰지 않는다.
 */
export async function grantConfirmXp(award: XpAward): Promise<{ confirmTotal: number; awarded: number }> {
  if (award.total <= 0) {
    return { confirmTotal: await getConfirmXp(), awarded: 0 };
  }

  // Setting.value는 문자열이므로 bigint 캐스팅으로 증가. upsert를 한 문장으로.
  await prisma.$executeRaw`
    INSERT INTO "Setting" ("key", "value", "updatedAt")
    VALUES (${HOUSEHOLD_CONFIRM_XP_KEY}, ${String(award.total)}, CURRENT_TIMESTAMP)
    ON CONFLICT ("key") DO UPDATE
    SET
      "value" = (COALESCE(NULLIF("Setting"."value", ''), '0')::bigint + ${award.total}::bigint)::text,
      "updatedAt" = CURRENT_TIMESTAMP
  `;

  return { confirmTotal: await getConfirmXp(), awarded: award.total };
}
