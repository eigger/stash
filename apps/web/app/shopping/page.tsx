"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { ItemCard } from "../../components/ItemCard";
import type { Item } from "../../lib/types";

// 재고부족 항목을 장 보러 갈 때 훑어볼 체크리스트로 보여준다. 모든 항목에 동일한 "구매완료"
// 버튼을 붙여서, 왜 있는 항목은 되고 없는 항목은 안 되는지 헷갈리지 않게 한다 — wanted로
// 수동 추가된 항목은 그 자리에서 wanted를 해제하고, 재고부족으로 뜬 항목은 기준 수량을
// 막 넘긴 값으로 채워서(=방금 다 샀다는 뜻) 목록에서 빠지게 한다.
export default function ShoppingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { show } = useToast();
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

  async function markBought(item: Item) {
    try {
      const patch = item.wanted ? { wanted: false } : { quantity: (item.minQuantity ?? 0) + 1 };
      const updated = await apiJson<Item>(`/api/items/${item.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      setItems((prev) =>
        prev
          .map((i) => (i.id === updated.id ? updated : i))
          .filter((i) => i.wanted || i.minQuantity == null || i.quantity <= i.minQuantity),
      );
    } catch (err: any) {
      show(err.message, "error");
    }
  }

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
            setItems((prev) =>
              prev
                .map((i) => (i.id === updated.id ? updated : i))
                .filter((i) => i.wanted || i.minQuantity == null || i.quantity <= i.minQuantity),
            )
          }
          extra={
            item.notes && (
              <p className="meta" style={{ margin: "2px 0", fontStyle: "italic" }}>
                {item.notes}
              </p>
            )
          }
          onMarkBought={() => markBought(item)}
        />
      ))}
    </main>
  );
}
