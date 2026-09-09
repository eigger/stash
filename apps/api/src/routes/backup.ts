import { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { existsSync } from "fs";
import { mkdir, writeFile, readFile, rm, readdir, stat } from "fs/promises";
import { pipeline } from "stream/promises";
import { linkOrCopy } from "../lib/backupFiles.js";
import {
  activeBackupJob,
  backupJobPercent,
  BackupJobCancelledError,
  createBackupJob,
  deleteBackupJob,
  getBackupJob,
  measureUploads,
  requestBackupJobCancel,
  updateBackupJob,
  type BackupJob,
} from "../lib/backupJobs.js";

const execAsync = promisify(exec);
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

/** 백업 다운로드 전용 — 범용 JWT 쿼리 폴백이 아니라 60초·1회·purpose 분리. */
const BACKUP_TICKET_EXPIRES = "60s";

const USER_EXPORT_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  tokenVersion: true,
  createdAt: true,
} as const;

// 프로세스 메모리 — 멀티 인스턴스면 인스턴스 간 공유되지 않는다(가정용 단일 컨테이너 전제).
const usedBackupTicketJtis = new Set<string>();

/** 복원으로 받을 아카이브 상한. 전역 업로드 제한은 사진 한 장 기준이라 백업에는 부족하다 */
const RESTORE_LIMIT_BYTES = 500 * 1024 * 1024;

async function collectBackupData() {
  const [
    users,
    locations,
    categories,
    items,
    barcodes,
    movements,
    attachments,
    lookupCache,
    pushSubscriptions,
    maintenanceRecords,
  ] = await Promise.all([
    prisma.user.findMany({ select: USER_EXPORT_SELECT }),
    prisma.location.findMany(),
    prisma.category.findMany(),
    prisma.item.findMany(),
    prisma.barcode.findMany(),
    prisma.stockMovement.findMany(),
    prisma.attachment.findMany(),
    prisma.productLookupCache.findMany(),
    prisma.pushSubscription.findMany(),
    prisma.maintenanceRecord.findMany(),
  ]);

  return {
    users,
    locations,
    categories,
    items,
    barcodes,
    movements,
    attachments,
    lookupCache,
    pushSubscriptions,
    maintenanceRecords,
  };
}

/** 아카이브가 자라는 속도를 재는 주기 */
const ARCHIVE_POLL_MS = 500;

function archivePathFor(tempDirName: string): string {
  return path.join(UPLOAD_DIR, `${tempDirName}.tar.gz`);
}

function backupJobView(job: BackupJob) {
  return {
    jobId: job.id,
    phase: job.phase,
    percent: backupJobPercent(job),
    stagedBytes: job.stagedBytes,
    archivedBytes: job.archivedBytes,
    totalBytes: job.totalBytes,
    archiveBytes: job.archiveBytes,
    error: job.error,
  };
}

export async function backupRoutes(app: FastifyInstance) {
  function abortIfCancelled(job: BackupJob): void {
    if (getBackupJob(job.id)?.cancelRequested) throw new BackupJobCancelledError();
  }

  /**
   * tar를 돌리면서 아카이브 파일이 자라는 것을 진행률로 삼는다.
   *
   * 담는 단계가 하드링크가 되면서 순식간에 끝나고 시간은 전부 여기로 왔다 — 여기에
   * 진행률이 없으면 막대가 10%에서 몇 분씩 멈춰 있다. tar의 verbose 출력을 파싱하지
   * 않는 이유는 GNU tar와 busybox tar의 형식이 다르고, 알고 싶은 것이 파일 수가 아니라
   * 바이트이기 때문이다. 사진·PDF는 이미 압축돼 있어 아카이브가 원본과 비슷한 크기로
   * 자라므로 파일 크기가 그대로 쓸 만한 근사가 된다.
   */
  async function archiveWithProgress(job: BackupJob, tempDir: string, archivePath: string): Promise<void> {
    const running = execAsync(`tar -czf "${archivePath}" -C "${tempDir}" .`);

    const poll = setInterval(() => {
      void (async () => {
        // 압축 중에는 확인 지점이 여기뿐이다. 반쯤 쓴 아카이브는 취소 경로가 지운다.
        if (getBackupJob(job.id)?.cancelRequested) {
          running.child?.kill();
          return;
        }
        try {
          updateBackupJob(job.id, { archivedBytes: (await stat(archivePath)).size });
        } catch {
          /* 아직 안 만들어졌다 */
        }
      })();
    }, ARCHIVE_POLL_MS);

    try {
      await running;
    } finally {
      clearInterval(poll);
    }
    abortIfCancelled(job);
  }

  /**
   * 아카이브를 만든다. 요청 밖에서 돈다 — 응답을 붙잡고 만들던 시절에는 새 탭이
   * 빌드 내내(첨부가 많으면 분 단위) 빈 흰 화면이었고, 그 침묵이 "아무것도 안 됨"으로
   * 읽혀 사용자가 탭을 닫았다. 진행 상황은 작업(job)에 적고 화면이 물어보게 한다.
   */
  async function runBackupJob(job: BackupJob): Promise<void> {
    const tempDir = path.join(UPLOAD_DIR, job.tempDirName);
    const filesDir = path.join(tempDir, "files");
    const archivePath = archivePathFor(job.tempDirName);

    try {
      updateBackupJob(job.id, { phase: "database" });
      const dbData = await collectBackupData();

      await mkdir(filesDir, { recursive: true });
      await writeFile(path.join(tempDir, "db.json"), JSON.stringify(dbData, null, 2), "utf8");

      abortIfCancelled(job);
      updateBackupJob(job.id, { phase: "files" });
      if (existsSync(UPLOAD_DIR)) {
        const entries = await readdir(UPLOAD_DIR, { withFileTypes: true });
        for (const entry of entries) {
          // 작업 디렉터리와 이전 아카이브를 백업에 다시 담지 않는다
          if (!entry.isFile() || entry.name.endsWith(".tar.gz")) continue;

          const source = path.join(UPLOAD_DIR, entry.name);
          const size = await stat(source).then((info) => info.size).catch(() => 0);
          await linkOrCopy(source, path.join(filesDir, entry.name));
          const current = getBackupJob(job.id);
          if (current) current.stagedBytes += size;
          abortIfCancelled(job);
        }
      }

      abortIfCancelled(job);
      updateBackupJob(job.id, { phase: "archiving" });
      await archiveWithProgress(job, tempDir, archivePath);

      // 사본은 아카이브가 나온 시점에 쓸모가 없다
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});

      const archiveStat = await stat(archivePath);
      updateBackupJob(job.id, { phase: "ready", archiveBytes: archiveStat.size });
      app.log.info({ jobId: job.id, bytes: archiveStat.size }, "Backup archive built");
    } catch (err: any) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      await rm(archivePath, { force: true }).catch(() => {});

      if (err instanceof BackupJobCancelledError || getBackupJob(job.id)?.cancelRequested) {
        // 취소는 실패가 아니다. 여기서 목록에서 뺀다 — 그전에 빼면 빌드가 도는 채로
        // 잠금이 풀려 두 번째 빌드가 시작된다.
        app.log.info({ jobId: job.id }, "Backup export cancelled");
        deleteBackupJob(job.id);
        return;
      }

      app.log.error(err, "Backup export failed");
      updateBackupJob(job.id, {
        phase: "failed",
        error: err instanceof Error ? err.message.slice(0, 300) : String(err),
      });
    }
  }

  /**
   * GET /api/backup/export?ticket=... — **만들지 않는다.** 미리 만들어 둔 것을 흘려보낸다.
   * Bearer 없이 브라우저가 링크로 열어 디스크에 스트리밍한다(대용량 blob 회피).
   */
  app.get("/export", async (request, reply) => {
    const ticket = (request.query as { ticket?: string }).ticket;
    if (!ticket) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    let jti: string;
    let jobId: string | undefined;
    try {
      const decoded = app.jwt.verify<{ purpose?: string; jti?: string; jobId?: string }>(ticket);
      if (decoded.purpose !== "backup" || typeof decoded.jti !== "string" || !decoded.jti) {
        return reply.code(401).send({ error: "unauthorized" });
      }
      jti = decoded.jti;
      jobId = decoded.jobId;
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }

    if (usedBackupTicketJtis.has(jti)) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const job = jobId ? getBackupJob(jobId) : null;
    if (!job) {
      return reply.code(409).send({ error: "backup_not_ready", phase: "gone" });
    }
    if (job.phase !== "ready") {
      return reply.code(409).send({ error: "backup_not_ready", phase: job.phase });
    }

    const archivePath = archivePathFor(job.tempDirName);
    let archiveStat;
    try {
      archiveStat = await stat(archivePath);
    } catch {
      // 스윕이 이미 걷어 갔다 — 작업만 남아 "받을 수 있다"고 거짓말하지 않게 지운다
      deleteBackupJob(job.id);
      return reply.code(409).send({ error: "backup_not_ready", phase: "gone" });
    }

    // 검증 직후 소비 — 브라우저 다운로드 관리자의 재요청·탭 새로고침을 막는다.
    // 티켓 수명(60s)이 지나면 재사용 불가이므로 Set에서도 지워 누적을 막는다.
    usedBackupTicketJtis.add(jti);
    setTimeout(() => usedBackupTicketJtis.delete(jti), 60_000);

    const stream = createReadStream(archivePath);
    const dropArchive = () => {
      rm(archivePath, { force: true }).catch(() => {});
      deleteBackupJob(job.id);
    };
    stream.on("close", dropArchive);
    stream.on("error", dropArchive);
    reply.raw.on("close", dropArchive);

    return reply
      .header("Content-Type", "application/gzip")
      // 길이를 알려야 브라우저가 진행률을 그리고, 길이 없는 chunked 응답을 통째로
      // 버퍼링하는 프록시에 걸리지 않는다.
      .header("Content-Length", String(archiveStat.size))
      .header(
        "Content-Disposition",
        `attachment; filename="stash_backup_${new Date().toISOString().slice(0, 10)}.tar.gz"`,
      )
      .send(stream);
  });

  await app.register(async (admin) => {
    admin.addHook("preHandler", app.authenticate);
    admin.addHook("preHandler", app.requireAdmin);

    // 60초·1회용 티켓. 제거한 7일짜리 ?token= JWT와는 다르다.
    /**
     * 아카이브 만들기를 시작한다. 응답은 즉시 돌아오고 빌드는 뒤에서 돈다 —
     * 화면은 GET /export/jobs/:id로 진행률을 물어본다.
     */
    admin.post("/export/jobs", async (request, reply) => {
      const running = activeBackupJob();
      if (running) {
        // 빌드 하나가 tar 한 벌을 만든다. 둘이 겹치면 디스크가 두 배다.
        return reply.code(409).send({ ...backupJobView(running), error: "backup_already_running" });
      }

      const job = createBackupJob(request.user.sub, await measureUploads(UPLOAD_DIR));
      // 일부러 await하지 않는다 — 요청은 지금 돌려주고 빌드는 뒤에서 돈다.
      void runBackupJob(job);
      return backupJobView(job);
    });

    admin.get("/export/jobs/:jobId", async (request, reply) => {
      const { jobId } = request.params as { jobId: string };
      const job = getBackupJob(jobId);
      if (!job || job.userId !== request.user.sub) {
        return reply.code(404).send({ error: "backup_job_not_found" });
      }
      return backupJobView(job);
    });

    /** 취소하거나, 다 만든 아카이브를 버린다 — 아무도 안 받을 것을 디스크에 두지 않는다 */
    admin.delete("/export/jobs/:jobId", async (request, reply) => {
      const { jobId } = request.params as { jobId: string };
      const job = getBackupJob(jobId);
      if (!job || job.userId !== request.user.sub) {
        return reply.code(404).send({ error: "backup_job_not_found" });
      }

      // 빌드 중이면 파일을 여기서 지우지 않는다 — 쓰고 있는 것을 지우면 tar가 깨진다.
      if (requestBackupJobCancel(job.id)) return { ok: true, cancelling: true };

      await rm(archivePathFor(job.tempDirName), { force: true }).catch(() => {});
      deleteBackupJob(job.id);
      return { ok: true, cancelling: false };
    });

    admin.post("/export-ticket", async (request, reply) => {
      const { jobId } = (request.body ?? {}) as { jobId?: string };
      const job = jobId ? getBackupJob(jobId) : null;
      if (!job || job.userId !== request.user.sub) {
        return reply.code(404).send({ error: "backup_job_not_found" });
      }
      if (job.phase !== "ready") {
        return reply.code(409).send({ error: "backup_not_ready", phase: job.phase });
      }

      const jti = randomBytes(16).toString("hex");
      const ticket = app.jwt.sign(
        { sub: request.user.sub, purpose: "backup", jti, jobId: job.id },
        { expiresIn: BACKUP_TICKET_EXPIRES },
      );
      return { ticket, expiresIn: 60 };
    });

    // POST /api/backup/restore
    admin.post("/restore", async (request, reply) => {
      const file = await request.file({ limits: { fileSize: RESTORE_LIMIT_BYTES } });
      if (!file) return reply.code(400).send({ error: t("noBackupFileUploaded", request.locale) });

      const restoreTempDirName = `restore_${Date.now()}`;
      const restoreTempDir = path.join(UPLOAD_DIR, restoreTempDirName);
      const archivePath = path.join(UPLOAD_DIR, `${restoreTempDirName}.tar.gz`);

      try {
        // toBuffer()는 아카이브 전체를 메모리에 올린다 — 상한이 500MB라 큰 백업을
        // 복원하면 그대로 프로세스가 죽는다. 디스크로 흘려보낸다.
        await mkdir(restoreTempDir, { recursive: true });
        await pipeline(file.file, createWriteStream(archivePath));
        if (file.file.truncated) {
          const limit = `${Math.floor(RESTORE_LIMIT_BYTES / 1024 / 1024)}MB`;
          return reply.code(413).send({ error: `Backup file is too large (limit ${limit})` });
        }
        await execAsync(`tar -xzf "${archivePath}" -C "${restoreTempDir}"`);

        const dbJsonPath = path.join(restoreTempDir, "db.json");
        if (!existsSync(dbJsonPath)) {
          return reply.code(400).send({ error: t("invalidBackupFile", request.locale) });
        }
        const dbData = JSON.parse(await readFile(dbJsonPath, "utf8"));
        if (!dbData || typeof dbData !== "object" || !Array.isArray(dbData.users)) {
          return reply.code(400).send({ error: t("invalidBackupFile", request.locale) });
        }

        // passwordHash가 없는 사용자(신규 백업 포맷)에게 랜덤 해시를 채우고,
        // 전원에게 1회용 임시 비밀번호를 응답에 돌려 복원 직후 로그인 불능을 막는다.
        // 구 백업(passwordHash 포함)은 해시 그대로 복원해 하위 호환을 유지한다.
        type BackupUser = {
          id: string;
          name: string;
          email: string;
          role: "ADMIN" | "GENERAL";
          passwordHash?: string;
          tokenVersion?: number;
          createdAt?: string;
        };
        const recoveryPasswords: { email: string; role: "ADMIN" | "GENERAL"; temporaryPassword: string }[] = [];
        const usersToCreate: Array<{
          id: string;
          name: string;
          email: string;
          role: "ADMIN" | "GENERAL";
          passwordHash: string;
          tokenVersion: number;
          createdAt: Date;
        }> = [];
        let anyMissingHash = false;

        for (const raw of dbData.users as BackupUser[]) {
          if (!raw?.id || !raw?.email || !raw?.name || !raw?.role) {
            return reply.code(400).send({ error: t("invalidBackupFile", request.locale) });
          }
          let passwordHash = raw.passwordHash;
          if (!passwordHash) {
            anyMissingHash = true;
            const temporaryPassword = randomBytes(12).toString("base64url");
            passwordHash = await bcrypt.hash(temporaryPassword, 10);
            recoveryPasswords.push({ email: raw.email, role: raw.role, temporaryPassword });
          }
          usersToCreate.push({
            id: raw.id,
            name: raw.name,
            email: raw.email,
            role: raw.role,
            passwordHash,
            tokenVersion: typeof raw.tokenVersion === "number" ? raw.tokenVersion : 0,
            createdAt: raw.createdAt ? new Date(raw.createdAt) : new Date(),
          });
        }

        // 신규 포맷인데 ADMIN이 없으면 첫 계정을 ADMIN으로 승격해 복원 후 관리자 잠김을 막는다.
        if (anyMissingHash && !usersToCreate.some((u) => u.role === "ADMIN") && usersToCreate.length > 0) {
          const target = usersToCreate[0];
          target.role = "ADMIN";
          const entry = recoveryPasswords.find((r) => r.email === target.email);
          if (entry) entry.role = "ADMIN";
        }

        await prisma.$transaction(async (tx) => {
          // 역순으로 정리(자식 → 부모)한 뒤, 부모 → 자식 순서로 다시 채운다.
          await tx.pushSubscription.deleteMany();
          await tx.stockMovement.deleteMany();
          await tx.attachment.deleteMany();
          await tx.maintenanceRecord.deleteMany();
          await tx.barcode.deleteMany();
          await tx.item.deleteMany();
          await tx.category.deleteMany();
          await tx.location.deleteMany();
          await tx.productLookupCache.deleteMany();
          await tx.user.deleteMany();

          if (usersToCreate.length) await tx.user.createMany({ data: usersToCreate });
          if (dbData.locations?.length) await tx.location.createMany({ data: dbData.locations });
          if (dbData.categories?.length) await tx.category.createMany({ data: dbData.categories });
          if (dbData.items?.length) await tx.item.createMany({ data: dbData.items });
          if (dbData.barcodes?.length) await tx.barcode.createMany({ data: dbData.barcodes });
          if (dbData.attachments?.length) await tx.attachment.createMany({ data: dbData.attachments });
          if (dbData.movements?.length) await tx.stockMovement.createMany({ data: dbData.movements });
          if (dbData.maintenanceRecords?.length) {
            await tx.maintenanceRecord.createMany({ data: dbData.maintenanceRecords });
          }
          if (dbData.lookupCache?.length) await tx.productLookupCache.createMany({ data: dbData.lookupCache });
          if (dbData.pushSubscriptions?.length) {
            await tx.pushSubscription.createMany({ data: dbData.pushSubscriptions });
          }
        });

        const filesDir = path.join(restoreTempDir, "files");
        if (existsSync(filesDir)) {
          const restoredFiles = await readdir(filesDir);
          for (const filename of restoredFiles) {
            // 같은 파일시스템이라 링크로 잇는다. 링크는 자리가 비어 있어야 걸리므로
            // 덮어쓸 자리는 먼저 지운다 — 기존 파일에 덧쓰지 않고 새로 만드는 편이,
            // 그 파일을 가리키는 다른 이름이 있을 때도 안전하다.
            const dest = path.join(UPLOAD_DIR, filename);
            await rm(dest, { force: true }).catch(() => {});
            await linkOrCopy(path.join(filesDir, filename), dest);
          }
        }

        return {
          success: true,
          passwordResetRequired: recoveryPasswords.length > 0,
          recoveryPasswords,
          // 하위 호환 별칭 — 예전 UI가 adminRecoveryPasswords만 보던 경우
          adminRecoveryPasswords: recoveryPasswords.filter((r) => r.role === "ADMIN"),
        };
      } catch (err: any) {
        app.log.error(err, "Backup restore failed");
        return reply.code(500).send({ error: `Restore failed: ${err.message || err}` });
      } finally {
        rm(restoreTempDir, { recursive: true, force: true }).catch(() => {});
        rm(archivePath, { force: true }).catch(() => {});
      }
    });
  });
}
