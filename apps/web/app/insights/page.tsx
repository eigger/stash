"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { currentLocalMonthRange, localMonthRange } from "@stash/shared";
import { apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import type { InsightsResponse } from "../../lib/types";

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export default function InsightsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t, formatDateTime } = useLocale();
  const initial = useMemo(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }, []);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    setBusy(true);
    setFailed(false);
    const { start, end } = localMonthRange(year, month);
    const params = new URLSearchParams({
      from: start.toISOString(),
      to: end.toISOString(),
      // from/to와 같은 로컬 달력으로 RESTOCK 날짜를 묶기 위함(서버가 타임존을 추측하지 않음).
      tzOffsetMinutes: String(new Date().getTimezoneOffset()),
    });
    apiJson<InsightsResponse>(`/api/insights?${params}`)
      .then(setData)
      .catch(() => {
        setData(null);
        setFailed(true);
      })
      .finally(() => setBusy(false));
  }, [user, year, month]);

  if (loading || !user) return null;

  const isCurrentMonth = (() => {
    const cur = currentLocalMonthRange();
    const mine = localMonthRange(year, month);
    return mine.start.getTime() === cur.start.getTime();
  })();

  return (
    <main className="container">
      <div className="page-header">
        <h1>{t("insightsTitle")}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              const n = shiftMonth(year, month, -1);
              setYear(n.year);
              setMonth(n.month);
            }}
          >
            {t("insightsPrevMonth")}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={isCurrentMonth}
            onClick={() => {
              const n = shiftMonth(year, month, 1);
              setYear(n.year);
              setMonth(n.month);
            }}
          >
            {t("insightsNextMonth")}
          </button>
        </div>
      </div>

      <p className="meta" style={{ marginTop: 0 }}>
        {t("insightsMonthLabel", { year, month })}
      </p>
      <p className="meta">{t("insightsHint")}</p>

      {busy && <p>{t("loading")}</p>}
      {!busy && failed && <p className="error-text">{t("insightsLoadFailed")}</p>}

      {!busy && data && (
        <>
          <section style={{ marginTop: 20 }}>
            <h2>{t("insightsUntouchedTitle", { days: data.untouchedDays })}</h2>
            <p className="meta">{t("insightsUntouchedHint")}</p>
            {data.untouched.length === 0 ? (
              <p className="meta">{t("insightsUntouchedEmpty")}</p>
            ) : (
              data.untouched.map((row) => (
                <div key={row.id} className="card item-card">
                  <div className="info">
                    <Link href={`/items/${row.id}`} className="name" style={{ color: "inherit", textDecoration: "none" }}>
                      {row.name}
                    </Link>
                    <div className="meta">
                      {t("insightsUntouchedDays", { n: row.daysSinceTouch })}
                      {" · "}
                      {formatDateTime(row.lastTouchAt)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </section>

          <section style={{ marginTop: 24 }}>
            <h2>{t("insightsTopConsumedTitle")}</h2>
            {data.topConsumed.length === 0 ? (
              <p className="meta">{t("insightsTopConsumedEmpty")}</p>
            ) : (
              data.topConsumed.map((row) => (
                <div key={row.itemId} className="card item-card">
                  <div className="info">
                    <Link
                      href={`/items/${row.itemId}`}
                      className="name"
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      {row.name}
                    </Link>
                  </div>
                  <div style={{ fontWeight: 700, flexShrink: 0 }}>
                    {t("insightsConsumedQty", { n: row.consumedQty })}
                  </div>
                </div>
              ))
            )}
          </section>

          <section style={{ marginTop: 24 }}>
            <h2>{t("insightsDuplicatesTitle")}</h2>
            {data.duplicatePurchases.length === 0 ? (
              <p className="meta">{t("insightsDuplicatesEmpty")}</p>
            ) : (
              data.duplicatePurchases.map((row) => (
                <div key={row.itemId} className="card item-card">
                  <div className="info">
                    <Link
                      href={`/items/${row.itemId}`}
                      className="name"
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      {row.name}
                    </Link>
                    <div className="meta">
                      {t("insightsRestockMeta", { count: row.restockCount, qty: row.restockQty })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </section>

          <section style={{ marginTop: 24 }}>
            <h2>{t("insightsPurchasedTitle")}</h2>
            {Object.keys(data.purchased.totalByCurrency).length > 0 && (
              <p className="meta">
                {t("insightsPurchasedTotal")}:{" "}
                {Object.entries(data.purchased.totalByCurrency)
                  .map(([currency, value]) => `${value.toLocaleString()} ${currency}`)
                  .join(", ")}
              </p>
            )}
            {data.purchased.items.length === 0 ? (
              <p className="meta">{t("insightsPurchasedEmpty")}</p>
            ) : (
              data.purchased.items.map((row) => (
                <div key={row.id} className="card item-card">
                  <div className="info">
                    <Link href={`/items/${row.id}`} className="name" style={{ color: "inherit", textDecoration: "none" }}>
                      {row.name}
                    </Link>
                    <div className="meta">{formatDateTime(row.purchasedAt)}</div>
                  </div>
                  <div style={{ fontWeight: 600, flexShrink: 0, textAlign: "right" }}>
                    {row.price != null
                      ? `${row.price.toLocaleString()} ${row.currency?.trim() || "?"}`
                      : t("insightsPurchasedNoPrice")}
                  </div>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </main>
  );
}
