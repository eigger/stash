"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { API_URL, apiFetch, getToken } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { PushNotificationSettings } from "../../components/PushNotificationSettings";
import { ThemeToggle } from "../../components/ThemeToggle";
import { LanguageToggle } from "../../components/LanguageToggle";

export default function BackupPage() {
  const router = useRouter();
  const { user, loading, isAdmin, logout } = useAuth();
  const { show } = useToast();
  const { t } = useLocale();
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  async function handleExport() {
    const token = getToken();
    window.location.href = `${API_URL}/api/backup/export?token=${token}`;
  }

  async function handleRestore(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm(t("confirmRestore"))) return;
    setRestoring(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiFetch("/api/backup/restore", { method: "POST", body: formData });
      if (!res.ok) throw new Error(t("restoreFailFallback"));
      show(t("restoreSuccessToast"), "success");
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setRestoring(false);
    }
  }

  if (loading || !user) return null;

  return (
    <main className="container">
      <h1>{t("moreTitle")}</h1>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("myAccountTitle")}</h2>
        <p className="meta">{user.name} ({user.email}) · {user.role === "ADMIN" ? t("roleAdmin") : t("roleGeneral")}</p>
        <button className="secondary" onClick={logout}>{t("logoutButton")}</button>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("screenTitle")}</h2>
        <p className="meta" style={{ marginTop: 0 }}>{t("themeLabel")}</p>
        <ThemeToggle />
        <p className="meta" style={{ marginTop: 12 }}>{t("languageLabel")}</p>
        <LanguageToggle />
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("notificationsTitle")}</h2>
        <PushNotificationSettings />
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("menuTitle")}</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <a href="/locations"><button className="secondary" style={{ width: "100%" }}>{t("manageLocations")}</button></a>
          <a href="/categories"><button className="secondary" style={{ width: "100%" }}>{t("manageCategories")}</button></a>
          <a href="/labels"><button className="secondary" style={{ width: "100%" }}>{t("printLabels")}</button></a>
          <a href="/history"><button className="secondary" style={{ width: "100%" }}>{t("stockHistory")}</button></a>
          {isAdmin && <a href="/users"><button className="secondary" style={{ width: "100%" }}>{t("familyAccounts")}</button></a>}
          {isAdmin && <a href="/settings/integrations"><button className="secondary" style={{ width: "100%" }}>{t("integrationSettings")}</button></a>}
        </div>
      </div>

      {isAdmin && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{t("backupRestoreTitle")}</h2>
          <p className="meta">{t("backupRestoreHint")}</p>
          <div className="form">
            <button onClick={handleExport}>{t("exportButton")}</button>
            <label>
              {t("restoreLabel")}
              <input type="file" accept=".tar.gz" onChange={handleRestore} disabled={restoring} />
            </label>
          </div>
        </div>
      )}
    </main>
  );
}
