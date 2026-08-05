import { describe, expect, it } from "vitest";
import {
  computeFreshnessRatio,
  effectiveAuditedAt,
  freshnessLevel,
  freshnessPercent,
  freshnessThresholdDays,
  freshnessTone,
  isTrustedFresh,
} from "@stash/shared";

const day = 24 * 60 * 60 * 1000;

describe("freshness (shared)", () => {
  const now = new Date("2026-08-05T12:00:00Z");

  it("ASSET 임계가 CONSUMABLE보다 훨씬 길다", () => {
    expect(freshnessThresholdDays("ASSET")).toBeGreaterThan(freshnessThresholdDays("CONSUMABLE") * 5);
  });

  it("CONSUMABLE 구간: fresh / aging / stale", () => {
    expect(freshnessLevel(new Date(now.getTime() - 10 * day), "CONSUMABLE", now)).toBe("fresh");
    expect(freshnessLevel(new Date(now.getTime() - 25 * day), "CONSUMABLE", now)).toBe("aging");
    expect(freshnessLevel(new Date(now.getTime() - 40 * day), "CONSUMABLE", now)).toBe("stale");
    expect(freshnessLevel(null, "CONSUMABLE", now)).toBe("unknown");
  });

  it("ASSET 40일은 아직 신뢰 (CONSUMABLE은 stale)", () => {
    expect(isTrustedFresh(new Date(now.getTime() - 40 * day), "ASSET", now)).toBe(true);
    expect(isTrustedFresh(new Date(now.getTime() - 40 * day), "CONSUMABLE", now)).toBe(false);
  });

  it("lastAuditedAt이 없으면 createdAt으로 폴백 (콜드 스타트)", () => {
    expect(effectiveAuditedAt(null, new Date(now.getTime() - 5 * day))).toEqual(
      new Date(now.getTime() - 5 * day),
    );
    expect(isTrustedFresh(null, "CONSUMABLE", now, new Date(now.getTime() - 5 * day))).toBe(true);
    // 2년 전 등록·방치는 여전히 stale — 오래된 데이터를 숨기지 않는다.
    expect(isTrustedFresh(null, "CONSUMABLE", now, new Date(now.getTime() - 800 * day))).toBe(false);
  });

  it("비율: 확인 시각·등록 시각 모두 없으면 분모만, 빈 목록은 1", () => {
    expect(computeFreshnessRatio([], now)).toEqual({ freshCount: 0, totalCount: 0, ratio: 1 });
    const ratio = computeFreshnessRatio(
      [
        { lastAuditedAt: new Date(now.getTime() - 5 * day), itemType: "CONSUMABLE" },
        { lastAuditedAt: null, createdAt: null, itemType: "CONSUMABLE" },
        { lastAuditedAt: new Date(now.getTime() - 100 * day), itemType: "CONSUMABLE" },
      ],
      now,
    );
    expect(ratio).toEqual({ freshCount: 1, totalCount: 3, ratio: 1 / 3 });
    expect(freshnessPercent(ratio.ratio)).toBe(33);
  });

  it("오래된 미확인 물건을 넣으면 비율이 내린다", () => {
    const after = computeFreshnessRatio(
      [
        { lastAuditedAt: new Date(now.getTime() - 5 * day), itemType: "CONSUMABLE" },
        { lastAuditedAt: null, createdAt: new Date(now.getTime() - 800 * day), itemType: "ASSET" },
      ],
      now,
    );
    expect(after.ratio).toBe(0.5);
  });

  it("방금 등록만 한 아이템은 비율을 깎지 않는다 (등록=그 시점 확인)", () => {
    const after = computeFreshnessRatio(
      [
        { lastAuditedAt: new Date(now.getTime() - 5 * day), itemType: "CONSUMABLE" },
        { lastAuditedAt: null, createdAt: now, itemType: "ASSET" },
      ],
      now,
    );
    expect(after.ratio).toBe(1);
  });

  it("tone 구간", () => {
    expect(freshnessTone({ freshCount: 0, totalCount: 0, ratio: 1 })).toBe("empty");
    expect(freshnessTone({ freshCount: 8, totalCount: 10, ratio: 0.8 })).toBe("good");
    expect(freshnessTone({ freshCount: 5, totalCount: 10, ratio: 0.5 })).toBe("ok");
    expect(freshnessTone({ freshCount: 2, totalCount: 10, ratio: 0.2 })).toBe("dim");
  });
});
