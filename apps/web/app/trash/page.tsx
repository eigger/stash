"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { useLocale } from "../../lib/i18n/locale-context";
import type { Item } from "../../lib/types";

export default function TrashPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { show } = useToast();
  const { t } = useLocale();
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  async function refresh() {
    setBusy(true);
    try {
      const { items: trashed } = await apiJson<{ items: Item[] }>("/api/items?trashed=true&page=1&pageSize=100");
      setItems(trashed);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (user) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleRestore(id: string) {
    try {
      await apiJson(`/api/items/${id}/restore`, { method: "POST" });
      show(t("itemRestoredToast"), "success");
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function handlePermanentDelete(id: string, name: string) {
    if (!confirm(t("confirmPermanentDelete", { name }))) return;
    try {
      await apiJson(`/api/items/${id}/permanent`, { method: "DELETE" });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  if (loading || !user) return null;

  return (
    <main className="container">
      <h1>{t("trashTitle")}</h1>
      <p className="scan-hint">{t("trashHint")}</p>

      {busy && <p>{t("loading")}</p>}
      {!busy && items.length === 0 && <p className="scan-hint">{t("trashEmpty")}</p>}
      {items.map((item) => (
        <div key={item.id} className="tree-row">
          <div>
            {item.name}
            <span className="meta"> · {t("quantityLabel")} {item.quantity}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="secondary" onClick={() => handleRestore(item.id)}>
              {t("restoreButton")}
            </button>
            <button className="danger" onClick={() => handlePermanentDelete(item.id, item.name)}>
              {t("permanentDeleteButton")}
            </button>
          </div>
        </div>
      ))}
    </main>
  );
}
