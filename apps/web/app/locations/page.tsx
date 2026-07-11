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

  function parentName(id: string | null) {
    return locations.find((l) => l.id === id)?.name;
  }

  if (loading || !user) return null;

  return (
    <main className="container">
      <h1>{t("locationsTitle")}</h1>
      <form onSubmit={handleSubmit} className="form" style={{ marginBottom: 16 }}>
        <input placeholder={t("newLocationPlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">{t("noParentLocation")}</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button type="submit">{t("add")}</button>
      </form>

      {locations.map((l) => (
        <div key={l.id} className="tree-row">
          <div>
            {l.name}
            {l.parentId && <span className="meta"> · {t("subOf", { name: parentName(l.parentId) ?? "" })}</span>}
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
