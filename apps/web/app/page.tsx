"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useLocale } from "../lib/i18n/locale-context";
import { ItemCard } from "../components/ItemCard";
import type { Item } from "../lib/types";

interface ItemStats {
  totalItems: number;
  totalValueByCurrency: Record<string, number>;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t } = useLocale();
  const [lowStock, setLowStock] = useState<Item[]>([]);
  const [expiringSoon, setExpiringSoon] = useState<Item[]>([]);
  const [recent, setRecent] = useState<Item[]>([]);
  const [stats, setStats] = useState<ItemStats | null>(null);
  const [busy, setBusy] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    setLoadFailed(false);
    Promise.all([
      apiJson<Item[]>("/api/items?lowStock=true"),
      apiJson<Item[]>("/api/items?expiringSoon=true"),
      apiJson<Item[]>("/api/items?limit=8"),
      apiJson<ItemStats>("/api/items/stats"),
    ])
      .then(([low, expiring, recentItems, itemStats]) => {
        setLowStock(low);
        setExpiringSoon(expiring);
        setRecent(recentItems);
        setStats(itemStats);
      })
      // Promise.all에 catch가 없으면 하나라도 실패할 때 recent가 빈 배열로 남아,
      // 아이템이 실제로 있는 사용자에게 "아직 등록된 아이템이 없습니다" 온보딩 카드가
      // 잘못 뜬다 — 일시적인 네트워크 오류와 진짜 빈 상태를 구분해야 한다.
      .catch(() => setLoadFailed(true))
      .finally(() => setBusy(false));
  }, [user]);

  if (loading || !user) return null;

  return (
    <main className="container">
      <div className="page-header">
        <h1>{t("dashboardTitle")}</h1>
        <a href="/scan"><button>{t("scanButton")}</button></a>
      </div>

      {stats && Object.keys(stats.totalValueByCurrency).length > 0 && (
        <p className="meta">
          {t("totalValueLabel")}:{" "}
          {Object.entries(stats.totalValueByCurrency)
            .map(([currency, value]) => `${value.toLocaleString()} ${currency}`)
            .join(", ")}
        </p>
      )}

      {busy && <p>{t("loading")}</p>}

      {!busy && loadFailed && <p className="error-text">{t("dashboardLoadFailed")}</p>}

      {!busy && !loadFailed && recent.length === 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{t("onboardingTitle")}</h2>
          <p className="meta">{t("onboardingHint")}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <a href="/scan"><button style={{ width: "100%" }}>{t("scanButton")}</button></a>
            <a href="/locations"><button className="secondary" style={{ width: "100%" }}>{t("manageLocations")}</button></a>
            <a href="/categories"><button className="secondary" style={{ width: "100%" }}>{t("manageCategories")}</button></a>
          </div>
        </div>
      )}

      {!busy && !loadFailed && recent.length > 0 && lowStock.length === 0 && expiringSoon.length === 0 && (
        <p className="scan-hint">{t("noUrgentItems")}</p>
      )}

      {lowStock.length > 0 && (
        <section className="dashboard-section">
          <div className="page-header" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>{t("lowStockSection")} ({lowStock.length})</h2>
            <a href="/shopping"><button className="secondary">{t("shoppingListLink")}</button></a>
          </div>
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

      {recent.length > 0 && (
        <section className="dashboard-section">
          <h2>{t("recentSection")}</h2>
          {recent.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </section>
      )}
    </main>
  );
}
