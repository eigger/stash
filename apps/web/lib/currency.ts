// 아이템 등록 시 자동으로 붙는 기본 통화 — 설정 화면에서 한 번 고르면 등록 폼에서
// 매번 "KRW"/"USD"를 직접 타이핑하지 않아도 되게 한다.
const STORAGE_KEY = "stash_default_currency";
// LocaleProvider(lib/i18n/locale-context.tsx)가 쓰는 키와 동일 — 통화를 아직 한 번도
// 고르지 않은 사용자에게 언어에 맞는 합리적인 기본값(ko→KRW, en→USD)을 보여준다.
const LOCALE_STORAGE_KEY = "stash_locale";

export function loadDefaultCurrency(): string {
  if (typeof window === "undefined") return "KRW";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;
  return localStorage.getItem(LOCALE_STORAGE_KEY) === "en" ? "USD" : "KRW";
}

export function saveDefaultCurrency(value: string): void {
  localStorage.setItem(STORAGE_KEY, value);
}
