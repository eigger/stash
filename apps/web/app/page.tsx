"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useLocale } from "../lib/i18n/locale-context";
import { ItemCard } from "../components/ItemCard";
import type { Item } from "../lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t } = useLocale();
  const [lowStock, setLowStock] = useState<Item[]>([]);
  const [expiringSoon, setExpiringSoon] = useState<Item[]>([]);
  const [recent, setRecent] = useState<Item[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      apiJson<Item[]>("/api/items?lowStock=true"),
      apiJson<Item[]>("/api/items?expiringSoon=true"),
      apiJson<Item[]>("/api/items"),
    ])
      .then(([low, expiring, all]) => {
        setLowStock(low);
        setExpiringSoon(expiring);
        setRecent(all.slice(0, 8));
      })
      .finally(() => setBusy(false));
  }, [user]);

  if (loading || !user) return null;

  return (
    <main className="container">
      <div className="page-header">
        <h1>{t("dashboardTitle")}</h1>
        <a href="/scan"><button>{t("scanButton")}</button></a>
      </div>

      {busy && <p>{t("loading")}</p>}

      {!busy && lowStock.length === 0 && expiringSoon.length === 0 && (
        <p className="scan-hint">{t("noUrgentItems")}</p>
      )}

      {lowStock.length > 0 && (
        <section className="dashboard-section">
          <h2>{t("lowStockSection")} ({lowStock.length})</h2>
          {lowStock.map((item) => (
            <ItemCard key={item.id} item={item} onChange={(updated) => setLowStock((prev) => prev.map((i) => (i.id === updated.id ? updated : i)).filter((i) => i.minQuantity == null || i.quantity <= i.minQuantity))} />
          ))}
        </section>
      )}

      {expiringSoon.length > 0 && (
        <section className="dashboard-section">
          <h2>{t("expiringSection")} ({expiringSoon.length})</h2>
          {expiringSoon.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </section>
      )}

      <section className="dashboard-section">
        <h2>{t("recentSection")}</h2>
        {recent.map((item) => (
          <ItemCard key={item.id} item={item} />
        ))}
      </section>
    </main>
  );
}
