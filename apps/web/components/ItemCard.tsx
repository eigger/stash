"use client";

import { useEffect, useState, type ReactNode } from "react";
import { apiJson } from "../lib/api";
import { useToast } from "../lib/toast-context";
import { useLocale } from "../lib/i18n/locale-context";
import type { TranslationKey } from "../lib/i18n/translations";
import type { Item, ItemCondition } from "../lib/types";

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// 이모지는 폰트/OS별로 모양이 달라져서 아이콘으로 쓰지 않는다 — 다른 곳(BottomNav 등)과
// 같은 방식의 스트로크 SVG로 통일한다.
function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
      <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6" />
      <circle cx="9.5" cy="20" r="1.3" />
      <circle cx="17" cy="20" r="1.3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
      <path d="M4 12.5 9 17.5 20 6" />
    </svg>
  );
}

const CONDITION_BADGE_KEY: Record<ItemCondition, TranslationKey> = {
  NEW: "conditionNew",
  IN_USE: "conditionInUse",
  NEEDS_REPAIR: "conditionNeedsRepair",
  RETIRED: "conditionRetired",
};

interface Props {
  item: Item;
  onChange?: (updated: Item) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  // 이 카드가 여러 화면(목록/대시보드/장보기)에서 재사용되다 보니, 화면별로만 필요한
  // 내용(장보기의 메모 등)은 ItemCard가 직접 알 필요 없이 여기로 끼워 넣는다.
  extra?: ReactNode;
  // 수량 +/- 버튼과 같은 줄에 장보기 추가/제거 토글을 붙인다 — 상세페이지까지 들어가지
  // 않고 목록에서 수량을 보면서 바로 담을 수 있게. 아이템 목록에서만 켠다.
  showWantedToggle?: boolean;
  // 장보기 화면 전용 — wanted 여부와 무관하게 모든 항목에 "구매완료" 버튼을 하나씩 붙인다.
  // 클릭 시 실제로 무엇을 할지(wanted 해제 vs 수량 채우기)는 화면 쪽에서 결정해 넘긴다.
  onMarkBought?: () => void;
}

// 목록에서 바로 수량을 조정할 수 있는 카드 — 상세 페이지까지 들어가지 않아도 되게 하는 게 핵심.
export function ItemCard({ item, onChange, selectable, selected, onToggleSelect, extra, showWantedToggle, onMarkBought }: Props) {
  const { show } = useToast();
  const { t } = useLocale();
  const [current, setCurrent] = useState(item);
  const [busy, setBusy] = useState(false);

  // 목록 새로고침(필터 변경, 일괄 작업 등)으로 부모가 새 item을 내려주면 그 값을 반영한다 —
  // 안 그러면 마운트 시점 값만 영원히 붙들고 있어 이후 변경이 카드에 안 보이게 된다.
  useEffect(() => {
    setCurrent(item);
  }, [item]);

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

  async function toggleWanted() {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await apiJson<Item>(`/api/items/${current.id}`, {
        method: "PATCH",
        body: JSON.stringify({ wanted: !current.wanted }),
      });
      setCurrent(updated);
      onChange?.(updated);
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  const isLow = current.minQuantity != null && current.quantity <= current.minQuantity;
  const expiringSoon = current.expiryDate && daysUntil(current.expiryDate) <= 14;

  return (
    <div className="card item-card">
      {selectable && (
        <input
          type="checkbox"
          checked={!!selected}
          onChange={onToggleSelect}
          aria-label={current.name}
          style={{ alignSelf: "center", marginRight: 4 }}
        />
      )}
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
          {current.location?.name ?? t("noLocation")}
          {current.itemType === "CONSUMABLE" && (
            <>
              {" "}
              · {t("quantityLabel")} {current.quantity}
              {current.unit ?? ""}
            </>
          )}
        </div>
        <div style={{ marginTop: 4, display: "flex", gap: 4 }}>
          {isLow && <span className="badge badge-danger">{t("lowStockBadge")}</span>}
          {expiringSoon && current.expiryDate && (
            <span className="badge badge-warning">
              {daysUntil(current.expiryDate) <= 0 ? t("expiredBadge") : `D-${daysUntil(current.expiryDate)}`}
            </span>
          )}
          {current.itemType === "ASSET" && current.condition && (
            <span className={`badge ${current.condition === "NEEDS_REPAIR" ? "badge-warning" : "badge-muted"}`}>
              {t(CONDITION_BADGE_KEY[current.condition])}
            </span>
          )}
        </div>
        {extra}
      </div>
      {current.itemType === "CONSUMABLE" && (
        <div className="qty-stepper">
          <button className="secondary" disabled={busy} onClick={() => adjust(-1)}>
            -
          </button>
          <span>{current.quantity}</span>
          <button className="secondary" disabled={busy} onClick={() => adjust(1)}>
            +
          </button>
          {showWantedToggle && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={toggleWanted}
              title={current.wanted ? t("removeFromShoppingListButton") : t("addToShoppingListButton")}
            >
              {current.wanted ? <CheckIcon /> : <CartIcon />}
            </button>
          )}
          {onMarkBought && (
            <button type="button" className="secondary" onClick={onMarkBought} title={t("markBoughtButton")}>
              <CheckIcon />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
