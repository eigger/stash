function resolveApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  // 배포(Caddy)에서는 same-origin(/api) 호출이 맞고, 로컬 개발에서는 8080 API를 기본값으로 쓴다.
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "http://localhost:8080";
}

export const API_URL = resolveApiUrl();

const TOKEN_KEY = "stash_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !headers.has("Content-Type") && !isFormData) {
    headers.set("Content-Type", "application/json");
  }
  // 서버 에러 메시지도 앱에서 고른 언어(브라우저/OS 설정이 아니라)로 받기 위해 매 요청에 싣는다.
  const locale = typeof window !== "undefined" ? localStorage.getItem("stash_locale") : null;
  if (locale) headers.set("X-Locale", locale);
  return fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" });
}

// apiJson()은 컴포넌트 밖(어떤 페이지에서든 재사용되는 순수 lib 함수)이라 useLocale()의
// t()를 쓸 수 없다 — 그래서 저장된 언어를 localStorage에서 직접 읽어 폴백 메시지만 고른다.
function requestFailedMessage(status: number): string {
  const locale = typeof window !== "undefined" ? localStorage.getItem("stash_locale") : null;
  return locale === "en" ? `Request failed (${status})` : `요청 실패 (${status})`;
}

// 4xx(요청 자체가 잘못됨)와 5xx/네트워크(일시적 문제)를 호출부에서 구분할 수 있어야
// 하는 경우가 있다(예: 오프라인 스캔 큐 재전송 — 영구히 거부된 요청과 "나중에 다시
// 시도하면 될 수도 있는" 요청을 다르게 처리해야 함) — 그래서 상태 코드를 실어 던진다.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    // body.error는 보통 사람이 읽을 문자열이지만(예: "이미 다른 아이템에 등록된 바코드 값입니다"),
    // Zod 검증 실패 시에는 객체(flatten() 결과)로 온다 — 문자열은 그대로, 객체만 JSON.stringify.
    const message =
      typeof body?.error === "string" ? body.error : body?.error ? JSON.stringify(body.error) : requestFailedMessage(res.status);
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
