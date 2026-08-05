import { API_URL } from "./api";

/** DB에 저장하는 상대 photoUrl 경로를 만든다. */
export function photoUrlFromFilePath(filePath: string): string {
  return `/api/attachments/file/${filePath}`;
}

/**
 * photoUrl이 상대 경로면 API_URL을 붙이고, 구 절대 URL이면 그대로 쓴다.
 * (마이그레이션 전 캐시/미적용 행 호환)
 */
export function resolvePhotoUrl(photoUrl: string | null | undefined): string | null {
  if (!photoUrl) return null;
  if (photoUrl.startsWith("http://") || photoUrl.startsWith("https://")) return photoUrl;
  if (photoUrl.startsWith("/")) return `${API_URL}${photoUrl}`;
  return `${API_URL}/${photoUrl}`;
}

/** 대표 사진 매칭 — 절대/상대 URL 모두 filePath 기준으로 비교한다. */
export function photoUrlMatches(photoUrl: string | null | undefined, filePath: string): boolean {
  if (!photoUrl) return false;
  const relative = photoUrlFromFilePath(filePath);
  return (
    photoUrl === relative ||
    photoUrl.endsWith(relative) ||
    photoUrl.endsWith(`/api/attachments/file/${filePath}`) ||
    photoUrl.endsWith(`/${filePath}`)
  );
}
