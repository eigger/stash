"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { BrowserCodeReader, BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { apiJson } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { useToast } from "../../../lib/toast-context";
import { useLocale } from "../../../lib/i18n/locale-context";
import { playBeep, unlockBeepAudio } from "../../../lib/beep";
import { createScanHints, SCAN_VIDEO_CONSTRAINTS } from "../../../lib/barcodeScanner";
import { TorchButton } from "../../../components/TorchButton";
import { buildOrderedLocationTree } from "../../../lib/locationTree";
import type {
  AuditScanResult,
  AuditSession,
  AuditUnscannedAction,
  Item,
  Location,
} from "../../../lib/types";

const DUPLICATE_COOLDOWN_MS = 2500;

type PendingConfirm = {
  item: Item;
  inScope: boolean;
  alreadyFound: boolean;
  actualQuantity: number;
  moveHere: boolean;
};

type PendingUnknown = {
  barcodeValue: string;
  name: string;
  quantity: number;
};

export default function AuditSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const router = useRouter();
  const { user, loading } = useAuth();
  const { show } = useToast();
  const { t } = useLocale();

  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);
  const processingRef = useRef(false);

  const [session, setSession] = useState<AuditSession | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [unknown, setUnknown] = useState<PendingUnknown | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishAction, setFinishAction] = useState<AuditUnscannedAction>("LEAVE");
  const [moveToLocationId, setMoveToLocationId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !sessionId) return;
    void (async () => {
      try {
        const [s, locs] = await Promise.all([
          apiJson<AuditSession>(`/api/audit/sessions/${sessionId}`),
          apiJson<Location[]>("/api/locations"),
        ]);
        if (s.status !== "ACTIVE") {
          show(t("auditCancelledToast"), "error");
          router.replace("/audit");
          return;
        }
        setSession(s);
        setLocations(locs);
        setMoveToLocationId(locs.find((l) => l.id !== s.locationId)?.id ?? "");
      } catch (err: any) {
        show(err.message, "error");
        router.replace("/audit");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sessionId]);

  useEffect(() => {
    window.addEventListener("pointerdown", unlockBeepAudio, { once: true });
    return () => window.removeEventListener("pointerdown", unlockBeepAudio);
  }, []);

  useEffect(() => {
    if (!user || !session || !videoRef.current || finishing || pending || unknown) return;
    let cancelled = false;

    void (async () => {
      try {
        // /scan과 동일 — createScanHints는 동적 import로 zxing library 청크를 늦춘다.
        const hints = await createScanHints();
        if (cancelled || !videoRef.current) return;
        const reader = new BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromConstraints(
          { video: SCAN_VIDEO_CONSTRAINTS },
          videoRef.current,
          (result) => {
            if (cancelled || !result) return;
            void handleDetected(result.getText());
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        const stream = videoRef.current?.srcObject;
        if (stream instanceof MediaStream) {
          setTorchSupported(BrowserCodeReader.mediaStreamIsTorchCompatible(stream));
        }
      } catch {
        if (!cancelled) setCameraError(t("cameraError"));
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      setTorchSupported(false);
      setTorchOn(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, session?.id, finishing, pending, unknown]);

  async function toggleTorch() {
    const next = !torchOn;
    try {
      await controlsRef.current?.switchTorch?.(next);
      setTorchOn(next);
    } catch {
      // 토치 실패는 스캔을 막지 않는다.
    }
  }

  async function handleDetected(value: string) {
    const now = Date.now();
    const last = lastScanRef.current;
    if (last && last.value === value && now - last.at < DUPLICATE_COOLDOWN_MS) return;
    if (processingRef.current || pending || unknown) return;
    lastScanRef.current = { value, at: now };
    if (navigator.vibrate) navigator.vibrate(30);
    playBeep();
    await submitScan(value);
  }

  async function submitScan(barcodeValue: string) {
    if (!navigator.onLine) {
      show(t("auditOnlineOnly"), "error");
      return;
    }
    processingRef.current = true;
    setProcessing(true);
    try {
      const result = await apiJson<AuditScanResult>(`/api/audit/sessions/${sessionId}/scan`, {
        method: "POST",
        body: JSON.stringify({ barcodeValue }),
      });
      setSession(result.session);
      if (result.status === "unknown") {
        setUnknown({ barcodeValue: result.barcodeValue, name: "", quantity: 1 });
        return;
      }
      setPending({
        item: result.item,
        inScope: result.inScope,
        alreadyFound: result.status === "already_found",
        actualQuantity: result.item.itemType === "ASSET" ? 1 : result.item.quantity,
        moveHere: !result.inScope,
      });
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }

  async function confirmPending() {
    if (!pending) return;
    setSaving(true);
    try {
      const res = await apiJson<{ item: Item; session: AuditSession }>(
        `/api/audit/sessions/${sessionId}/confirm`,
        {
          method: "POST",
          body: JSON.stringify({
            itemId: pending.item.id,
            actualQuantity: pending.actualQuantity,
            moveHere: pending.moveHere,
          }),
        },
      );
      setSession(res.session);
      show(t("auditConfirmedToast", { name: res.item.name }), "success");
      setPending(null);
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function registerUnknown() {
    if (!unknown || !unknown.name.trim()) return;
    setSaving(true);
    try {
      const res = await apiJson<{ item: Item; session: AuditSession }>(
        `/api/audit/sessions/${sessionId}/register`,
        {
          method: "POST",
          body: JSON.stringify({
            barcodeValue: unknown.barcodeValue,
            name: unknown.name.trim(),
            quantity: unknown.quantity,
          }),
        },
      );
      setSession(res.session);
      show(t("auditConfirmedToast", { name: res.item.name }), "success");
      setUnknown(null);
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function finishSession() {
    if (!session) return;
    if (finishAction === "MOVE" && !moveToLocationId) {
      show(t("selectLocationRequired"), "error");
      return;
    }
    setSaving(true);
    try {
      await apiJson(`/api/audit/sessions/${sessionId}/finish`, {
        method: "POST",
        body: JSON.stringify({
          defaultAction: finishAction,
          moveToLocationId: finishAction === "MOVE" ? moveToLocationId : undefined,
        }),
      });
      show(t("auditDoneToast"), "success");
      router.replace("/audit");
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function cancelSession() {
    if (!confirm(t("auditCancelConfirm"))) return;
    try {
      await apiJson(`/api/audit/sessions/${sessionId}/cancel`, { method: "POST" });
      show(t("auditCancelledToast"), "success");
      router.replace("/audit");
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function handleManualSubmit(e: FormEvent) {
    e.preventDefault();
    if (!manualValue.trim()) return;
    await submitScan(manualValue.trim());
    setManualValue("");
  }

  if (loading || !user || !session) return null;

  const pendingChecks = session.checks.filter((c) => c.status === "PENDING");
  const orderedLocations = buildOrderedLocationTree(locations);

  if (finishing) {
    return (
      <main className="container" style={{ paddingBottom: 84 }}>
        <h1>{t("auditFinishTitle")}</h1>
        <p className="meta">{t("auditFinishHint", { n: pendingChecks.length })}</p>

        {pendingChecks.length === 0 ? (
          <p className="meta">{t("auditPendingList")}: 0</p>
        ) : (
          <ul className="meta" style={{ paddingLeft: 18 }}>
            {pendingChecks.slice(0, 40).map((c) => (
              <li key={c.id}>
                {c.item.name} ({c.expectedQuantity})
              </li>
            ))}
            {pendingChecks.length > 40 && <li>… +{pendingChecks.length - 40}</li>}
          </ul>
        )}

        <div className="card" style={{ marginTop: 12 }}>
          {(
            [
              ["LEAVE", "auditActionLeave"],
              ["ZERO", "auditActionZero"],
              ["MOVE", "auditActionMove"],
            ] as const
          ).map(([value, key]) => (
            <label key={value} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <input
                type="radio"
                name="finish-action"
                checked={finishAction === value}
                onChange={() => setFinishAction(value)}
              />
              {t(key)}
            </label>
          ))}
          {finishAction === "MOVE" && (
            <select
              value={moveToLocationId}
              onChange={(e) => setMoveToLocationId(e.target.value)}
              style={{ width: "100%", marginTop: 8 }}
            >
              <option value="">{t("auditMoveToLabel")}</option>
              {orderedLocations
                .filter(({ location: loc }) => loc.id !== session.locationId)
                .map(({ location: loc, depth }) => (
                  <option key={loc.id} value={loc.id}>
                    {"— ".repeat(depth)}
                    {loc.name}
                  </option>
                ))}
            </select>
          )}
          <button type="button" onClick={finishSession} disabled={saving} style={{ width: "100%", marginTop: 12 }}>
            {saving ? t("processingLabel") : t("auditFinishSubmit")}
          </button>
          <button type="button" className="secondary" onClick={() => setFinishing(false)} style={{ width: "100%", marginTop: 8 }}>
            {t("skipButton")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="container" style={{ paddingBottom: 84 }}>
      <h1>
        {t("auditTitle")} · {session.location.name}
      </h1>
      <p className="meta">
        {t("auditProgress", {
          found: session.progress.foundExpected,
          total: session.progress.expectedTotal,
          pending: session.progress.pending,
        })}
        {session.progress.unexpected > 0 &&
          ` · ${t("auditUnexpectedCount", { n: session.progress.unexpected })}`}
      </p>
      <p className="scan-hint">{t("auditHint")}</p>

      {cameraError ? (
        <p className="error-text">{cameraError}</p>
      ) : !pending && !unknown ? (
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
      ) : null}

      {processing && <p className="scan-hint">{t("processingLabel")}</p>}

      {pending && (
        <div className="card" style={{ marginTop: 8 }}>
          <strong>{pending.item.name}</strong>
          {pending.alreadyFound && <p className="meta">{t("auditAlreadyFound")}</p>}
          {!pending.inScope && <p className="meta">{t("auditOutOfScope")}</p>}
          {pending.item.itemType === "CONSUMABLE" ? (
            <input
              type="number"
              min={0}
              value={pending.actualQuantity}
              onChange={(e) =>
                setPending({ ...pending, actualQuantity: Math.max(0, Number(e.target.value) || 0) })
              }
              style={{ width: "100%", marginTop: 8 }}
            />
          ) : (
            <p className="meta" style={{ marginTop: 8 }}>
              ASSET
            </p>
          )}
          {!pending.inScope && (
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
              <input
                type="checkbox"
                checked={pending.moveHere}
                onChange={(e) => setPending({ ...pending, moveHere: e.target.checked })}
              />
              {t("auditMoveHere")}
            </label>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" onClick={confirmPending} disabled={saving} style={{ flex: 1 }}>
              {saving ? t("processingLabel") : t("auditConfirmButton")}
            </button>
            <button type="button" className="secondary" onClick={() => setPending(null)} style={{ flex: 1 }}>
              {t("skipButton")}
            </button>
          </div>
        </div>
      )}

      {unknown && (
        <div className="card" style={{ marginTop: 8 }}>
          <strong>{t("auditUnknownTitle")}</strong>
          <p className="meta">{t("auditUnknownHint")}</p>
          <p className="meta">{unknown.barcodeValue}</p>
          <input
            placeholder={t("namePlaceholderRequired")}
            value={unknown.name}
            onChange={(e) => setUnknown({ ...unknown, name: e.target.value })}
            autoFocus
            style={{ width: "100%", marginBottom: 8 }}
          />
          <input
            type="number"
            min={0}
            value={unknown.quantity}
            onChange={(e) => setUnknown({ ...unknown, quantity: Math.max(0, Number(e.target.value) || 0) })}
            style={{ width: "100%", marginBottom: 8 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={registerUnknown} disabled={saving || !unknown.name.trim()} style={{ flex: 1 }}>
              {saving ? t("processingLabel") : t("auditRegisterButton")}
            </button>
            <button type="button" className="secondary" onClick={() => setUnknown(null)} style={{ flex: 1 }}>
              {t("skipButton")}
            </button>
          </div>
        </div>
      )}

      {!pending && !unknown && (
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
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button type="button" onClick={() => setFinishing(true)} style={{ flex: 1 }}>
          {t("auditFinishButton")}
        </button>
        <button type="button" className="secondary" onClick={cancelSession} style={{ flex: 1 }}>
          {t("auditCancelButton")}
        </button>
      </div>

      {pendingChecks.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary className="meta">{t("auditPendingList")} ({pendingChecks.length})</summary>
          <ul className="meta" style={{ paddingLeft: 18 }}>
            {pendingChecks.map((c) => (
              <li key={c.id}>
                {c.item.name} · {c.expectedQuantity}
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
