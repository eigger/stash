import { randomUUID } from "node:crypto";
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

/**
 * 내보내기 진행 상황을 담아 두는 곳.
 *
 * 예전에는 `GET /export` 하나가 아카이브를 만들고 그 응답으로 흘려보냈다. 화면은
 * 버튼이 "저장 중..."으로 바뀐 채 아무 말도 못 했고, 첨부가 많으면 그 침묵이 몇 분씩
 * 갔다. 빌드를 요청에서 떼어내면 얼마나 갔는지 물어볼 수 있고, 다 됐을 때 링크를
 * 건넬 수 있다 — 링크로 받으면 브라우저가 파일로 바로 내려받으므로 아카이브가
 * blob으로 메모리에 올라오지도 않는다.
 *
 * 메모리에만 둔다. API는 단일 프로세스이고, 재시작하면 남은 아카이브는 스윕이 걷는다.
 */
export type BackupJobPhase = "database" | "files" | "archiving" | "ready" | "failed";

export type BackupJob = {
  id: string;
  /** 만든 관리자. 남의 작업을 들여다보거나 받아 갈 이유가 없다 */
  userId: string;
  phase: BackupJobPhase;
  /** 담아야 할 총량. files·archiving 두 단계가 같이 쓴다 */
  totalBytes: number;
  stagedBytes: number;
  archivedBytes: number;
  /** 다 만든 아카이브 크기. ready 전에는 null */
  archiveBytes: number | null;
  error: string | null;
  /** `backup_<ts>` — 작업 디렉터리와 아카이브 이름의 뿌리 */
  tempDirName: string;
  /**
   * 화면이 취소를 눌렀다. 빌드를 밖에서 죽이면 tar가 반쯤 쓴 파일을 남기므로
   * 표시만 하고, 빌드가 다음 확인 지점에서 스스로 접는다.
   */
  cancelRequested: boolean;
  createdAt: number;
};

/** 받아 가지 않은 아카이브를 이만큼만 들고 있는다 */
export const BACKUP_JOB_TTL_MS = 2 * 60 * 60 * 1000;

const jobs = new Map<string, BackupJob>();

export function isBackupJobActive(job: BackupJob): boolean {
  return job.phase !== "ready" && job.phase !== "failed";
}

/** 동시에 하나만 돈다 — 빌드 하나가 tar 한 벌을 만드므로 둘이 겹치면 디스크가 두 배다 */
export function activeBackupJob(): BackupJob | null {
  for (const job of jobs.values()) {
    if (isBackupJobActive(job)) return job;
  }
  return null;
}

export function createBackupJob(userId: string, totalBytes: number): BackupJob {
  const id = randomUUID();
  const job: BackupJob = {
    id,
    userId,
    phase: "database",
    totalBytes,
    stagedBytes: 0,
    archivedBytes: 0,
    archiveBytes: null,
    error: null,
    tempDirName: `backup_${Date.now()}`,
    cancelRequested: false,
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

export function getBackupJob(id: string): BackupJob | null {
  return jobs.get(id) ?? null;
}

export function updateBackupJob(id: string, patch: Partial<BackupJob>): BackupJob | null {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch);
  return job;
}

export function deleteBackupJob(id: string): void {
  jobs.delete(id);
}

/** 테스트에서 전역 상태를 비운다 */
export function clearBackupJobs(): void {
  jobs.clear();
}

/**
 * 취소를 표시한다. **목록에서 빼지 않는다** — 빼면 `activeBackupJob()`이 비어 보이고
 * 다음 요청이 두 번째 빌드를 시작한다. 빌드가 스스로 접고 나갈 때 지운다.
 */
export function requestBackupJobCancel(id: string): boolean {
  const job = jobs.get(id);
  if (!job || !isBackupJobActive(job)) return false;
  job.cancelRequested = true;
  return true;
}

export class BackupJobCancelledError extends Error {
  constructor() {
    super("BACKUP_JOB_CANCELLED");
    this.name = "BackupJobCancelledError";
  }
}

/**
 * 화면이 그릴 진행률.
 *
 * 담는 단계는 하드링크라 사실상 순식간에 끝나고 시간은 전부 압축으로 간다 —
 * 폭도 거기에 줘야 막대가 움직인다.
 */
export function backupJobPercent(job: BackupJob): number {
  if (job.phase === "ready") return 100;
  if (job.phase === "failed") return 0;
  if (job.phase === "database") return 2;
  if (job.totalBytes <= 0) return job.phase === "archiving" ? 55 : 10;

  if (job.phase === "archiving") {
    // 압축률을 모른다. 어긋나도 막대가 뒤로 가지 않게 99에서 멈춘다.
    const archived = Math.min(job.archivedBytes / job.totalBytes, 1);
    return Math.min(99, Math.round(10 + archived * 89));
  }
  return Math.round(2 + Math.min(job.stagedBytes / job.totalBytes, 1) * 8);
}

/** 업로드는 UPLOAD_DIR 바로 아래에 평평하게 쌓인다 — 진행률의 분모다 */
export async function measureUploads(uploadDir: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(uploadDir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.endsWith(".tar.gz")) continue;
    try {
      total += (await stat(path.join(uploadDir, entry.name))).size;
    } catch {
      /* 순회 중 사라진 파일은 세지 않는다 */
    }
  }
  return total;
}

/**
 * 나이를 다 먹은 작업과 그 아카이브를 걷는다. 아무도 받아 가지 않은 tar.gz가
 * 영원히 남지 않게 — 예전에는 `finally`가 늘 지웠지만, 이제 다운로드를 기다리느라
 * 응답 밖에서 살아남는다.
 */
export async function sweepExpiredBackupJobs(uploadDir: string, now = Date.now()): Promise<string[]> {
  const swept: string[] = [];
  for (const [id, job] of jobs) {
    if (now - job.createdAt <= BACKUP_JOB_TTL_MS) continue;
    jobs.delete(id);
    swept.push(id);
    await rm(path.join(uploadDir, `${job.tempDirName}.tar.gz`), { force: true }).catch(() => {});
    await rm(path.join(uploadDir, job.tempDirName), { recursive: true, force: true }).catch(() => {});
  }
  return swept;
}
