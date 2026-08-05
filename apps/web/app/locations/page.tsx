"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { buildOrderedLocationTree } from "../../lib/locationTree";
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

  if (loading || !user) return null;

  const orderedLocations = buildOrderedLocationTree(locations);

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
          <button type="button" className="btn-action btn-action-danger" onClick={() => handleDelete(l.id)}>
            {t("delete")}
          </button>
        </div>
      ))}
    </main>
  );
}
