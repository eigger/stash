"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { useLocale } from "../../lib/i18n/locale-context";
import type { Category } from "../../lib/types";

export default function CategoriesPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { show } = useToast();
  const { t } = useLocale();
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  async function refresh() {
    setCategories(await apiJson<Category[]>("/api/categories"));
  }

  useEffect(() => {
    if (user) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await apiJson("/api/categories", {
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
    if (!confirm(t("confirmDeleteCategory"))) return;
    try {
      await apiJson(`/api/categories/${id}`, { method: "DELETE" });
      await refresh();
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  function parentName(id: string | null) {
    return categories.find((c) => c.id === id)?.name;
  }

  if (loading || !user) return null;

  return (
    <main className="container">
      <h1>{t("categoriesTitle")}</h1>
      <form onSubmit={handleSubmit} className="form" style={{ marginBottom: 16 }}>
        <input placeholder={t("newCategoryPlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">{t("noParentCategory")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit">{t("add")}</button>
      </form>

      {categories.map((c) => (
        <div key={c.id} className="tree-row">
          <div>
            {c.name}
            {c.parentId && <span className="meta"> · {t("subOf", { name: parentName(c.parentId) ?? "" })}</span>}
            <span className="meta"> · {t("itemCount", { n: c._count?.items ?? 0 })}</span>
          </div>
          <button className="secondary" onClick={() => handleDelete(c.id)}>
            {t("delete")}
          </button>
        </div>
      ))}
    </main>
  );
}
