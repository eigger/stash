"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { PushNotificationSettings } from "../../components/PushNotificationSettings";
import { ThemeToggle } from "../../components/ThemeToggle";
import { LanguageToggle } from "../../components/LanguageToggle";
import { CurrencyToggle } from "../../components/CurrencyToggle";
import { downloadBlob, todayStamp } from "../../lib/download";
export default function SettingsPage() {
  const router = useRouter();
  const { user, loading, isAdmin, logout } = useAuth();
  const { show } = useToast();
  const { t } = useLocale();
  const [restoring, setRestoring] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      show(t("passwordMismatchError"), "error");
      return;
    }
    setChangingPassword(true);
    try {
      await apiJson("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      show(t("passwordChangedReLoginToast"), "success");
      // 서버가 tokenVersion을 올려 현재 JWT를 무효화했으므로 재로그인한다.
      await logout();
    } catch (err: any) {
      show(t("passwordChangeFailToast", { msg: err.message }), "error");
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await apiFetch("/api/backup/export");
      if (!res.ok) throw new Error(t("exportFailFallback"));
      await downloadBlob(res, `stash_backup_${todayStamp()}.tar.gz`);
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setExporting(false);
    }
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
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : t("restoreFailFallback"));

      const recoveries = (body?.recoveryPasswords ?? body?.adminRecoveryPasswords) as
        | { email: string; role?: string; temporaryPassword: string }[]
        | undefined;
      if (recoveries?.length) {
        const lines = recoveries
          .map((r) => `${r.email}${r.role ? ` (${r.role})` : ""}: ${r.temporaryPassword}`)
          .join("\n");
        window.alert(t("restoreRecoveryAlert", { lines }));
      }
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
      <h1>{t("settingsLabel")}</h1>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("myAccountTitle")}</h2>
        <p className="meta">{user.name} ({user.email}) · {user.role === "ADMIN" ? t("roleAdmin") : t("roleGeneral")}</p>
        <button className="secondary" onClick={logout}>{t("logoutButton")}</button>

        <h3 style={{ marginBottom: 8 }}>{t("changePasswordTitle")}</h3>
        <form onSubmit={handleChangePassword} className="form">
          <input
            type="password"
            placeholder={t("currentPasswordPlaceholder")}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder={t("newPasswordPlaceholder")}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
          <input
            type="password"
            placeholder={t("confirmNewPasswordPlaceholder")}
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            minLength={8}
            required
          />
          <button type="submit" className="secondary" disabled={changingPassword}>
            {changingPassword ? t("processingLabel") : t("changePasswordButton")}
          </button>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("screenTitle")}</h2>
        <p className="meta" style={{ marginTop: 0 }}>{t("themeLabel")}</p>
        <ThemeToggle />
        <p className="meta" style={{ marginTop: 12 }}>{t("languageLabel")}</p>
        <LanguageToggle />
        <p className="meta" style={{ marginTop: 12 }}>{t("currencyDefaultLabel")}</p>
        <CurrencyToggle />
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("notificationsTitle")}</h2>
        <PushNotificationSettings />
      </div>

      {isAdmin && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{t("backupRestoreTitle")}</h2>
          <p className="meta">{t("backupRestoreHint")}</p>
          <p className="meta">{t("backupSecurityHint")}</p>
          <div className="form">
            <button onClick={handleExport} disabled={exporting}>
              {exporting ? t("exportingLabel") : t("exportButton")}
            </button>
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
