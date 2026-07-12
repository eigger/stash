// 아이템 등록 폼에서 자주 쓰는 위치/카테고리를 최근 선택 순으로 기억해뒀다가 상단에
// 빠른 선택 칩으로 보여준다 — 매번 드롭다운을 끝까지 훑지 않아도 되게 하기 위함.
const MAX_RECENT = 5;

export const RECENT_LOCATIONS_KEY = "stash_recent_locations";
export const RECENT_CATEGORIES_KEY = "stash_recent_categories";

export function loadRecentIds(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function pushRecentId(key: string, id: string): void {
  if (!id) return;
  const current = loadRecentIds(key);
  const next = [id, ...current.filter((existing) => existing !== id)].slice(0, MAX_RECENT);
  localStorage.setItem(key, JSON.stringify(next));
}
