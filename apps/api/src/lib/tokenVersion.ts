import { prisma } from "./prisma.js";

// authenticate 매 요청마다 DB를 치면 연속 스캔(POST /api/items/scan) 성능이 죽는다.
// 60초 인메모리 캐시로 조회를 줄이되, 그 창 안에서는 비밀번호 변경·로그아웃·삭제 반영이
// 최대 60초 지연될 수 있다는 트레이드오프를 감수한다. requireAdmin의 role 재조회는
// 캐시하지 않는다(관리자 라우트는 호출 빈도가 낮고 권한 강등이 즉시 반영돼야 함).
const CACHE_TTL_MS = 60_000;

const cache = new Map<string, { version: number; expiresAt: number }>();

export async function getCachedTokenVersion(userId: string): Promise<number | null> {
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.version;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokenVersion: true },
  });
  if (!user) {
    cache.delete(userId);
    return null;
  }
  cache.set(userId, { version: user.tokenVersion, expiresAt: Date.now() + CACHE_TTL_MS });
  return user.tokenVersion;
}

export function invalidateTokenVersionCache(userId: string): void {
  cache.delete(userId);
}

export async function bumpTokenVersion(userId: string): Promise<number> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });
  invalidateTokenVersionCache(userId);
  return user.tokenVersion;
}
