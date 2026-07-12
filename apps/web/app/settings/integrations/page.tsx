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
  effectiveValue?: string;
}

const LOOKUP_PROVIDER_OPTIONS = [
  { id: "openfoodfacts", labelKey: "providerOpenFoodFacts" },
  { id: "upcitemdb", labelKey: "providerUpcItemDb" },
  { id: "naver", labelKey: "providerNaver" },
] as const;

export default function IntegrationsPage() {
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();
  const { show } = useToast();
  const { t } = useLocale();
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [value, setValue] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [appPublicUrl, setAppPublicUrl] = useState("");
  const [enabledProviders, setEnabledProviders] = useState<string[]>([]);
  const [naverClientId, setNaverClientId] = useState("");
  const [naverClientSecret, setNaverClientSecret] = useState("");
  const [pushConfigured, setPushConfigured] = useState(false);
  const [generatingVapid, setGeneratingVapid] = useState(false);
  const [testingNaver, setTestingNaver] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    else if (!loading && user && !isAdmin) router.push("/");
  }, [loading, user, isAdmin, router]);

  async function refresh() {
    const rows = await apiJson<SettingRow[]>("/api/settings");
    setSettings(rows);
    const providersRow = rows.find((s) => s.key === "LOOKUP_PROVIDERS");
    setEnabledProviders(providersRow?.effectiveValue ? providersRow.effectiveValue.split(",").filter(Boolean) : []);
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

  async function handleAppUrlSave(e: FormEvent) {
    e.preventDefault();
    try {
      await apiJson("/api/settings/APP_PUBLIC_URL", { method: "PUT", body: JSON.stringify({ value: appPublicUrl }) });
      setAppPublicUrl("");
      await refresh();
      show(t("savedToast"), "success");
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function handleAppUrlClear() {
    try {
      await apiJson("/api/settings/APP_PUBLIC_URL", { method: "DELETE" });
      await refresh();
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  function toggleProvider(id: string) {
    setEnabledProviders((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  async function handleProvidersSave() {
    try {
      // 전부 해제하고 저장하면 "none"을 보내서 기본값(Open Food Facts+UPCItemDB)으로
      // 되돌아가지 않고 정말로 외부 조회를 안 쓰는 상태로 저장되게 한다.
      const providersValue = enabledProviders.length > 0 ? enabledProviders.join(",") : "none";
      await apiJson("/api/settings/LOOKUP_PROVIDERS", { method: "PUT", body: JSON.stringify({ value: providersValue }) });
      await refresh();
      show(t("savedToast"), "success");
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function handleNaverSave(e: FormEvent) {
    e.preventDefault();
    try {
      await apiJson("/api/settings/NAVER_CLIENT_ID", { method: "PUT", body: JSON.stringify({ value: naverClientId }) });
      await apiJson("/api/settings/NAVER_CLIENT_SECRET", { method: "PUT", body: JSON.stringify({ value: naverClientSecret }) });
      setNaverClientId("");
      setNaverClientSecret("");
      await refresh();
      show(t("savedToast"), "success");
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function handleNaverClear() {
    try {
      await apiJson("/api/settings/NAVER_CLIENT_ID", { method: "DELETE" });
      await apiJson("/api/settings/NAVER_CLIENT_SECRET", { method: "DELETE" });
      await refresh();
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function handleNaverTest() {
    setTestingNaver(true);
    try {
      const result = await apiJson<{ ok: boolean; sample: string | null }>("/api/settings/test-naver", { method: "POST" });
      show(result.sample ? t("naverTestSuccessToast", { sample: result.sample }) : t("naverTestSuccessNoSampleToast"), "success");
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setTestingNaver(false);
    }
  }

  if (loading || !user || !isAdmin) return null;

  const upc = settings.find((s) => s.key === "UPCITEMDB_API_KEY");
  const webhook = settings.find((s) => s.key === "INVENTORY_WEBHOOK_URL");
  const appUrl = settings.find((s) => s.key === "APP_PUBLIC_URL");
  const naverClientIdRow = settings.find((s) => s.key === "NAVER_CLIENT_ID");
  const naverClientSecretRow = settings.find((s) => s.key === "NAVER_CLIENT_SECRET");
  const naverConfigured = Boolean(naverClientIdRow?.hasValue && naverClientSecretRow?.hasValue);

  return (
    <main className="container">
      <h1>{t("integrationsTitle")}</h1>
      <p className="scan-hint">{t("integrationsHint")}</p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("appUrlTitle")}</h2>
        <p className="meta">{t("appUrlHint")}</p>
        <p className="meta">
          {t("appUrlEffectiveLabel")} <code>{appUrl?.effectiveValue}</code>
          {appUrl?.hasValue ? ` (${t("appUrlSourceSetting")})` : ` (${t("appUrlSourceEnv")})`}
        </p>
        <form onSubmit={handleAppUrlSave} className="form">
          <input
            placeholder={t("appUrlPlaceholder")}
            value={appPublicUrl}
            onChange={(e) => setAppPublicUrl(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={{ flex: 1 }}>
              {t("save")}
            </button>
            {appUrl?.hasValue && (
              <button type="button" className="secondary" onClick={handleAppUrlClear} style={{ flex: 1 }}>
                {t("remove")}
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("lookupProvidersTitle")}</h2>
        <p className="meta">{t("lookupProvidersHint")}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "12px 0" }}>
          {LOOKUP_PROVIDER_OPTIONS.map((opt) => (
            <label key={opt.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={enabledProviders.includes(opt.id)}
                onChange={() => toggleProvider(opt.id)}
              />
              {t(opt.labelKey)}
            </label>
          ))}
        </div>
        <button type="button" onClick={handleProvidersSave} style={{ width: "100%" }}>
          {t("save")}
        </button>
      </div>

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
        <h2 style={{ marginTop: 0 }}>{t("naverTitle")}</h2>
        <p className="meta">{t("naverHint")}</p>
        <p className="meta">{t("statusLabel")} {naverConfigured ? t("statusSet") : t("statusUnset")}</p>
        <form onSubmit={handleNaverSave} className="form">
          <input
            placeholder={t("naverClientIdPlaceholder")}
            value={naverClientId}
            onChange={(e) => setNaverClientId(e.target.value)}
          />
          <input
            placeholder={t("naverClientSecretPlaceholder")}
            value={naverClientSecret}
            onChange={(e) => setNaverClientSecret(e.target.value)}
            type="password"
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={{ flex: 1 }}>
              {t("save")}
            </button>
            {naverConfigured && (
              <button type="button" className="secondary" onClick={handleNaverClear} style={{ flex: 1 }}>
                {t("remove")}
              </button>
            )}
          </div>
        </form>
        {naverConfigured && (
          <button
            type="button"
            className="secondary"
            onClick={handleNaverTest}
            disabled={testingNaver}
            style={{ width: "100%", marginTop: 8 }}
          >
            {testingNaver ? t("testingButton") : t("naverTestButton")}
          </button>
        )}
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
