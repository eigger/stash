"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiJson, API_URL } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { todayStamp } from "../../lib/download";
import { OneTimeSecrets, type OneTimeSecret } from "../../components/OneTimeSecrets";

/**
 * 내보내기 진행 상황. 예전에는 티켓을 받아 새 탭을 열었고, 그 탭은 아카이브가 다
 * 만들어질 때까지(첨부가 많으면 분 단위) 빈 흰 화면이었다. 이제 서버가 뒤에서
 * 만들고 이 화면이 얼마나 갔는지 물어본다.
 */
type BackupJob = {
  jobId: string;
  phase: "database" | "files" | "archiving" | "ready" | "failed";
  percent: number;
  stagedBytes: number;
  archivedBytes: number;
  totalBytes: number;
  archiveBytes: number | null;
  error: string | null;
};

const BACKUP_POLL_MS = 1000;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export default function BackupPage() {
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();
  const { show } = useToast();
  const { t } = useLocale();
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [job, setJob] = useState<BackupJob | null>(null);
  const [recoverySecrets, setRecoverySecrets] = useState<OneTimeSecret[] | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    else if (!loading && user && !isAdmin) router.push("/settings");
  }, [loading, user, isAdmin, router]);

  const buildingPhase = job && job.phase !== "ready" && job.phase !== "failed" ? job.phase : null;
  const pollingJobId = job && buildingPhase ? job.jobId : null;

  // 빌드가 도는 동안에만 물어본다. 응답마다 새 객체가 오므로 id로 건다 —
  // job 자체를 의존성에 두면 1초마다 타이머를 새로 걸게 된다.
  useEffect(() => {
    if (!pollingJobId) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const next = await apiJson<BackupJob>(`/api/backup/export/jobs/${pollingJobId}`);
          if (!cancelled) setJob(next);
        } catch {
          // 작업이 사라졌다(재시작·스윕). 진행률을 영원히 붙잡고 있는 것보다
          // 화면을 처음 상태로 되돌려 다시 누르게 하는 편이 낫다.
          if (!cancelled) setJob(null);
        }
      })();
    }, BACKUP_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pollingJobId]);

  useEffect(() => {
    if (job?.phase === "failed") {
      show(t("backupBuildFailed", { detail: job.error ?? "" }), "error");
      setJob(null);
    }
  }, [job, show, t]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await apiFetch("/api/backup/export/jobs", { method: "POST" });
      const body = await res.json().catch(() => null);

      if (res.status === 409 && body?.jobId) {
        // 다른 탭·다른 관리자가 이미 만들고 있다. 그 진행률을 그대로 보여준다.
        show(t("backupAlreadyRunning"), "success");
        setJob(body as BackupJob);
        return;
      }
      if (!res.ok) {
        show(body?.error ?? t("backupBuildFailed", { detail: String(res.status) }), "error");
        return;
      }
      setJob(body as BackupJob);
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setExporting(false);
    }
  }

  /**
   * 티켓은 60초면 만료된다. 링크를 그려 둔 채로 기다렸다 누르면 unauthorized가
   * 되므로, 누르는 순간 새로 발급받아 그때 건다.
   */
  async function handleDownload() {
    if (!job || job.phase !== "ready") return;
    try {
      const { ticket } = await apiJson<{ ticket: string }>("/api/backup/export-ticket", {
        method: "POST",
        body: JSON.stringify({ jobId: job.jobId }),
      });
      // API로 스트리밍 다운로드 — Next 페이지 이동이 아니라서 <a> navigate를 쓴다
      // (location.href는 same-origin일 때 lint에 걸린다).
      const a = document.createElement("a");
      a.href = `${API_URL}/api/backup/export?ticket=${encodeURIComponent(ticket)}`;
      // 성공하면 Content-Disposition 때문에 이동 없이 받아진다. 실패하면 JSON이
      // 그대로 나가는데, target이 없으면 이 화면이 그 JSON으로 이동해 버린다.
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // 서버는 스트림이 닫히면 아카이브와 작업을 지운다 — 화면도 같이 접는다
      setJob(null);
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function handleDiscardBackup() {
    if (!job) return;
    const { jobId } = job;
    setJob(null);
    await apiFetch(`/api/backup/export/jobs/${jobId}`, { method: "DELETE" }).catch(() => {});
  }

  function backupPhaseLabel(current: BackupJob): string {
    if (current.phase === "database") return t("backupPhaseDatabase");
    // 담는 단계는 하드링크라 순식간이다 — 시간은 압축에서 간다
    if (current.phase === "archiving") {
      return t("backupPhaseArchiving", {
        done: formatBytes(Math.min(current.archivedBytes, current.totalBytes)),
        total: formatBytes(current.totalBytes),
      });
    }
    return t("backupPhaseFiles");
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
        setRecoverySecrets(
          recoveries.map((r) => ({
            label: `${r.email}${r.role ? ` (${r.role})` : ""}`,
            value: r.temporaryPassword,
          })),
        );
      }
      show(t("restoreSuccessToast"), "success");
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setRestoring(false);
    }
  }

  if (loading || !user || !isAdmin) return null;

  return (
    <main className="container">
      <h1>{t("backupRestoreTitle")}</h1>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("exportButton")}</h2>
        <p className="meta">{t("backupRestoreHint")}</p>
        <p className="meta">{t("backupSecurityHint")}</p>
        <div className="form">
          {!job && (
            <button onClick={handleExport} disabled={exporting}>
              {exporting ? t("exportingLabel") : t("exportButton")}
            </button>
          )}

          {job && buildingPhase && (
            <div className="backup-progress">
              <p className="backup-progress-title">{t("backupBuildingTitle")}</p>
              <div className="backup-progress-track">
                <span className="backup-progress-fill" style={{ width: `${job.percent}%` }} />
              </div>
              <p className="meta">
                {backupPhaseLabel(job)} · {job.percent}%
              </p>
              <button type="button" onClick={() => void handleDiscardBackup()}>
                {t("backupCancelLabel")}
              </button>
            </div>
          )}

          {job?.phase === "ready" && (
            <div className="backup-progress">
              <p className="backup-progress-title">{t("backupReadyTitle")}</p>
              <a
                href={`${API_URL}/api/backup/export`}
                className="backup-download-link"
                onClick={(e) => {
                  e.preventDefault();
                  void handleDownload();
                }}
              >
                {t("backupDownloadLink", { size: formatBytes(job.archiveBytes ?? 0) })}
              </a>
              <p className="meta">{t("backupDownloadHint")}</p>
              <button type="button" onClick={() => void handleDiscardBackup()}>
                {t("backupDiscardLabel")}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("restoreLabel")}</h2>
        <p className="backup-restore-warning">{t("confirmRestore")}</p>
        <div className="form">
          <label>
            {t("restoreLabel")}
            <input type="file" accept=".tar.gz" onChange={handleRestore} disabled={restoring} />
          </label>
        </div>
      </div>

      {recoverySecrets && (
        <OneTimeSecrets
          title={t("restoreRecoveryTitle")}
          hint={t("restoreRecoveryHint")}
          secrets={recoverySecrets}
          downloadFilename={`stash-restore-passwords_${todayStamp()}.txt`}
          onClose={() => setRecoverySecrets(null)}
        />
      )}
    </main>
  );
}
