"use client";

import { useState } from "react";
import { apiJson } from "../lib/api";
import { useToast } from "../lib/toast-context";
import { useLocale } from "../lib/i18n/locale-context";
import type { Item } from "../lib/types";

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

interface Props {
  item: Item;
  onChange?: (updated: Item) => void;
}

// 목록에서 바로 수량을 조정할 수 있는 카드 — 상세 페이지까지 들어가지 않아도 되게 하는 게 핵심.
export function ItemCard({ item, onChange }: Props) {
  const { show } = useToast();
  const { t } = useLocale();
  const [current, setCurrent] = useState(item);
  const [busy, setBusy] = useState(false);

  async function adjust(delta: number) {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await apiJson<Item>(`/api/items/${current.id}/quantity`, {
        method: "POST",
        body: JSON.stringify({ delta, reason: delta > 0 ? "RESTOCK" : "CONSUME" }),
      });
      setCurrent(updated);
      onChange?.(updated);
    } catch (err: any) {
      show(t("adjustFailToast", { msg: err.message }), "error");
    } finally {
      setBusy(false);
    }
  }

  const isLow = current.minQuantity != null && current.quantity <= current.minQuantity;
  const expiringSoon = current.expiryDate && daysUntil(current.expiryDate) <= 14;

  return (
    <div className="card item-card">
      {current.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="thumb" src={current.photoUrl} alt="" />
      ) : (
        <div className="thumb" />
      )}
      <div className="info">
        <a href={`/items/${current.id}`} className="name" style={{ color: "inherit", textDecoration: "none" }}>
          {current.name}
        </a>
        <div className="meta">
          {current.location?.name ?? t("noLocation")} · {t("quantityLabel")} {current.quantity}
          {current.unit ?? ""}
        </div>
        <div style={{ marginTop: 4, display: "flex", gap: 4 }}>
          {isLow && <span className="badge badge-danger">{t("lowStockBadge")}</span>}
          {expiringSoon && current.expiryDate && (
            <span className="badge badge-warning">
              {daysUntil(current.expiryDate) <= 0 ? t("expiredBadge") : `D-${daysUntil(current.expiryDate)}`}
            </span>
          )}
        </div>
      </div>
      <div className="qty-stepper">
        <button className="secondary" disabled={busy} onClick={() => adjust(-1)}>
          -
        </button>
        <span>{current.quantity}</span>
        <button className="secondary" disabled={busy} onClick={() => adjust(1)}>
          +
        </button>
      </div>
    </div>
  );
}
