import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDday } from "./expiryNotifications.js";

describe("formatDday", () => {
  // expiryDate/warrantyExpiresAt은 <input type="date">에서 온 값이라 항상 자정(UTC) 기준으로
  // 저장된다 — "지금"은 하루 중 임의 시각(여기선 새벽 알림 잡 시각인 08:00 UTC)이므로, 날짜 입력
  // 특성에 맞춘 자정 기준 날짜로 테스트해야 실제 알림 잡 동작과 일치한다.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T08:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 오늘 when the date is today", () => {
    expect(formatDday(new Date("2026-01-10T00:00:00Z"))).toBe("오늘");
  });

  it("returns a D-N countdown for future dates", () => {
    expect(formatDday(new Date("2026-01-13T00:00:00Z"))).toBe("D-3");
  });

  it("returns 지남 for past dates", () => {
    expect(formatDday(new Date("2026-01-05T00:00:00Z"))).toBe("지남");
  });

  it("defaults to Korean when no locale is given", () => {
    expect(formatDday(new Date("2026-01-10T00:00:00Z"))).toBe(formatDday(new Date("2026-01-10T00:00:00Z"), "ko"));
  });

  it("returns English wording for locale=en", () => {
    expect(formatDday(new Date("2026-01-10T00:00:00Z"), "en")).toBe("today");
    expect(formatDday(new Date("2026-01-13T00:00:00Z"), "en")).toBe("D-3");
    expect(formatDday(new Date("2026-01-05T00:00:00Z"), "en")).toBe("overdue");
  });

  it("falls back to Korean for any locale other than en", () => {
    expect(formatDday(new Date("2026-01-10T00:00:00Z"), "fr")).toBe("오늘");
  });
});
