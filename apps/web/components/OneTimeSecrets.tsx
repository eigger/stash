"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale } from "../lib/i18n/locale-context";
import { useToast } from "../lib/toast-context";
import { todayStamp } from "../lib/download";

export type OneTimeSecret = {
  label: string;
  value: string;
};

type Props = {
  title: string;
  hint: string;
  secrets: OneTimeSecret[];
  downloadFilename?: string;
  onClose: () => void;
};

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // HTTP 등 비보안 컨텍스트에서는 Clipboard API가 실패한다 — 선택 폴백으로 넘긴다.
  }
  return false;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * 서버에 평문으로 남지 않는 1회성 비밀(임시 비밀번호 등)을 보여준다.
 * window.alert는 iOS에서 복사가 안 되고 Enter 한 번에 소실되므로 모달+복사+다운로드로 대체한다.
 */
export function OneTimeSecrets({ title, hint, secrets, downloadFilename, onClose }: Props) {
  const { t } = useLocale();
  const { show } = useToast();
  const [saved, setSaved] = useState(false);
  const [copyHint, setCopyHint] = useState(false);
  const titleId = useId();
  const firstValueRef = useRef<HTMLCodeElement>(null);

  useEffect(() => {
    firstValueRef.current?.focus();
  }, []);

  function secretsAsText() {
    return secrets.map((s) => `${s.label}: ${s.value}`).join("\n");
  }

  async function handleCopyOne(value: string, el: HTMLElement | null) {
    const ok = await copyText(value);
    if (ok) {
      show(t("oneTimeSecretCopiedToast"), "success");
      setCopyHint(false);
      return;
    }
    // 클립보드 실패 시 사용자가 길게 눌러 복사할 수 있게 선택한다.
    const range = document.createRange();
    range.selectNodeContents(el ?? document.createElement("span"));
    if (el) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    setCopyHint(true);
    show(t("oneTimeSecretCopyFallbackToast"), "info");
  }

  async function handleCopyAll() {
    const ok = await copyText(secretsAsText());
    if (ok) {
      show(t("oneTimeSecretCopiedToast"), "success");
      setCopyHint(false);
      return;
    }
    setCopyHint(true);
    show(t("oneTimeSecretCopyFallbackToast"), "info");
  }

  function handleDownload() {
    const name = downloadFilename ?? `stash-one-time-secrets_${todayStamp()}.txt`;
    downloadTextFile(name, secretsAsText());
    show(t("oneTimeSecretDownloadedToast"), "success");
  }

  function handleClose() {
    if (!saved) return;
    onClose();
  }

  return (
    <div
      className="one-time-secrets-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      // 바깥 클릭으로 닫히면 안 된다 — 실수로 영구 소실되는 걸 막기 위함.
      onClick={(e) => e.stopPropagation()}
    >
      <div className="one-time-secrets-card card">
        <h2 id={titleId} style={{ marginTop: 0 }}>
          {title}
        </h2>
        <p className="meta" style={{ marginTop: 0 }}>
          {hint}
        </p>
        {copyHint && (
          <p className="meta" style={{ color: "var(--color-warning, #b45309)" }}>
            {t("oneTimeSecretSelectHint")}
          </p>
        )}

        <ul className="one-time-secrets-list">
          {secrets.map((s, i) => (
            <li key={`${s.label}-${i}`}>
              <div className="one-time-secrets-row">
                <span className="meta">{s.label}</span>
                <code
                  ref={i === 0 ? firstValueRef : undefined}
                  tabIndex={0}
                  className="one-time-secrets-value"
                  // user-select로 길게 눌러 복사 가능하게 — HTTP 폴백의 핵심.
                >
                  {s.value}
                </code>
                <button
                  type="button"
                  className="secondary"
                  onClick={(e) => {
                    const row = (e.currentTarget.parentElement as HTMLElement | null)?.querySelector("code");
                    void handleCopyOne(s.value, row);
                  }}
                >
                  {t("oneTimeSecretCopyButton")}
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="one-time-secrets-actions">
          <button type="button" className="secondary" onClick={() => void handleCopyAll()}>
            {t("oneTimeSecretCopyAllButton")}
          </button>
          <button type="button" className="secondary" onClick={handleDownload}>
            {t("oneTimeSecretDownloadButton")}
          </button>
        </div>

        <label className="one-time-secrets-confirm">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          {t("oneTimeSecretSavedCheckbox")}
        </label>

        <button type="button" onClick={handleClose} disabled={!saved}>
          {t("oneTimeSecretCloseButton")}
        </button>
      </div>
    </div>
  );
}
