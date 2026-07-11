"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { ItemCard } from "../../components/ItemCard";
import type { Item, Location, Category } from "../../lib/types";

export default function ItemsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t } = useLocale();
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [locationId, setLocationId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    apiJson<Location[]>("/api/locations").then(setLocations);
    apiJson<Category[]>("/api/categories").then(setCategories);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setBusy(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (locationId) params.set("locationId", locationId);
    if (categoryId) params.set("categoryId", categoryId);
    apiJson<Item[]>(`/api/items?${params.toString()}`)
      .then(setItems)
      .finally(() => setBusy(false));
  }, [user, q, locationId, categoryId]);

  if (loading || !user) return null;

  return (
    <main className="container">
      <div className="page-header">
        <h1>{t("itemsTitle")}</h1>
        <a href="/items/new"><button>{t("registerManually")}</button></a>
      </div>

      <div className="form" style={{ marginBottom: 16 }}>
        <input placeholder={t("searchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
        <div style={{ display: "flex", gap: 8 }}>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">{t("allLocations")}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t("allCategories")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {busy && <p>{t("loading")}</p>}
      {!busy && items.length === 0 && <p className="scan-hint">{t("noItems")}</p>}
      {items.map((item) => (
        <ItemCard key={item.id} item={item} />
      ))}
    </main>
  );
}
