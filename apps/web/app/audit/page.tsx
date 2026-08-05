"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { buildOrderedLocationTree } from "../../lib/locationTree";
import type { AuditSession, Location } from "../../lib/types";

export default function AuditStartPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { show } = useToast();
  const { t } = useLocale();
  const [locations, setLocations] = useState<Location[]>([]);
  const [active, setActive] = useState<AuditSession | null>(null);
  const [locationId, setLocationId] = useState("");
  const [includeChildren, setIncludeChildren] = useState(true);
  const [starting, setStarting] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const [locs, session] = await Promise.all([
          apiJson<Location[]>("/api/locations"),
          apiJson<AuditSession | null>("/api/audit/sessions/active"),
        ]);
        setLocations(locs);
        setActive(session);
        if (locs.length > 0 && !locationId) setLocationId(locs[0].id);
      } catch (err: any) {
        show(err.message, "error");
      } finally {
        setReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function start() {
    if (!locationId) {
      show(t("selectLocationRequired"), "error");
      return;
    }
    if (!navigator.onLine) {
      show(t("auditOnlineOnly"), "error");
      return;
    }
    setStarting(true);
    try {
      const session = await apiJson<AuditSession>("/api/audit/sessions", {
        method: "POST",
        body: JSON.stringify({ locationId, includeChildren }),
      });
      router.push(`/audit/${session.id}`);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        const existing = await apiJson<AuditSession | null>("/api/audit/sessions/active");
        if (existing?.id) {
          router.push(`/audit/${existing.id}`);
          return;
        }
      }
      show(err.message, "error");
    } finally {
      setStarting(false);
    }
  }

  if (loading || !user || !ready) return null;

  const ordered = buildOrderedLocationTree(locations);

  return (
    <main className="container" style={{ paddingBottom: 84 }}>
      <h1>{t("auditTitle")}</h1>
      <p className="meta">{t("auditIntro")}</p>

      {active && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ marginTop: 0 }}>
            {active.startedBy?.name
              ? t("auditActiveByHint", { who: active.startedBy.name, name: active.location.name })
              : t("auditActiveHint", { name: active.location.name })}
          </p>
          <p className="meta">
            {t("auditProgress", {
              found: active.progress.foundExpected,
              total: active.progress.expectedTotal,
              pending: active.progress.pending,
            })}
          </p>
          <button type="button" onClick={() => router.push(`/audit/${active.id}`)} style={{ width: "100%" }}>
            {t("auditResumeButton")}
          </button>
        </div>
      )}

      {locations.length === 0 ? (
        <p className="meta">
          {t("auditNoLocations")}{" "}
          <a href="/locations">{t("manageLocations")}</a>
        </p>
      ) : (
        <div className="card">
          <label className="meta" htmlFor="audit-location">
            {t("selectLocationRequired")}
          </label>
          <select
            id="audit-location"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            disabled={!!active}
            style={{ width: "100%", marginTop: 8 }}
          >
            {ordered.map(({ location: loc, depth }) => (
              <option key={loc.id} value={loc.id}>
                {"— ".repeat(depth)}
                {loc.name}
              </option>
            ))}
          </select>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
            <input
              type="checkbox"
              checked={includeChildren}
              onChange={(e) => setIncludeChildren(e.target.checked)}
              disabled={!!active}
            />
            {t("auditIncludeChildren")}
          </label>
          <button
            type="button"
            onClick={start}
            disabled={starting || !!active}
            style={{ width: "100%", marginTop: 16 }}
          >
            {starting ? t("processingLabel") : t("auditStartButton")}
          </button>
        </div>
      )}
    </main>
  );
}
