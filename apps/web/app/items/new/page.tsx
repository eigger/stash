"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BrowserCodeReader, BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { apiJson } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { useToast } from "../../../lib/toast-context";
import { useLocale } from "../../../lib/i18n/locale-context";
import { RECENT_CATEGORIES_KEY, RECENT_LOCATIONS_KEY, loadRecentIds, pushRecentId } from "../../../lib/recentSelections";
import { playBeep, unlockBeepAudio } from "../../../lib/beep";
import { SCAN_HINTS, SCAN_VIDEO_CONSTRAINTS } from "../../../lib/barcodeScanner";
import { TorchButton } from "../../../components/TorchButton";
import type { Item, ItemCondition, ItemType, Location, Category } from "../../../lib/types";

// 바코드 없는 물건 등록 폼 — 필수 입력은 이름뿐이고 나머지는 전부 선택값으로 두어
// 나중에 채워도 되게 한다 (입력 마찰 최소화).
export default function NewItemPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { show } = useToast();
  const { t } = useLocale();
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recentLocationIds] = useState(() => loadRecentIds(RECENT_LOCATIONS_KEY));
  const [recentCategoryIds] = useState(() => loadRecentIds(RECENT_CATEGORIES_KEY));
  const [name, setName] = useState("");
  const [itemType, setItemType] = useState<ItemType>("CONSUMABLE");
  const [condition, setCondition] = useState<ItemCondition>("NEW");
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
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    apiJson<Location[]>("/api/locations").then(setLocations);
    apiJson<Category[]>("/api/categories").then(setCategories);
  }, [user]);

  // 바코드가 있는 상품이라도 위치·카테고리·가격을 먼저 채워서 등록하고 싶을 때를 위한
  // 카메라 스캔 — /scan과 달리 여기서는 값만 입력란에 채우고 등록은 사용자가 직접 누른다.
  useEffect(() => {
    if (!scanning || !videoRef.current) return;
    const reader = new BrowserMultiFormatReader(SCAN_HINTS);
    let cancelled = false;

    reader
      .decodeFromConstraints({ video: SCAN_VIDEO_CONSTRAINTS }, videoRef.current, (result) => {
        if (cancelled || !result) return;
        playBeep();
        setBarcodeValue(result.getText());
        setScanning(false);
      })
      .then((controls) => {
        controlsRef.current = controls;
        const stream = videoRef.current?.srcObject;
        if (stream instanceof MediaStream) {
          setTorchSupported(BrowserCodeReader.mediaStreamIsTorchCompatible(stream));
        }
      })
      .catch(() => {
        setScanError(t("cameraError"));
        setScanning(false);
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      setTorchSupported(false);
      setTorchOn(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  async function toggleTorch() {
    const next = !torchOn;
    try {
      await controlsRef.current?.switchTorch?.(next);
      setTorchOn(next);
    } catch {
      // 토치 전환 실패는 스캔 자체를 막을 이유가 안 된다 — 조용히 무시.
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const item = await apiJson<Item>("/api/items", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          itemType,
          condition: itemType === "ASSET" ? condition : undefined,
          quantity: itemType === "ASSET" ? 1 : quantity,
          locationId: locationId || null,
          categoryId: categoryId || null,
          expiryDate: itemType === "ASSET" ? null : expiryDate || null,
          warrantyExpiresAt: warrantyExpiresAt || null,
          price: price ? Number(price) : null,
          currency: currency.trim() || null,
          notes: notes || null,
          barcodeValue: barcodeValue.trim() || undefined,
        }),
      });
      if (locationId) pushRecentId(RECENT_LOCATIONS_KEY, locationId);
      if (categoryId) pushRecentId(RECENT_CATEGORIES_KEY, categoryId);
      show(t("itemCreatedToast"), "success");
      router.push(`/items/${item.id}`);
    } catch (err: any) {
      show(t("itemCreateFailToast", { msg: err.message }), "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) return null;

  const recentLocations = recentLocationIds
    .map((id) => locations.find((l) => l.id === id))
    .filter((l): l is Location => !!l);
  const recentCategories = recentCategoryIds
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is Category => !!c);

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
        <div className="chip-row">
          <button
            type="button"
            className={`chip${itemType === "CONSUMABLE" ? " chip-selected" : ""}`}
            onClick={() => setItemType("CONSUMABLE")}
          >
            {t("itemTypeConsumable")}
          </button>
          <button
            type="button"
            className={`chip${itemType === "ASSET" ? " chip-selected" : ""}`}
            onClick={() => setItemType("ASSET")}
          >
            {t("itemTypeAsset")}
          </button>
        </div>
        {itemType === "CONSUMABLE" ? (
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
        ) : (
          <label>
            {t("conditionLabel")}
            <select value={condition} onChange={(e) => setCondition(e.target.value as ItemCondition)}>
              <option value="NEW">{t("conditionNew")}</option>
              <option value="IN_USE">{t("conditionInUse")}</option>
              <option value="NEEDS_REPAIR">{t("conditionNeedsRepair")}</option>
              <option value="RETIRED">{t("conditionRetired")}</option>
            </select>
          </label>
        )}
        {recentLocations.length > 0 && (
          <div className="chip-row">
            {recentLocations.map((l) => (
              <button
                key={l.id}
                type="button"
                className={`chip${locationId === l.id ? " chip-selected" : ""}`}
                onClick={() => setLocationId(l.id)}
              >
                {l.name}
              </button>
            ))}
          </div>
        )}
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">{t("selectLocationOptional")}</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        {recentCategories.length > 0 && (
          <div className="chip-row">
            {recentCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip${categoryId === c.id ? " chip-selected" : ""}`}
                onClick={() => setCategoryId(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">{t("selectCategoryOptional")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            placeholder={t("barcodePlaceholder")}
            value={barcodeValue}
            onChange={(e) => setBarcodeValue(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="secondary"
            onClick={() => {
              unlockBeepAudio();
              setScanning((s) => !s);
            }}
          >
            {scanning ? t("cancelScanButton") : t("scanBarcodeButton")}
          </button>
        </div>

        {scanning && (
          <div className="scanner-frame" style={{ maxWidth: 280 }}>
            <video ref={videoRef} muted playsInline />
            <div className="scanner-overlay">
              <div className="scan-box">
                <span className="corner tl" />
                <span className="corner tr" />
                <span className="corner bl" />
                <span className="corner br" />
                <span className="scan-line" />
              </div>
            </div>
            {torchSupported && (
              <TorchButton active={torchOn} onClick={toggleTorch} label={t(torchOn ? "torchOnLabel" : "torchOffLabel")} />
            )}
          </div>
        )}
        {scanError && <p className="error-text">{scanError}</p>}

        {itemType === "CONSUMABLE" && (
          <label>
            {t("expiryOptional")}
            <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </label>
        )}
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
