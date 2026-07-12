"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";

export default function MorePage() {
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();
  const { t } = useLocale();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  if (loading || !user) return null;

  return (
    <main className="container">
      <h1>{t("moreTitle")}</h1>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("menuGroupStructure")}</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <a href="/locations"><button className="secondary" style={{ width: "100%" }}>{t("manageLocations")}</button></a>
          <a href="/categories"><button className="secondary" style={{ width: "100%" }}>{t("manageCategories")}</button></a>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("menuGroupActions")}</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <a href="/history"><button className="secondary" style={{ width: "100%" }}>{t("historyTitle")}</button></a>
          <a href="/labels"><button className="secondary" style={{ width: "100%" }}>{t("printLabels")}</button></a>
          <a href="/trash"><button className="secondary" style={{ width: "100%" }}>{t("trashTitle")}</button></a>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("menuGroupAccount")}</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <a href="/settings"><button className="secondary" style={{ width: "100%" }}>{t("settingsLabel")}</button></a>
          {isAdmin && <a href="/users"><button className="secondary" style={{ width: "100%" }}>{t("familyAccounts")}</button></a>}
          {isAdmin && <a href="/settings/integrations"><button className="secondary" style={{ width: "100%" }}>{t("integrationSettings")}</button></a>}
        </div>
      </div>
    </main>
  );
}
