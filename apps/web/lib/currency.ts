// 아이템 등록 폼의 통화 입력란에 미리 채워줄 기본 통화 — 설정 화면에서 한 번 고르면
// 매번 "KRW"/"USD"를 직접 타이핑하지 않아도 되게 한다.
const STORAGE_KEY = "stash_default_currency";

export function loadDefaultCurrency(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export function saveDefaultCurrency(value: string): void {
  localStorage.setItem(STORAGE_KEY, value);
}
