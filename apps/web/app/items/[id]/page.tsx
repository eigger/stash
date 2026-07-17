"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { BrowserCodeReader, BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat } from "@zxing/library";
import { API_URL, apiFetch, apiJson } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { useToast } from "../../../lib/toast-context";
import { useLocale } from "../../../lib/i18n/locale-context";
import { playBeep, unlockBeepAudio } from "../../../lib/beep";
import { SCAN_HINTS, SCAN_VIDEO_CONSTRAINTS, symbologyFromScanFormat } from "../../../lib/barcodeScanner";
import { TorchButton } from "../../../components/TorchButton";
import type { TranslationKey } from "../../../lib/i18n/translations";
import type { Item, ItemCondition, Location, Category, MaintenanceRecord, StockMovementReason } from "../../../lib/types";

const REASON_KEY: Record<StockMovementReason, TranslationKey> = {
  RESTOCK: "reasonRestock",
  CONSUME: "reasonConsume",
  ADJUST: "reasonAdjust",
};

// 이모지는 폰트/OS별로 모양이 달라져서 아이콘으로 쓰지 않는다 — 스트로크 SVG로 통일한다.
function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
      <rect x="9" y="9" width="12" height="12" rx="1.5" />
      <path d="M5 15V4.5A1.5 1.5 0 0 1 6.5 3H15" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}>
      <path d="M5 5 19 19M19 5 5 19" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
      <path d="M6 2.5h8l4 4V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z" />
      <path d="M14 2.5V7h4" />
    </svg>
  );
}

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
  const [scannedFormat, setScannedFormat] = useState<BarcodeFormat | null>(null);
  const [showAddBarcode, setShowAddBarcode] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [maintDate, setMaintDate] = useState("");
  const [maintDescription, setMaintDescription] = useState("");
  const [maintCost, setMaintCost] = useState("");
  const [attachmentUploading, setAttachmentUploading] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  // 기존 바코드/Matter 페어링 코드 둘 다 박스나 기기에 QR로 찍혀있는 경우가 많아서, 손으로
  // 타이핑하는 대신 카메라로 스캔해 입력란만 채울 수 있게 한다(등록 자체는 아래 버튼으로).
  useEffect(() => {
    if (!scanning || !videoRef.current) return;
    const reader = new BrowserMultiFormatReader(SCAN_HINTS);
    let cancelled = false;

    reader
      .decodeFromConstraints({ video: SCAN_VIDEO_CONSTRAINTS }, videoRef.current, (result) => {
        if (cancelled || !result) return;
        playBeep();
        setManualBarcode(result.getText());
        setScannedFormat(result.getBarcodeFormat());
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

  async function refresh() {
    const data = await apiJson<Item>(`/api/items/${id}`);
    setItem(data);
    return data;
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

  async function requestPrintForBarcode(barcodeId: string) {
    if (!item) return;
    try {
      await apiJson(`/api/items/${item.id}/print-request`, {
        method: "POST",
        body: JSON.stringify({ barcodeId }),
      });
      show(t("printRequestedToast"), "success");
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  // 카메라로 스캔한 값은 포맷을 이미 알고 있다 — 1D 바코드(EAN/UPC/CODE128)면 기존 바코드,
  // QR이면 Matter 코드로 자동 태깅해서 "기존 바코드로 추가"/"Matter 코드로 추가" 버튼을
  // 따로 둘 필요가 없게 한다. 심볼로지도 스캔 포맷을 그대로 매핑해서 정확히 저장한다 —
  // 서버의 guessSymbology(자릿수 추측)에만 기대면 라벨 렌더링이 실제와 달라질 수 있다.
  // 스캔 없이 손으로 입력한 값은 포맷을 알 수 없는데, Matter 코드를 손으로 타이핑하는
  // 경우는 사실상 없으므로 기존 바코드로 취급한다(심볼로지는 서버가 값 모양으로 추측).
  // Matter는 스마트홈 "기기" 페어링 코드이므로 자산(ASSET) 아이템에서 스캔했을 때만
  // 적용한다 — 소모품에서 QR을 스캔한 경우는 그냥 기존 바코드로 저장한다.
  async function addBarcode() {
    if (!item || !manualBarcode.trim()) return;
    const isMatter = scannedFormat === BarcodeFormat.QR_CODE && item.itemType === "ASSET";
    try {
      await apiJson(`/api/items/${item.id}/barcodes`, {
        method: "POST",
        body: JSON.stringify({
          value: manualBarcode.trim(),
          source: isMatter ? "MATTER" : "EXISTING",
          ...(scannedFormat ? { symbology: symbologyFromScanFormat(scannedFormat) } : {}),
        }),
      });
      setManualBarcode("");
      setScannedFormat(null);
      await refresh();
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function addSerialNumber() {
    if (!item || !manualBarcode.trim()) return;
    try {
      await apiJson(`/api/items/${item.id}/barcodes`, {
        method: "POST",
        body: JSON.stringify({ value: manualBarcode.trim(), source: "SERIAL", symbology: "OTHER" }),
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

  function copyToClipboard(text: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      show(t("copiedToClipboardToast"), "success");
    }
  }

  async function addMaintenanceRecord() {
    if (!item || !maintDate || !maintDescription.trim()) return;
    try {
      await apiJson(`/api/items/${item.id}/maintenance`, {
        method: "POST",
        body: JSON.stringify({
          date: maintDate,
          description: maintDescription.trim(),
          cost: maintCost ? Number(maintCost) : null,
          currency: item.currency || null,
        }),
      });
      setMaintDate("");
      setMaintDescription("");
      setMaintCost("");
      await refresh();
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function removeMaintenanceRecord(recordId: string) {
    try {
      await apiJson(`/api/maintenance/${recordId}`, { method: "DELETE" });
      await refresh();
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function setPhotoUrl(itemId: string, url: string | null) {
    try {
      const updated = await apiJson<Item>(`/api/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ photoUrl: url }),
      });
      setItem(updated);
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  // 이미지 첨부가 1장이면 그게 곧 대표 사진 — 자동으로 photoUrl을 맞춰준다. 2장 이상이면
  // 어느 게 대표인지 알 수 없으니 사용자가 직접 골라야 하고, 대표였던 게 삭제돼서 후보가
  // 여럿(또는 0장) 남으면 대표 지정을 해제한다.
  async function syncRepresentativePhoto() {
    const data = await refresh();
    const images = data.attachments?.filter((a) => a.mimeType.startsWith("image/")) ?? [];
    if (images.length === 1) {
      const url = `${API_URL}/api/attachments/file/${images[0].filePath}`;
      if (data.photoUrl !== url) await setPhotoUrl(data.id, url);
    } else if (data.photoUrl && !images.some((a) => `${API_URL}/api/attachments/file/${a.filePath}` === data.photoUrl)) {
      await setPhotoUrl(data.id, null);
    }
  }

  // 사진과 첨부파일을 별도 업로드 경로로 뒀더니 사진을 새로 올릴 때마다 이전 파일이
  // 정리되지 않고 쌓이는 문제가 있었다 — 업로드 경로를 첨부파일 하나로 합치고, 대표 사진은
  // 이미지 첨부 중에서 고르는 방식으로 바꿔서 파일이 항상 첨부파일 삭제 하나로만 정리되게 한다.
  async function handleAttachmentUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !item) return;
    setAttachmentUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiFetch(`/api/attachments?itemId=${item.id}`, { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : t("uploadFailFallback"));
      }
      await syncRepresentativePhoto();
      show(t("attachmentUploadedToast"), "success");
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setAttachmentUploading(false);
    }
  }

  async function removeAttachment(attachmentId: string) {
    try {
      await apiJson(`/api/attachments/${attachmentId}`, { method: "DELETE" });
      await syncRepresentativePhoto();
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function handleDelete() {
    if (!item) return;
    if (!confirm(t("confirmDeleteItem", { name: item.name }))) return;
    const { id, name } = item;
    try {
      await apiJson(`/api/items/${id}`, { method: "DELETE" });
      router.push("/items");
      // 목록으로 돌아간 뒤에도 실행취소를 누를 수 있도록, 복구 후에는 새로고침해서
      // 방금 삭제된 아이템이 이미 빠진 채로 떠 있던 목록 상태를 다시 맞춰준다.
      show(t("itemDeletedUndoToast", { name }), "info", {
        label: t("undoButton"),
        onClick: async () => {
          try {
            await apiJson(`/api/items/${id}/restore`, { method: "POST" });
            window.location.href = "/items";
          } catch (err: any) {
            show(t("restoreFailToast", { msg: err.message }), "error");
          }
        },
      });
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  if (loading || !user || busy || !item) return <main className="container"><p>{t("loading")}</p></main>;

  const totalMaintCost = item.maintenanceRecords?.reduce((sum, r) => sum + (r.cost || 0), 0) || 0;

  return (
    <main className="container">
      <div className="page-header">
        {item.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.photoUrl} alt={item.name} className="item-avatar" />
        )}
        <input
          className="item-name-input"
          value={item.name}
          onChange={(e) => setItem({ ...item, name: e.target.value })}
          onBlur={(e) => {
            const trimmed = e.target.value.trim();
            if (trimmed) updateField("name", trimmed);
            else refresh();
          }}
          aria-label={t("itemNameLabel")}
        />
        <button className="danger" onClick={handleDelete}>
          {t("delete")}
        </button>
      </div>

      {item.lastAuditedAt && (
        <p className="meta" style={{ marginTop: -8, marginBottom: 12 }}>
          {t("lastAuditedLabel")}: {formatDateTime(item.lastAuditedAt)}
        </p>
      )}

      <div className="card">
        <div className="chip-row" style={{ marginBottom: 8 }}>
          <button
            type="button"
            className={`chip${item.itemType === "CONSUMABLE" ? " chip-selected" : ""}`}
            onClick={() => updateField("itemType", "CONSUMABLE")}
          >
            {t("itemTypeConsumable")}
          </button>
          <button
            type="button"
            className={`chip${item.itemType === "ASSET" ? " chip-selected" : ""}`}
            onClick={() => updateField("itemType", "ASSET")}
          >
            {t("itemTypeAsset")}
          </button>
        </div>

        {item.itemType === "CONSUMABLE" ? (
          <div className="qty-stepper" style={{ justifyContent: "center", marginBottom: 8 }}>
            <button className="secondary" onClick={() => adjustQuantity(-1)}>-</button>
            <span style={{ fontSize: "1.4rem", minWidth: 40, textAlign: "center" }}>{item.quantity}</span>
            <button className="secondary" onClick={() => adjustQuantity(1)}>+</button>
            <input
              className="unit-input"
              placeholder={t("unitPlaceholder")}
              value={item.unit ?? ""}
              onChange={(e) => setItem({ ...item, unit: e.target.value })}
              onBlur={(e) => updateField("unit", e.target.value.trim() || null)}
            />
          </div>
        ) : (
          <label>
            {t("conditionLabel")}
            <select
              value={item.condition ?? "NEW"}
              onChange={(e) => updateField("condition", e.target.value as ItemCondition)}
            >
              <option value="NEW">{t("conditionNew")}</option>
              <option value="IN_USE">{t("conditionInUse")}</option>
              <option value="NEEDS_REPAIR">{t("conditionNeedsRepair")}</option>
              <option value="RETIRED">{t("conditionRetired")}</option>
            </select>
          </label>
        )}

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

        {item.itemType === "CONSUMABLE" && (
          <>
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
          </>
        )}

        {item.itemType === "ASSET" && (
          <label>
            {t("warrantyLabel")}
            <input
              type="date"
              value={item.warrantyExpiresAt?.slice(0, 10) ?? ""}
              onChange={(e) => updateField("warrantyExpiresAt", e.target.value || null)}
            />
          </label>
        )}

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
        {item.barcodes.length === 0 && (
          <p className="meta">{item.itemType === "ASSET" ? t("assetNoLabelHint") : t("noBarcodes")}</p>
        )}
        {item.barcodes.map((b) => (
          <div key={b.id} className="tree-row">
            <div className="tree-row-value" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="badge badge-muted">
                {b.source === "GENERATED"
                  ? t("sourceGenerated")
                  : b.source === "MATTER"
                    ? t("sourceMatter")
                    : b.source === "SERIAL"
                      ? t("sourceSerial")
                      : t("sourceExisting")}
              </span>{" "}
              <span>{b.value}</span>
              <button
                type="button"
                className="secondary"
                style={{
                  padding: "2px 6px",
                  fontSize: "0.75rem",
                  minHeight: "auto",
                  border: "none",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                }}
                onClick={() => copyToClipboard(b.value)}
                title={t("copyToClipboardButton")}
              >
                <CopyIcon />
              </button>
            </div>
            <div className="tree-row-actions">
              <a className="btn-action" href={`${API_URL}/api/barcodes/${b.id}/label.png`} target="_blank" rel="noreferrer">
                {t("viewLabel")}
              </a>
              <button type="button" className="btn-action" onClick={() => requestPrintForBarcode(b.id)}>
                {t("printRequestButton")}
              </button>
              <button type="button" className="btn-action btn-action-danger" onClick={() => removeBarcode(b.id)}>
                {t("delete")}
              </button>
            </div>
          </div>
        ))}

        {!item.barcodes.some((b) => b.source === "GENERATED") && (
          <div className="fab-row">
            <button onClick={generateQr}>{t("generateQrButton")}</button>
          </div>
        )}

        {showAddBarcode ? (
          <div className="form" style={{ marginTop: 12 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                placeholder={t("manualBarcodePlaceholder")}
                value={manualBarcode}
                onChange={(e) => {
                  setManualBarcode(e.target.value);
                  setScannedFormat(null);
                }}
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

            <button className="secondary" onClick={addBarcode} style={{ width: "100%" }}>
              {t("addBarcodeButton")}
            </button>
            {item.itemType === "ASSET" && (
              <>
                <button className="secondary" onClick={addSerialNumber} style={{ marginTop: 8, width: "100%" }}>
                  {t("addSerialNumberButton")}
                </button>
                <p className="meta" style={{ fontSize: "0.8rem" }}>{t("matterCodeHint")}</p>
              </>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="btn-action"
            style={{ marginTop: 12 }}
            onClick={() => setShowAddBarcode(true)}
          >
            {t("showAddBarcodeButton")}
          </button>
        )}
      </div>

      {item.itemType === "ASSET" && (
        <div className="card">
          <h2 style={{ marginTop: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{t("maintenanceSectionTitle")}</span>
            {totalMaintCost > 0 && (
              <span className="meta" style={{ fontSize: "0.9rem", fontWeight: "normal" }}>
                {t("totalMaintenanceCostLabel")}: {totalMaintCost} {item.currency || ""}
              </span>
            )}
          </h2>
          {(!item.maintenanceRecords || item.maintenanceRecords.length === 0) && (
            <p className="meta">{t("noMaintenanceRecords")}</p>
          )}
          {item.maintenanceRecords?.map((r: MaintenanceRecord) => (
            <div key={r.id} className="tree-row">
              <div className="tree-row-value">
                <span className="badge badge-muted">{r.date.slice(0, 10)}</span> {r.description}
                {r.cost != null && (
                  <span className="meta">
                    {" "}
                    ({r.cost}
                    {r.currency ? ` ${r.currency}` : ""})
                  </span>
                )}
              </div>
              <div className="tree-row-actions">
                <button className="secondary" onClick={() => removeMaintenanceRecord(r.id)}>
                  {t("delete")}
                </button>
              </div>
            </div>
          ))}
          <div className="form" style={{ marginTop: 12 }}>
            <input type="date" value={maintDate} onChange={(e) => setMaintDate(e.target.value)} />
            <input
              placeholder={t("maintenanceDescriptionPlaceholder")}
              value={maintDescription}
              onChange={(e) => setMaintDescription(e.target.value)}
            />
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder={t("maintenanceCostPlaceholder")}
              value={maintCost}
              onChange={(e) => setMaintCost(e.target.value)}
            />
            <button
              type="button"
              className="secondary"
              onClick={addMaintenanceRecord}
              disabled={!maintDate || !maintDescription.trim()}
            >
              {t("addMaintenanceRecordButton")}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("attachmentsSectionTitle")}</h2>
        {(!item.attachments || item.attachments.length === 0) && <p className="meta">{t("noAttachments")}</p>}
        {item.attachments && item.attachments.length > 0 && (
          <div className="attachment-grid">
            {(() => {
              const imageCount = item.attachments!.filter((a) => a.mimeType.startsWith("image/")).length;
              return item.attachments!.map((a) => {
                const isImage = a.mimeType.startsWith("image/");
                const fileUrl = `${API_URL}/api/attachments/file/${a.filePath}`;
                const isPrimary = isImage && item.photoUrl === fileUrl;
                return (
                  <div key={a.id} className="attachment-tile">
                    <a className="attachment-thumb" href={fileUrl} target="_blank" rel="noreferrer" title={formatDateTime(a.uploadedAt)}>
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fileUrl} alt={t("attachmentTypeImage")} />
                      ) : (
                        <span className="attachment-file-badge">
                          <FileIcon />
                          {t("attachmentTypePdf")}
                        </span>
                      )}
                    </a>
                    {isPrimary && <span className="attachment-primary-badge">{t("primaryPhotoBadge")}</span>}
                    <button
                      type="button"
                      className="attachment-remove-btn"
                      onClick={() => removeAttachment(a.id)}
                      aria-label={t("delete")}
                      title={t("delete")}
                    >
                      <CloseIcon />
                    </button>
                    {isImage && imageCount > 1 && (
                      <button
                        type="button"
                        className="btn-action attachment-set-primary"
                        onClick={() => setPhotoUrl(item.id, isPrimary ? null : fileUrl)}
                      >
                        {isPrimary ? t("unsetPrimaryPhotoButton") : t("setPrimaryPhotoButton")}
                      </button>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        )}
        <label>
          {t("addAttachmentLabel")}
          <input type="file" accept="image/*,application/pdf" onChange={handleAttachmentUpload} disabled={attachmentUploading} />
        </label>
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
