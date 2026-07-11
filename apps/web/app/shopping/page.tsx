"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { ItemCard } from "../../components/ItemCard";
import type { Item } from "../../lib/types";

// 재고부족 항목을 장 보러 갈 때 훑어볼 체크리스트로 보여준다. 수량을 올려서
// minQuantity를 넘기면(=샀다는 뜻) 목록에서 자동으로 빠진다 — 별도의 "구매완료"
// 플래그 없이 기존 수량 데이터만으로 동작한다.
export default function ShoppingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t } = useLocale();
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    apiJson<Item[]>("/api/items?lowStock=true")
      .then(setItems)
      .finally(() => setBusy(false));
  }, [user]);

  if (loading || !user) return null;

  return (
    <main className="container">
      <h1>{t("shoppingListTitle")}</h1>
      <p className="scan-hint">{t("shoppingListHint")}</p>

      {busy && <p>{t("loading")}</p>}
      {!busy && items.length === 0 && <p className="scan-hint">{t("shoppingListEmpty")}</p>}
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          onChange={(updated) =>
            setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)).filter((i) => i.minQuantity == null || i.quantity <= i.minQuantity))
          }
        />
      ))}
    </main>
  );
}
