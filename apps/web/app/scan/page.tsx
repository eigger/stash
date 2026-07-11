"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { useLocale } from "../../lib/i18n/locale-context";
import type { ScanResult } from "../../lib/types";

// 연속 스캔(streak) UX: 화면 전환 없이 계속 카메라를 켜둔 채로 스캔 → 자동 저장 →
// 다음 스캔이 이어진다. 장보기 후 한 번에 재고를 채울 때 마찰이 없어야 하기 때문.
const DUPLICATE_COOLDOWN_MS = 3000;

export default function ScanPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { show } = useToast();
  const { t } = useLocale();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);
  const processingRef = useRef(false);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [manualValue, setManualValue] = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !videoRef.current) return;
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    reader
      .decodeFromConstraints({ video: { facingMode: "environment" } }, videoRef.current, (result) => {
        if (cancelled || !result) return;
        handleDetected(result.getText());
      })
      .then((controls) => {
        controlsRef.current = controls;
      })
      .catch(() => {
        setCameraError(t("cameraError"));
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleDetected(value: string) {
    const now = Date.now();
    // 같은 프레임에서 같은 바코드가 반복 인식되는 걸 걸러낸다.
    if (lastScanRef.current && lastScanRef.current.value === value && now - lastScanRef.current.at < DUPLICATE_COOLDOWN_MS) {
      return;
    }
    lastScanRef.current = { value, at: now };
    await submitScan(value);
  }

  async function submitScan(value: string) {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    try {
      const result = await apiJson<ScanResult>("/api/items/scan", {
        method: "POST",
        body: JSON.stringify({ barcodeValue: value }),
      });
      setLastResult(result);
      show(
        result.created
          ? t("scanCreatedToast", { name: result.item.name })
          : t("scanIncreasedToast", { name: result.item.name, qty: result.item.quantity }),
        "success",
      );
    } catch (err: any) {
      show(t("scanFailToast", { msg: err.message }), "error");
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }

  async function handleManualSubmit(e: FormEvent) {
    e.preventDefault();
    if (!manualValue.trim()) return;
    await submitScan(manualValue.trim());
    setManualValue("");
  }

  if (loading || !user) return null;

  return (
    <main className="container">
      <h1>{t("scanTitle")}</h1>
      <p className="scan-hint">{t("scanHint")}</p>

      {cameraError ? (
        <p className="error-text">{cameraError}</p>
      ) : (
        <div className="scanner-frame">
          <video ref={videoRef} muted playsInline />
        </div>
      )}

      {processing && <p className="scan-hint">{t("processingLabel")}</p>}

      {lastResult && (
        <div className="streak-banner">
          {lastResult.created ? t("createdLabel") : t("increasedLabel")}: {lastResult.item.name} ({t("quantityLabel")}{" "}
          {lastResult.item.quantity}){" "}
          <a href={`/items/${lastResult.item.id}`} style={{ color: "#fff", textDecoration: "underline" }}>
            {t("viewDetail")}
          </a>
        </div>
      )}

      <form onSubmit={handleManualSubmit} className="form" style={{ marginTop: 16 }}>
        <input
          placeholder={t("manualInputPlaceholder")}
          value={manualValue}
          onChange={(e) => setManualValue(e.target.value)}
        />
        <button type="submit" className="secondary" disabled={processing}>
          {t("manualSubmit")}
        </button>
      </form>
    </main>
  );
}
