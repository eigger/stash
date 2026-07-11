"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { useToast } from "../../../lib/toast-context";
import { useLocale } from "../../../lib/i18n/locale-context";
import type { Item, Location, Category } from "../../../lib/types";

// 바코드 없는 물건 등록 폼 — 필수 입력은 이름뿐이고 나머지는 전부 선택값으로 두어
// 나중에 채워도 되게 한다 (입력 마찰 최소화).
export default function NewItemPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { show } = useToast();
  const { t } = useLocale();
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [locationId, setLocationId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [barcodeValue, setBarcodeValue] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [warrantyExpiresAt, setWarrantyExpiresAt] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    apiJson<Location[]>("/api/locations").then(setLocations);
    apiJson<Category[]>("/api/categories").then(setCategories);
  }, [user]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const item = await apiJson<Item>("/api/items", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          quantity,
          locationId: locationId || null,
          categoryId: categoryId || null,
          expiryDate: expiryDate || null,
          warrantyExpiresAt: warrantyExpiresAt || null,
          price: price ? Number(price) : null,
          currency: currency.trim() || null,
          notes: notes || null,
          barcodeValue: barcodeValue.trim() || undefined,
        }),
      });
      show(t("itemCreatedToast"), "success");
      router.push(`/items/${item.id}`);
    } catch (err: any) {
      show(t("itemCreateFailToast", { msg: err.message }), "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) return null;

  return (
    <main className="container">
      <h1>{t("newItemTitle")}</h1>
      <form onSubmit={handleSubmit} className="form">
        <input
          placeholder={t("namePlaceholderRequired")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>{t("quantityLabel")}</span>
          <input
            type="number"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            style={{ width: 100 }}
          />
        </div>
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">{t("selectLocationOptional")}</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">{t("selectCategoryOptional")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          placeholder={t("barcodePlaceholder")}
          value={barcodeValue}
          onChange={(e) => setBarcodeValue(e.target.value)}
        />
        <label>
          {t("expiryOptional")}
          <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
        </label>
        <label>
          {t("warrantyOptional")}
          <input type="date" value={warrantyExpiresAt} onChange={(e) => setWarrantyExpiresAt(e.target.value)} />
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder={t("pricePlaceholder")}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <input
            placeholder={t("currencyPlaceholder")}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            style={{ maxWidth: 100 }}
          />
        </div>
        <textarea placeholder={t("notesPlaceholder")} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        <button type="submit" disabled={saving || !name.trim()}>
          {saving ? t("saving") : t("save")}
        </button>
      </form>
    </main>
  );
}
