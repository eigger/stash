/**
 * Phase 3-B 신선도(재고 신뢰) — 게임 요소를 걷어내도 "언제 확인한 재고인지"가 남는다.
 *
 * 비율 = 임계 안에 확인된 아이템 수 / 전체(삭제 제외).
 * 이미 신선한 걸 다시 찍어도 분자·분모가 안 바뀌고, 안 쓸·오래된 물건을 등록하면
 * 분모만 늘어 비율이 내려간다 — 부풀릴 수 없다. 연속일수(streak) 리셋도 없다. 시간이
 * 지나면 아이템이 하나씩 임계를 넘어 비율이 서서히 내려갈 뿐이다.
 *
 * 확인 시각은 lastAuditedAt을 쓰고, 없으면 createdAt으로 폴백한다. 등록 순간도 상태를
 * 본 것이라 콜드 스타트(전부 null → 첫 화면 8%)를 만들지 않는다. 2년 전 등록·방치는
 * createdAt이 오래돼 그대로 stale이다.
 */

export type FreshnessItemType = "CONSUMABLE" | "ASSET";

export type FreshnessLevel = "fresh" | "aging" | "stale" | "unknown";

/**
 * 아이템 타입별 "아직 믿을 만하다"고 보는 최대 일수.
 * CONSUMABLE 30일: 식료·소모는 한 달만 손 안 대도 수량이 어긋나기 쉽다.
 * ASSET 365일: 공구·기기는 연 1회면 충분하다. 서랍 속 드라이버가 30일에 빨개지면
 * 잔소리가 되어 앱을 안 열게 된다 (지시서 §P2-B).
 * 카테고리별 설정 UI는 1차 범위 밖 — 상수로 시작하고 안 맞을 때 연다.
 */
export const FRESHNESS_THRESHOLD_DAYS = {
  CONSUMABLE: 30,
  ASSET: 365,
} as const;

/** aging 구간 시작 = 임계의 이 비율. 그 전은 fresh(초록). */
export const FRESHNESS_AGING_RATIO = 2 / 3;

export function freshnessThresholdDays(itemType: FreshnessItemType): number {
  return FRESHNESS_THRESHOLD_DAYS[itemType];
}

/** 스캔/재점검 시각이 없으면 등록 시각 — 둘 다 없으면 null. */
export function effectiveAuditedAt(
  lastAuditedAt: Date | string | null | undefined,
  createdAt?: Date | string | null,
): Date | string | null {
  return lastAuditedAt ?? createdAt ?? null;
}

/** 유효 확인 시각이 없으면 null. */
export function daysSinceAudit(
  lastAuditedAt: Date | string | null | undefined,
  now: Date = new Date(),
  createdAt?: Date | string | null,
): number | null {
  const atRaw = effectiveAuditedAt(lastAuditedAt, createdAt);
  if (!atRaw) return null;
  const at = typeof atRaw === "string" ? new Date(atRaw) : atRaw;
  if (Number.isNaN(at.getTime())) return null;
  const ms = now.getTime() - at.getTime();
  return Math.max(0, ms / (1000 * 60 * 60 * 24));
}

export function freshnessLevel(
  lastAuditedAt: Date | string | null | undefined,
  itemType: FreshnessItemType,
  now: Date = new Date(),
  createdAt?: Date | string | null,
): FreshnessLevel {
  const days = daysSinceAudit(lastAuditedAt, now, createdAt);
  if (days === null) return "unknown";
  const threshold = freshnessThresholdDays(itemType);
  if (days > threshold) return "stale";
  if (days > threshold * FRESHNESS_AGING_RATIO) return "aging";
  return "fresh";
}

/** 가구/위치 비율의 분자에 넣을지 — fresh·aging만 true (임계 안). */
export function isTrustedFresh(
  lastAuditedAt: Date | string | null | undefined,
  itemType: FreshnessItemType,
  now: Date = new Date(),
  createdAt?: Date | string | null,
): boolean {
  const level = freshnessLevel(lastAuditedAt, itemType, now, createdAt);
  return level === "fresh" || level === "aging";
}

export type FreshnessRatio = {
  freshCount: number;
  totalCount: number;
  /** 0–1. total이 0이면 1 (빈 창고를 빨간 경고로 만들지 않음). */
  ratio: number;
};

export type FreshnessItemInput = {
  lastAuditedAt: Date | string | null | undefined;
  createdAt?: Date | string | null;
  itemType: FreshnessItemType;
};

export function computeFreshnessRatio(items: FreshnessItemInput[], now: Date = new Date()): FreshnessRatio {
  const totalCount = items.length;
  if (totalCount === 0) return { freshCount: 0, totalCount: 0, ratio: 1 };
  let freshCount = 0;
  for (const item of items) {
    if (isTrustedFresh(item.lastAuditedAt, item.itemType, now, item.createdAt)) freshCount += 1;
  }
  return { freshCount, totalCount, ratio: freshCount / totalCount };
}

/** UI용 0–100 정수. */
export function freshnessPercent(ratio: number): number {
  return Math.round(ratio * 100);
}

export type FreshnessTone = "good" | "ok" | "dim" | "empty";

/** 위치/가구 비율 → 색 톤. 전부 빨갛게 만들지 않는다. */
export function freshnessTone(ratio: FreshnessRatio): FreshnessTone {
  if (ratio.totalCount === 0) return "empty";
  if (ratio.ratio >= 0.7) return "good";
  if (ratio.ratio >= 0.4) return "ok";
  return "dim";
}
