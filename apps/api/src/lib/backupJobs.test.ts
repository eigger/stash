import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BACKUP_JOB_TTL_MS,
  activeBackupJob,
  backupJobPercent,
  clearBackupJobs,
  createBackupJob,
  getBackupJob,
  measureUploads,
  requestBackupJobCancel,
  sweepExpiredBackupJobs,
  updateBackupJob,
} from "./backupJobs.js";

afterEach(() => clearBackupJobs());

describe("backupJobs", () => {
  // 빌드 하나가 tar 한 벌을 만든다 — 둘이 겹치면 디스크가 두 배다
  it("reports a running job so a second build is refused", () => {
    const job = createBackupJob("admin-1", 1000);
    expect(activeBackupJob()?.id).toBe(job.id);

    updateBackupJob(job.id, { phase: "ready", archiveBytes: 400 });
    expect(activeBackupJob()).toBeNull();
  });

  /**
   * 담는 단계는 하드링크라 순식간에 끝나고 시간은 전부 압축으로 간다 — 폭도 거기에
   * 줘야 막대가 움직인다.
   */
  it("gives most of the bar to compression, where the time actually goes", () => {
    const job = createBackupJob("admin-1", 1000);
    expect(backupJobPercent(job)).toBe(2);

    updateBackupJob(job.id, { phase: "files", stagedBytes: 500 });
    expect(backupJobPercent(getBackupJob(job.id)!)).toBe(6);

    updateBackupJob(job.id, { phase: "archiving", archivedBytes: 500 });
    expect(backupJobPercent(getBackupJob(job.id)!)).toBe(55);

    updateBackupJob(job.id, { phase: "ready" });
    expect(backupJobPercent(getBackupJob(job.id)!)).toBe(100);
  });

  // 압축률을 모르므로 아카이브가 원본보다 커질 수 있다. 막대가 뒤로 가면 안 된다.
  it("never passes 99 before the archive is actually done", () => {
    const job = createBackupJob("admin-1", 1000);
    updateBackupJob(job.id, { phase: "archiving", archivedBytes: 5000 });
    expect(backupJobPercent(getBackupJob(job.id)!)).toBe(99);
  });

  it("does not divide by zero when there is nothing to pack", () => {
    const job = createBackupJob("admin-1", 0);
    updateBackupJob(job.id, { phase: "files" });
    expect(backupJobPercent(getBackupJob(job.id)!)).toBe(10);
  });

  /**
   * 취소는 표시만 한다. 목록에서 바로 빼면 activeBackupJob()이 비어 보여 다음 요청이
   * 두 번째 빌드를 시작하고, 그 순간 사본이 둘이 된다.
   */
  it("keeps a cancelled job listed until the build actually stops", () => {
    const job = createBackupJob("admin-1", 1000);
    expect(requestBackupJobCancel(job.id)).toBe(true);
    expect(getBackupJob(job.id)?.cancelRequested).toBe(true);
    expect(activeBackupJob()?.id).toBe(job.id);
  });

  it("does not cancel a build that already finished", () => {
    const job = createBackupJob("admin-1", 1000);
    updateBackupJob(job.id, { phase: "ready" });
    expect(requestBackupJobCancel(job.id)).toBe(false);
  });
});

describe("backup sweep", () => {
  let dir = "";

  afterEach(async () => {
    clearBackupJobs();
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  /**
   * 예전에는 내보내기가 응답 안에서 끝나 finally가 늘 지웠다. 이제는 다운로드를
   * 기다리느라 응답 밖에서 살아남으므로, 아무도 받지 않은 tar.gz를 치울 주체가 필요하다.
   */
  it("drops the archive of a job nobody came back for", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "stash-sweep-"));
    const job = createBackupJob("admin-1", 10);
    updateBackupJob(job.id, { phase: "ready" });
    const archivePath = path.join(dir, `${job.tempDirName}.tar.gz`);
    await writeFile(archivePath, "archive-bytes");

    expect(await sweepExpiredBackupJobs(dir, job.createdAt + BACKUP_JOB_TTL_MS)).toEqual([]);
    await expect(stat(archivePath)).resolves.toBeDefined();

    expect(await sweepExpiredBackupJobs(dir, job.createdAt + BACKUP_JOB_TTL_MS + 1)).toEqual([job.id]);
    expect(getBackupJob(job.id)).toBeNull();
    await expect(stat(archivePath)).rejects.toThrow();
  });
});

describe("measureUploads", () => {
  let dir = "";

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  // 진행률의 분모다. 이전 아카이브는 백업 대상이 아니므로 빼야 한다.
  it("sums the uploaded files and skips old archives", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "stash-measure-"));
    await writeFile(path.join(dir, "receipt-a.jpg"), "12345");
    await writeFile(path.join(dir, "receipt-b.pdf"), "123");
    await writeFile(path.join(dir, "backup_1.tar.gz"), "should-not-count");

    expect(await measureUploads(dir)).toBe(8);
  });

  it("returns zero when the upload dir does not exist yet", async () => {
    expect(await measureUploads(path.join(tmpdir(), "stash-missing-dir-xyz"))).toBe(0);
  });
});
