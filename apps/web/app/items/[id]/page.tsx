"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_URL, apiFetch, apiJson } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { useToast } from "../../../lib/toast-context";
import { useLocale } from "../../../lib/i18n/locale-context";
import type { TranslationKey } from "../../../lib/i18n/translations";
import type { Item, Location, Category, StockMovementReason } from "../../../lib/types";

const REASON_KEY: Record<StockMovementReason, TranslationKey> = {
  RESTOCK: "reasonRestock",
  CONSUME: "reasonConsume",
  ADJUST: "reasonAdjust",
};

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { show } = useToast();
  const { t, formatDateTime } = useLocale();
  const [item, setItem] = useState<Item | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(true);
  const [manualBarcode, setManualBarcode] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  async function refresh() {
    const data = await apiJson<Item>(`/api/items/${id}`);
    setItem(data);
  }

  useEffect(() => {
    if (!user) return;
    Promise.all([refresh(), apiJson<Location[]>("/api/locations").then(setLocations), apiJson<Category[]>("/api/categories").then(setCategories)]).finally(
      () => setBusy(false),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  async function adjustQuantity(delta: number) {
    if (!item) return;
    try {
      const updated = await apiJson<Item>(`/api/items/${item.id}/quantity`, {
        method: "POST",
        body: JSON.stringify({ delta, reason: delta > 0 ? "RESTOCK" : "CONSUME" }),
      });
      setItem((prev) => (prev ? { ...prev, quantity: updated.quantity } : prev));
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function updateField(field: keyof Item, value: unknown) {
    if (!item) return;
    try {
      const updated = await apiJson<Item>(`/api/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ [field]: value }),
      });
      setItem(updated);
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function generateQr() {
    if (!item) return;
    try {
      await apiJson(`/api/items/${item.id}/barcodes/generate`, { method: "POST" });
      show(t("qrIssuedToast"), "success");
      await refresh();
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function requestPrint() {
    if (!item) return;
    try {
      await apiJson(`/api/items/${item.id}/print-request`, { method: "POST" });
      show(t("printRequestedToast"), "success");
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function addManualBarcode() {
    if (!item || !manualBarcode.trim()) return;
    try {
      await apiJson(`/api/items/${item.id}/barcodes`, {
        method: "POST",
        body: JSON.stringify({ value: manualBarcode.trim(), source: "EXISTING", symbology: "OTHER" }),
      });
      setManualBarcode("");
      await refresh();
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function addMatterBarcode() {
    if (!item || !manualBarcode.trim()) return;
    try {
      await apiJson(`/api/items/${item.id}/barcodes`, {
        method: "POST",
        body: JSON.stringify({ value: manualBarcode.trim(), source: "MATTER", symbology: "QR" }),
      });
      setManualBarcode("");
      await refresh();
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function removeBarcode(barcodeId: string) {
    try {
      await apiJson(`/api/barcodes/${barcodeId}`, { method: "DELETE" });
      await refresh();
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function handlePhotoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !item) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiFetch(`/api/attachments?itemId=${item.id}`, { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : t("uploadFailFallback"));
      }
      const attachment = await res.json();
      await updateField("photoUrl", `${API_URL}/api/attachments/file/${attachment.filePath}`);
      show(t("photoUploadedToast"), "success");
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!item) return;
    if (!confirm(t("confirmDeleteItem", { name: item.name }))) return;
    try {
      await apiJson(`/api/items/${item.id}`, { method: "DELETE" });
      router.push("/items");
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  if (loading || !user || busy || !item) return <main className="container"><p>{t("loading")}</p></main>;

  return (
    <main className="container">
      <div className="page-header">
        <h1>{item.name}</h1>
        <button className="danger" onClick={handleDelete}>
          {t("delete")}
        </button>
      </div>

      {item.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.photoUrl} alt={item.name} style={{ width: "100%", borderRadius: 12, marginBottom: 12 }} />
      )}

      <div className="card">
        <div className="qty-stepper" style={{ justifyContent: "center", marginBottom: 8 }}>
          <button className="secondary" onClick={() => adjustQuantity(-1)}>-</button>
          <span style={{ fontSize: "1.4rem", minWidth: 40, textAlign: "center" }}>{item.quantity}</span>
          <button className="secondary" onClick={() => adjustQuantity(1)}>+</button>
          <span className="meta">{item.unit ?? ""}</span>
        </div>

        <label>
          {t("locationLabel")}
          <select value={item.locationId ?? ""} onChange={(e) => updateField("locationId", e.target.value || null)}>
            <option value="">{t("noLocationOption")}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t("categoryLabel")}
          <select value={item.categoryId ?? ""} onChange={(e) => updateField("categoryId", e.target.value || null)}>
            <option value="">{t("noCategoryOption")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t("minQuantityLabel")}
          <input
            type="number"
            min={0}
            value={item.minQuantity ?? ""}
            onChange={(e) => updateField("minQuantity", e.target.value ? Number(e.target.value) : null)}
          />
        </label>

        <label>
          {t("expiryLabel")}
          <input
            type="date"
            value={item.expiryDate?.slice(0, 10) ?? ""}
            onChange={(e) => updateField("expiryDate", e.target.value || null)}
          />
        </label>

        <label>
          {t("warrantyLabel")}
          <input
            type="date"
            value={item.warrantyExpiresAt?.slice(0, 10) ?? ""}
            onChange={(e) => updateField("warrantyExpiresAt", e.target.value || null)}
          />
        </label>

        <label>
          {t("photoUploadLabel")}
          <input type="file" accept="image/*" capture="environment" onChange={handlePhotoUpload} disabled={uploading} />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <label style={{ flex: 1 }}>
            {t("priceLabel")}
            <input
              type="number"
              min={0}
              step="0.01"
              value={item.price ?? ""}
              onChange={(e) => setItem({ ...item, price: e.target.value ? Number(e.target.value) : null })}
              onBlur={(e) => updateField("price", e.target.value ? Number(e.target.value) : null)}
            />
          </label>
          <label style={{ flex: 1 }}>
            {t("currencyLabel")}
            <input
              value={item.currency ?? ""}
              onChange={(e) => setItem({ ...item, currency: e.target.value })}
              onBlur={(e) => updateField("currency", e.target.value || null)}
            />
          </label>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("barcodeSectionTitle")}</h2>
        {item.barcodes.length === 0 && <p className="meta">{t("noBarcodes")}</p>}
        {item.barcodes.map((b) => (
          <div key={b.id} className="tree-row">
            <div>
              <span className="badge badge-muted">
                {b.source === "GENERATED" ? t("sourceGenerated") : b.source === "MATTER" ? t("sourceMatter") : t("sourceExisting")}
              </span>{" "}
              {b.value}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <a href={`${API_URL}/api/barcodes/${b.id}/label.png`} target="_blank" rel="noreferrer">
                {t("viewLabel")}
              </a>
              <button className="secondary" onClick={() => removeBarcode(b.id)}>
                {t("delete")}
              </button>
            </div>
          </div>
        ))}

        <div className="fab-row">
          <button onClick={generateQr}>{t("generateQrButton")}</button>
          {item.barcodes.length > 0 && (
            <button className="secondary" onClick={requestPrint}>
              {t("printRequestButton")}
            </button>
          )}
        </div>
        <div className="form" style={{ marginTop: 12 }}>
          <input
            placeholder={t("manualBarcodePlaceholder")}
            value={manualBarcode}
            onChange={(e) => setManualBarcode(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="secondary" onClick={addManualBarcode} style={{ flex: 1 }}>
              {t("addExistingBarcode")}
            </button>
            <button className="secondary" onClick={addMatterBarcode} style={{ flex: 1 }}>
              {t("addMatterBarcode")}
            </button>
          </div>
        </div>
      </div>

      {item.movements && item.movements.length > 0 && (
        <div className="card">
          <div className="page-header" style={{ marginBottom: 4 }}>
            <h2 style={{ margin: 0 }}>{t("movementHistoryTitle")}</h2>
            <a href={`/history?itemId=${item.id}`} style={{ fontSize: "0.85rem" }}>
              {t("viewAll")}
            </a>
          </div>
          <table>
            <tbody>
              {item.movements.map((m) => (
                <tr key={m.id}>
                  <td>{formatDateTime(m.occurredAt)}</td>
                  <td>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                  <td>{t(REASON_KEY[m.reason])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <label>
        {t("notesLabel")}
        <textarea
          value={item.notes ?? ""}
          onChange={(e) => setItem({ ...item, notes: e.target.value })}
          onBlur={(e) => updateField("notes", e.target.value || null)}
          rows={3}
        />
      </label>
    </main>
  );
}
