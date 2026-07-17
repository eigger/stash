"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, apiFetch, apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { useLocale } from "../../lib/i18n/locale-context";
import type { Item } from "../../lib/types";

export default function LabelsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { show } = useToast();
  const { t } = useLocale();
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [sendingWebhook, setSendingWebhook] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (user) apiJson<Item[]>("/api/items").then(setItems);
  }, [user]);

  const withBarcode = items.filter((i) => i.barcodes.length > 0);
  const visibleItems = q.trim()
    ? withBarcode.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()))
    : withBarcode;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((i) => selected.has(i.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleItems.forEach((i) => next.delete(i.id));
      } else {
        visibleItems.forEach((i) => next.add(i.id));
      }
      return next;
    });
  }

  // 선택한 여러 아이템의 라벨을 한 장의 인쇄용 PDF 시트로 묶어서 내려받는다.
  async function handleSheetDownload() {
    if (selected.size === 0) return;
    setGenerating(true);
    try {
      const res = await apiFetch("/api/labels/sheet", {
        method: "POST",
        body: JSON.stringify({ itemIds: Array.from(selected) }),
      });
      if (!res.ok) throw new Error(t("sheetGenerateFail"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stash-labels-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setGenerating(false);
    }
  }

  // 선택한 아이템 각각에 대해 재고 이벤트 웹훅으로 출력 요청을 보낸다 (웹훅 지원 프린터/라벨 기기 연동용).
  async function handleWebhookPrint() {
    if (selected.size === 0) return;
    setSendingWebhook(true);
    try {
      const results = await Promise.allSettled(
        Array.from(selected).map((id) => apiJson(`/api/items/${id}/print-request`, { method: "POST" })),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed === 0) show(t("webhookPrintSuccessToast", { n: selected.size }), "success");
      else show(t("webhookPrintPartialToast", { ok: selected.size - failed, fail: failed }), "error");
    } finally {
      setSendingWebhook(false);
    }
  }

  if (loading || !user) return null;

  return (
    <main className="container">
      <div className="page-header">
        <h1>{t("labelsTitle")}</h1>
        {withBarcode.length > 0 && (
          <button className="secondary" onClick={toggleAll}>
            {visibleItems.length > 0 && visibleItems.every((i) => selected.has(i.id)) ? t("deselectAll") : t("selectAll")}
          </button>
        )}
      </div>
      <p className="scan-hint">{t("labelsHint")}</p>

      {withBarcode.length > 0 && (
        <input
          placeholder={t("searchPlaceholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ marginBottom: 12 }}
        />
      )}

      {visibleItems.map((item) => {
        const primary = item.barcodes.find((b) => b.isPrimary) ?? item.barcodes[0];
        return (
          <div key={item.id} className="tree-row">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
              {item.name}
            </label>
            <a href={`${API_URL}/api/barcodes/${primary.id}/label.png`} download={`${item.name}.png`}>
              <button type="button" className="btn-action">{t("downloadIndividual")}</button>
            </a>
          </div>
        );
      })}

      {items.filter((i) => i.barcodes.length === 0).length > 0 && (
        <p className="scan-hint">{t("noBarcodeHint")}</p>
      )}

      {withBarcode.length > 0 && (
        <div className="fab-row">
          <button onClick={handleSheetDownload} disabled={selected.size === 0 || generating} style={{ width: "100%" }}>
            {generating ? t("generatingSheet") : t("printSheetButton", { n: selected.size })}
          </button>
          <button
            className="secondary"
            onClick={handleWebhookPrint}
            disabled={selected.size === 0 || sendingWebhook}
            style={{ width: "100%" }}
          >
            {sendingWebhook ? t("requestingWebhook") : t("webhookPrintButton")}
          </button>
        </div>
      )}
    </main>
  );
}
