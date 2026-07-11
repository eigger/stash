"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { useToast } from "../../../lib/toast-context";
import { useLocale } from "../../../lib/i18n/locale-context";
import { getPushConfig } from "../../../lib/push";

interface SettingRow {
  key: string;
  hasValue: boolean;
}

export default function IntegrationsPage() {
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();
  const { show } = useToast();
  const { t } = useLocale();
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [value, setValue] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [pushConfigured, setPushConfigured] = useState(false);
  const [generatingVapid, setGeneratingVapid] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    else if (!loading && user && !isAdmin) router.push("/");
  }, [loading, user, isAdmin, router]);

  async function refresh() {
    setSettings(await apiJson<SettingRow[]>("/api/settings"));
  }

  async function refreshPushConfig() {
    const config = await getPushConfig();
    setPushConfigured(config.configured);
  }

  useEffect(() => {
    if (isAdmin) {
      refresh();
      refreshPushConfig();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function handleGenerateVapid() {
    setGeneratingVapid(true);
    try {
      await apiJson("/api/push/vapid/generate", { method: "POST" });
      await refreshPushConfig();
      show(t("vapidIssuedToast"), "success");
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setGeneratingVapid(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    try {
      await apiJson("/api/settings/UPCITEMDB_API_KEY", { method: "PUT", body: JSON.stringify({ value }) });
      setValue("");
      await refresh();
      show(t("savedToast"), "success");
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function handleClear() {
    try {
      await apiJson("/api/settings/UPCITEMDB_API_KEY", { method: "DELETE" });
      await refresh();
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function handleWebhookSave(e: FormEvent) {
    e.preventDefault();
    try {
      await apiJson("/api/settings/INVENTORY_WEBHOOK_URL", { method: "PUT", body: JSON.stringify({ value: webhookUrl }) });
      setWebhookUrl("");
      await refresh();
      show(t("savedToast"), "success");
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function handleWebhookClear() {
    try {
      await apiJson("/api/settings/INVENTORY_WEBHOOK_URL", { method: "DELETE" });
      await refresh();
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  if (loading || !user || !isAdmin) return null;

  const upc = settings.find((s) => s.key === "UPCITEMDB_API_KEY");
  const webhook = settings.find((s) => s.key === "INVENTORY_WEBHOOK_URL");

  return (
    <main className="container">
      <h1>{t("integrationsTitle")}</h1>
      <p className="scan-hint">{t("integrationsHint")}</p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("upcTitle")}</h2>
        <p className="meta">{t("statusLabel")} {upc?.hasValue ? t("statusSet") : t("statusUnset")}</p>
        <form onSubmit={handleSave} className="form">
          <input placeholder={t("apiKeyPlaceholder")} value={value} onChange={(e) => setValue(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={{ flex: 1 }}>
              {t("save")}
            </button>
            {upc?.hasValue && (
              <button type="button" className="secondary" onClick={handleClear} style={{ flex: 1 }}>
                {t("remove")}
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("webhookTitle")}</h2>
        <p className="meta">{t("webhookHint")}</p>
        <details style={{ marginBottom: 8 }}>
          <summary style={{ cursor: "pointer", color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
            {t("viewPayloadFields")}
          </summary>
          <ul className="meta" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            <li><code>{t("payloadEventDesc")}</code></li>
            <li><code>itemId</code>, <code>name</code>, <code>quantity</code>, <code>unit</code></li>
            <li><code>locationId</code>, <code>locationName</code></li>
            <li>{t("payloadBarcodeDesc")}</li>
            <li>{t("payloadImageDesc")}</li>
            <li><code>timestamp</code></li>
          </ul>
        </details>
        <p className="meta">{t("statusLabel")} {webhook?.hasValue ? t("statusSet") : t("statusUnset")}</p>
        <form onSubmit={handleWebhookSave} className="form">
          <input
            placeholder={t("webhookUrlPlaceholder")}
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={{ flex: 1 }}>
              {t("save")}
            </button>
            {webhook?.hasValue && (
              <button type="button" className="secondary" onClick={handleWebhookClear} style={{ flex: 1 }}>
                {t("remove")}
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("pushKeyTitle")}</h2>
        <p className="meta">{t("pushKeyHint")}</p>
        <p className="meta">{t("statusLabel")} {pushConfigured ? t("pushKeyStatusIssued") : t("pushKeyStatusNotIssued")}</p>
        <button className="secondary" onClick={handleGenerateVapid} disabled={generatingVapid || pushConfigured}>
          {generatingVapid ? t("issuingButton") : pushConfigured ? t("alreadyIssued") : t("issueKeyButton")}
        </button>
      </div>
    </main>
  );
}
