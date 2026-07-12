"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { useLocale } from "../../lib/i18n/locale-context";
import type { Location } from "../../lib/types";

export default function LocationsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { show } = useToast();
  const { t } = useLocale();
  const [locations, setLocations] = useState<Location[]>([]);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  async function refresh() {
    setLocations(await apiJson<Location[]>("/api/locations"));
  }

  useEffect(() => {
    if (user) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await apiJson("/api/locations", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), parentId: parentId || null }),
      });
      setName("");
      setParentId("");
      await refresh();
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("confirmDeleteLocation"))) return;
    try {
      await apiJson(`/api/locations/${id}`, { method: "DELETE" });
      await refresh();
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  // 부모-자식 관계를 화면에서 바로 알아볼 수 있도록, 부모 바로 아래에 자식이 이어지는
  // depth-first 순서로 펼치고 들여쓰기로 계층을 표시한다 — 기존에는 등록 순서로만
  // 나열돼 "이게 어디 밑에 있는 위치인지" 텍스트를 읽어야만 알 수 있었다.
  function buildOrderedTree(): { location: Location; depth: number }[] {
    const byParent = new Map<string | null, Location[]>();
    for (const l of locations) {
      const key = l.parentId ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(l);
    }
    const result: { location: Location; depth: number }[] = [];
    const visited = new Set<string>();
    function walk(parentKey: string | null, depth: number) {
      for (const child of byParent.get(parentKey) ?? []) {
        result.push({ location: child, depth });
        visited.add(child.id);
        walk(child.id, depth + 1);
      }
    }
    walk(null, 0);
    // 부모가 삭제됐거나 순환 참조 등으로 어디에도 안 걸린 위치가 있으면(정상 동작에서는
    // 안 생기지만) 목록에서 조용히 사라지지 않도록 맨 끝에라도 붙여준다.
    for (const l of locations) {
      if (!visited.has(l.id)) result.push({ location: l, depth: 0 });
    }
    return result;
  }

  if (loading || !user) return null;

  const orderedLocations = buildOrderedTree();

  return (
    <main className="container">
      <h1>{t("locationsTitle")}</h1>
      <form onSubmit={handleSubmit} className="form" style={{ marginBottom: 16 }}>
        <input placeholder={t("newLocationPlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">{t("noParentLocation")}</option>
          {orderedLocations.map(({ location: l, depth }) => (
            <option key={l.id} value={l.id}>
              {"— ".repeat(depth)}
              {l.name}
            </option>
          ))}
        </select>
        <button type="submit">{t("add")}</button>
      </form>

      {orderedLocations.map(({ location: l, depth }) => (
        <div key={l.id} className="tree-row" style={{ paddingLeft: depth * 20 }}>
          <div>
            {depth > 0 && <span className="meta">└ </span>}
            {l.name}
            <span className="meta"> · {t("itemCount", { n: l._count?.items ?? 0 })}</span>
          </div>
          <button className="secondary" onClick={() => handleDelete(l.id)}>
            {t("delete")}
          </button>
        </div>
      ))}
    </main>
  );
}
