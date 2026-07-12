"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import type { Item, StockMovementReason, StockMovementWithItem } from "../../lib/types";
import type { TranslationKey } from "../../lib/i18n/translations";

const REASON_KEY: Record<StockMovementReason, TranslationKey> = {
  RESTOCK: "reasonRestock",
  CONSUME: "reasonConsume",
  ADJUST: "reasonAdjust",
};

export default function HistoryPage() {
  return (
    <Suspense fallback={null}>
      <HistoryPageInner />
    </Suspense>
  );
}

function HistoryPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const { t, formatDateTime } = useLocale();
  const [movements, setMovements] = useState<StockMovementWithItem[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [itemId, setItemId] = useState(searchParams.get("itemId") ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (user) apiJson<Item[]>("/api/items").then(setItems);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setBusy(true);
    const params = new URLSearchParams();
    if (itemId) params.set("itemId", itemId);
    if (reason) params.set("reason", reason);
    apiJson<StockMovementWithItem[]>(`/api/movements?${params.toString()}`)
      .then(setMovements)
      .finally(() => setBusy(false));
  }, [user, itemId, reason]);

  if (loading || !user) return null;

  return (
    <main className="container">
      <h1>{t("historyTitle")}</h1>

      <div className="form" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">{t("allItems")}</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">{t("allReasons")}</option>
            <option value="RESTOCK">{t("reasonRestock")}</option>
            <option value="CONSUME">{t("reasonConsume")}</option>
            <option value="ADJUST">{t("reasonAdjust")}</option>
          </select>
        </div>
      </div>

      {busy && <p>{t("loading")}</p>}
      {!busy && movements.length === 0 && <p className="scan-hint">{t("noHistory")}</p>}

      {movements.map((m) => (
        <div key={m.id} className="card item-card">
          {m.item.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="thumb" src={m.item.photoUrl} alt="" />
          ) : (
            <div className="thumb" />
          )}
          <div className="info">
            <a href={`/items/${m.item.id}`} className="name" style={{ color: "inherit", textDecoration: "none" }}>
              {m.item.name}
            </a>
            <div className="meta history-meta">
              {formatDateTime(m.occurredAt)}
              {m.user && ` · ${m.user.name}`}
            </div>
            <div style={{ marginTop: 4 }}>
              <span className="badge badge-muted">{t(REASON_KEY[m.reason])}</span>
            </div>
          </div>
          <div
            style={{
              fontWeight: 700,
              color: m.delta >= 0 ? "var(--color-success)" : "var(--color-danger)",
              flexShrink: 0,
              minWidth: 56,
              textAlign: "right",
            }}
          >
            {m.delta > 0 ? `+${m.delta}` : m.delta}
            {m.item.unit ?? ""}
          </div>
        </div>
      ))}
    </main>
  );
}
