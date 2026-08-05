/** 위치 flat 목록을 부모 바로 아래 자식이 이어지는 DFS 순서로 펼친다. */
export function buildOrderedLocationTree<T extends { id: string; parentId: string | null }>(
  locations: T[],
): { location: T; depth: number }[] {
  const byParent = new Map<string | null, T[]>();
  for (const loc of locations) {
    const key = loc.parentId ?? null;
    const list = byParent.get(key);
    if (list) list.push(loc);
    else byParent.set(key, [loc]);
  }

  const result: { location: T; depth: number }[] = [];
  const visited = new Set<string>();

  function walk(parentKey: string | null, depth: number) {
    for (const child of byParent.get(parentKey) ?? []) {
      result.push({ location: child, depth });
      visited.add(child.id);
      walk(child.id, depth + 1);
    }
  }
  walk(null, 0);

  // 부모가 사라진 orphan은 목록에서 조용히 빠지지 않게 맨 끝에 붙인다.
  for (const loc of locations) {
    if (!visited.has(loc.id)) result.push({ location: loc, depth: 0 });
  }
  return result;
}
