"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useLocale } from "../lib/i18n/locale-context";
import { getPushStatus } from "../lib/push";
import { ItemCard } from "../components/ItemCard";
import type { Item, Location } from "../lib/types";

interface ItemStats {
  totalItems: number;
  totalValueByCurrency: Record<string, number>;
}

interface OnboardingPushStatus {
  configured: boolean;
  subscribed: boolean;
}

// 외부 조회가 실패한 채로 스캔 등록된 아이템의 이름 패턴 — apps/api/src/routes/items.ts의
// /scan 라우트가 만드는 문자열과 반드시 동일해야 한다. 스캔 미니시트에서 바로 못 고치고
// 넘어간 아이템을 여기서 안전망으로 다시 보여준다.
const UNNAMED_ITEM_PREFIX = "미확인 상품 (";

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();
  const { t } = useLocale();
  const [lowStock, setLowStock] = useState<Item[]>([]);
  const [expiringSoon, setExpiringSoon] = useState<Item[]>([]);
  const [needsNaming, setNeedsNaming] = useState<Item[]>([]);
  const [recent, setRecent] = useState<Item[]>([]);
  const [stats, setStats] = useState<ItemStats | null>(null);
  const [busy, setBusy] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [onboardLocations, setOnboardLocations] = useState<Location[]>([]);
  const [pushStatus, setPushStatus] = useState<OnboardingPushStatus>({ configured: false, subscribed: false });
  const [appUrlConfigured, setAppUrlConfigured] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    setLoadFailed(false);
    // 온보딩 체크리스트용 데이터는 대시보드의 핵심 기능이 아니라 부가 정보라, 이 호출들이
    // 실패해도 loadFailed로 이어지지 않게 각자 조용히 폴백한다.
    const settingsPromise = isAdmin
      ? apiJson<{ key: string; hasValue: boolean }[]>("/api/settings").catch(() => [])
      : Promise.resolve([]);
    Promise.all([
      apiJson<Item[]>("/api/items?lowStock=true"),
      apiJson<Item[]>("/api/items?expiringSoon=true"),
      apiJson<Item[]>(`/api/items?q=${encodeURIComponent(UNNAMED_ITEM_PREFIX)}&limit=8`),
      apiJson<Item[]>("/api/items?limit=8"),
      apiJson<ItemStats>("/api/items/stats"),
      apiJson<Location[]>("/api/locations").catch(() => []),
      getPushStatus().catch(() => ({ configured: false, subscribed: false, subscriptionCount: 0 })),
      settingsPromise,
    ])
      .then(([low, expiring, unnamed, recentItems, itemStats, locs, push, settingsRows]) => {
        setLowStock(low);
        setExpiringSoon(expiring);
        setNeedsNaming(unnamed);
        setRecent(recentItems);
        setStats(itemStats);
        setOnboardLocations(locs);
        setPushStatus(push);
        setAppUrlConfigured(Boolean(settingsRows.find((s) => s.key === "APP_PUBLIC_URL")?.hasValue));
      })
      // Promise.all에 catch가 없으면 하나라도 실패할 때 recent가 빈 배열로 남아,
      // 아이템이 실제로 있는 사용자에게 "아직 등록된 아이템이 없습니다" 온보딩 카드가
      // 잘못 뜬다 — 일시적인 네트워크 오류와 진짜 빈 상태를 구분해야 한다.
      .catch(() => setLoadFailed(true))
      .finally(() => setBusy(false));
  }, [user, isAdmin]);

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
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
            <div className="onboarding-step">
              <span className={`onboarding-check${onboardLocations.length > 0 ? " done" : ""}`}>
                {onboardLocations.length > 0 ? "✓" : "1"}
              </span>
              <div style={{ flex: 1 }}>
                <strong>{t("onboardStep1Title")}</strong>
                <p className="meta" style={{ margin: 0 }}>{t("onboardStep1Hint")}</p>
              </div>
              <a href="/locations"><button className="secondary">{t("manageLocations")}</button></a>
            </div>
            <div className="onboarding-step">
              <span className={`onboarding-check${pushStatus.subscribed ? " done" : ""}`}>
                {pushStatus.subscribed ? "✓" : "2"}
              </span>
              <div style={{ flex: 1 }}>
                <strong>{t("onboardStep2Title")}</strong>
                <p className="meta" style={{ margin: 0 }}>
                  {pushStatus.configured ? t("onboardStep2Hint") : t("onboardStep2NotConfiguredHint")}
                </p>
              </div>
              <a href="/settings"><button className="secondary">{t("notificationsTitle")}</button></a>
            </div>
            {isAdmin && (
              <div className="onboarding-step">
                <span className={`onboarding-check${appUrlConfigured ? " done" : ""}`}>
                  {appUrlConfigured ? "✓" : "3"}
                </span>
                <div style={{ flex: 1 }}>
                  <strong>{t("onboardStep3Title")}</strong>
                  <p className="meta" style={{ margin: 0 }}>{t("onboardStep3Hint")}</p>
                </div>
                <a href="/settings/integrations"><button className="secondary">{t("integrationSettings")}</button></a>
              </div>
            )}
          </div>
          <a href="/scan"><button style={{ width: "100%", marginTop: 12 }}>{t("scanButton")}</button></a>
        </div>
      )}

      {!busy && !loadFailed && recent.length > 0 && lowStock.length === 0 && expiringSoon.length === 0 && needsNaming.length === 0 && (
        <p className="scan-hint">{t("noUrgentItems")}</p>
      )}

      {lowStock.length > 0 && (
        <section className="dashboard-section">
          <div className="page-header" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>{t("lowStockSection")} ({lowStock.length})</h2>
            <a href="/shopping"><button className="secondary">{t("shoppingListLink")}</button></a>
          </div>
          {lowStock.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onChange={(updated) =>
                setLowStock((prev) =>
                  prev
                    .map((i) => (i.id === updated.id ? updated : i))
                    .filter((i) => i.wanted || i.minQuantity == null || i.quantity <= i.minQuantity),
                )
              }
            />
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

      {needsNaming.length > 0 && (
        <section className="dashboard-section">
          <h2>{t("needsNamingSection")} ({needsNaming.length})</h2>
          <p className="meta" style={{ marginTop: 0 }}>{t("needsNamingHint")}</p>
          {needsNaming.map((item) => (
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
