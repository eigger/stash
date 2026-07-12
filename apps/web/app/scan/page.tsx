"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BrowserCodeReader, BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { apiJson, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { enqueueScan, getScanQueue, removeFromScanQueue } from "../../lib/scanQueue";
import { playBeep, unlockBeepAudio } from "../../lib/beep";
import { SCAN_HINTS, SCAN_VIDEO_CONSTRAINTS } from "../../lib/barcodeScanner";
import { TorchButton } from "../../components/TorchButton";
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
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);
  const processingRef = useRef(false);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [lastMode, setLastMode] = useState<"restock" | "consume">("restock");
  const [processing, setProcessing] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [mode, setMode] = useState<"restock" | "consume">("restock");
  const modeRef = useRef(mode);
  const [queueCount, setQueueCount] = useState(0);
  const flushingRef = useRef(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    setQueueCount(getScanQueue().length);
    flushScanQueue();
    window.addEventListener("online", flushScanQueue);
    return () => window.removeEventListener("online", flushScanQueue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // 스캔 감지는 사용자 클릭이 아니라 카메라 콜백에서 일어나 브라우저의 오디오
    // 자동재생 제한에 걸릴 수 있다 — 화면을 처음 터치하는 순간 미리 오디오를 깨워둔다.
    window.addEventListener("pointerdown", unlockBeepAudio, { once: true });
    return () => window.removeEventListener("pointerdown", unlockBeepAudio);
  }, []);

  async function flushScanQueue() {
    // mount에서 한 번, "online" 이벤트마다 한 번씩 호출될 수 있어 겹칠 수 있다 —
    // 재진입을 막지 않으면 같은 큐를 두 번 처리해서 항목마다 서버에 두 번 전송된다.
    if (flushingRef.current) return;
    flushingRef.current = true;
    try {
      const queue = getScanQueue();
      if (queue.length === 0) return;
      let synced = 0;
      let rejected = 0;
      for (const entry of queue) {
        try {
          await apiJson<ScanResult>("/api/items/scan", {
            method: "POST",
            body: JSON.stringify({ barcodeValue: entry.barcodeValue, delta: entry.delta }),
          });
          removeFromScanQueue(entry.id);
          synced++;
        } catch (err) {
          // 400(예: 미등록 바코드 소비)만 "서버가 영구히 거부함"으로 보고 큐에서 제거한다.
          // 그 외(네트워크 오류, 401 토큰 만료, 5xx 등)는 일시적일 수 있으니 큐에 남겨
          // 다음 기회에 다시 시도한다 — 여기서 지우면 재로그인/재접속 후 되돌릴 수 없이 유실된다.
          if (err instanceof ApiError && err.status === 400) {
            removeFromScanQueue(entry.id);
            rejected++;
            continue;
          }
          break;
        }
      }
      setQueueCount(getScanQueue().length);
      if (synced > 0 || rejected > 0) {
        show(t("scanQueueFlushedToast", { synced, rejected }), rejected > 0 ? "error" : "success");
      }
    } finally {
      flushingRef.current = false;
    }
  }

  useEffect(() => {
    if (!user || !videoRef.current) return;
    const reader = new BrowserMultiFormatReader(SCAN_HINTS);
    let cancelled = false;

    reader
      .decodeFromConstraints({ video: SCAN_VIDEO_CONSTRAINTS }, videoRef.current, (result) => {
        if (cancelled || !result) return;
        handleDetected(result.getText());
      })
      .then((controls) => {
        controlsRef.current = controls;
        const stream = videoRef.current?.srcObject;
        if (stream instanceof MediaStream) {
          setTorchSupported(BrowserCodeReader.mediaStreamIsTorchCompatible(stream));
        }
      })
      .catch(() => {
        setCameraError(t("cameraError"));
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      setTorchSupported(false);
      setTorchOn(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function toggleTorch() {
    const next = !torchOn;
    try {
      await controlsRef.current?.switchTorch?.(next);
      setTorchOn(next);
    } catch {
      // 토치 전환 실패는 스캔 자체를 막을 이유가 안 된다 — 조용히 무시.
    }
  }

  async function handleDetected(value: string) {
    const now = Date.now();
    // 같은 프레임에서 같은 바코드가 반복 인식되는 걸 걸러낸다.
    if (lastScanRef.current && lastScanRef.current.value === value && now - lastScanRef.current.at < DUPLICATE_COOLDOWN_MS) {
      return;
    }
    lastScanRef.current = { value, at: now };
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(80);
    playBeep();
    await submitScan(value);
  }

  async function submitScan(value: string) {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    const activeMode = modeRef.current;
    const delta = activeMode === "consume" ? -1 : 1;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      enqueueScan({ barcodeValue: value, delta });
      setQueueCount(getScanQueue().length);
      show(t("scanQueuedToast"), "success");
      processingRef.current = false;
      setProcessing(false);
      return;
    }

    try {
      const result = await apiJson<ScanResult>("/api/items/scan", {
        method: "POST",
        body: JSON.stringify({ barcodeValue: value, delta }),
      });
      setLastResult(result);
      setLastMode(activeMode);
      if (result.created) {
        show(t("scanCreatedToast", { name: result.item.name }), "success");
      } else if (activeMode === "consume") {
        show(t("scanDecreasedToast", { name: result.item.name, qty: result.item.quantity }), "success");
      } else {
        show(t("scanIncreasedToast", { name: result.item.name, qty: result.item.quantity }), "success");
      }
    } catch (err: any) {
      if (err instanceof TypeError) {
        // fetch 자체가 실패 — 네트워크가 끊긴 것으로 보고 큐에 쌓아 나중에 재전송한다.
        enqueueScan({ barcodeValue: value, delta });
        setQueueCount(getScanQueue().length);
        show(t("scanQueuedToast"), "success");
      } else {
        show(t("scanFailToast", { msg: err.message }), "error");
      }
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
    <main className="container" style={{ paddingBottom: 84 }}>
      <h1>{t("scanTitle")}</h1>
      <p className="scan-hint">{t("scanHint")}</p>
      {queueCount > 0 && <p className="scan-hint">{t("scanQueuePendingHint", { count: queueCount })}</p>}

      {cameraError ? (
        <p className="error-text">{cameraError}</p>
      ) : (
        <div className="scanner-frame">
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

      {processing && <p className="scan-hint">{t("processingLabel")}</p>}

      {lastResult && (
        <div className="streak-banner">
          {lastResult.created ? t("createdLabel") : lastMode === "consume" ? t("decreasedLabel") : t("increasedLabel")}:{" "}
          {lastResult.item.name} ({t("quantityLabel")}{" "}
          {lastResult.item.quantity}){" "}
          <a href={`/items/${lastResult.item.id}`} style={{ color: "inherit", textDecoration: "underline" }}>
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

      <div className="sticky-bottom-bar">
        <button
          type="button"
          className={mode === "restock" ? "" : "secondary"}
          onClick={() => setMode("restock")}
          style={{ flex: 1 }}
        >
          {t("scanModeRestock")}
        </button>
        <button
          type="button"
          className={mode === "consume" ? "" : "secondary"}
          onClick={() => setMode("consume")}
          style={{ flex: 1 }}
        >
          {t("scanModeConsume")}
        </button>
      </div>
    </main>
  );
}
