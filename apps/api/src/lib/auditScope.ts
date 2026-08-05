/**
 * 위치 트리에서 rootId와 (옵션) 그 하위 위치 id 목록을 모은다.
 * 재점검 세션의 기대 아이템 범위 계산에 쓴다.
 */
export function collectLocationIds(
  locations: { id: string; parentId: string | null }[],
  rootId: string,
  includeChildren: boolean,
): string[] {
  if (!includeChildren) return [rootId];

  const byParent = new Map<string | null, string[]>();
  for (const loc of locations) {
    const key = loc.parentId ?? null;
    const list = byParent.get(key);
    if (list) list.push(loc.id);
    else byParent.set(key, [loc.id]);
  }

  const result: string[] = [];
  function walk(id: string) {
    result.push(id);
    for (const childId of byParent.get(id) ?? []) walk(childId);
  }
  walk(rootId);
  return result;
}

export type AuditProgress = {
  expectedTotal: number;
  foundExpected: number;
  pending: number;
  unexpected: number;
};

/** PENDING/FOUND만 분모에 넣고, UNEXPECTED은 보너스로만 센다. */
export function computeAuditProgress(
  checks: { status: "PENDING" | "FOUND" | "UNEXPECTED" }[],
): AuditProgress {
  let expectedTotal = 0;
  let foundExpected = 0;
  let pending = 0;
  let unexpected = 0;
  for (const c of checks) {
    if (c.status === "UNEXPECTED") {
      unexpected += 1;
      continue;
    }
    expectedTotal += 1;
    if (c.status === "FOUND") foundExpected += 1;
    else pending += 1;
  }
  return { expectedTotal, foundExpected, pending, unexpected };
}
