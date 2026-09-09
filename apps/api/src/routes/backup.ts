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

async function buildBackupArchive(tempDirName: string): Promise<{ tempDir: string; archivePath: string }> {
  const tempDir = path.join(UPLOAD_DIR, tempDirName);
  const filesDir = path.join(tempDir, "files");
  const archivePath = path.join(UPLOAD_DIR, `${tempDirName}.tar.gz`);

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

  const dbData = {
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

  await mkdir(filesDir, { recursive: true });
  await writeFile(path.join(tempDir, "db.json"), JSON.stringify(dbData, null, 2), "utf8");

  if (existsSync(UPLOAD_DIR)) {
    const entries = await readdir(UPLOAD_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name === tempDirName) continue;
      if (entry.isFile() && entry.name.endsWith(".tar.gz")) continue;
      if (entry.isFile()) {
        await linkOrCopy(path.join(UPLOAD_DIR, entry.name), path.join(filesDir, entry.name));
      }
    }
  }

  await execAsync(`tar -czf "${archivePath}" -C "${tempDir}" .`);
  // 사본은 아카이브가 나온 시점에 쓸모가 없다. 예전에는 다운로드 스트림이 닫힐 때까지
  // 들고 있어 그동안 계속 자리를 잡고 있었다.
  await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  return { tempDir, archivePath };
}

export async function backupRoutes(app: FastifyInstance) {
  // GET /api/backup/export?ticket=...
  // Bearer 없이 브라우저가 location으로 열어 디스크에 스트리밍한다(대용량 blob 회피).
  // Setting·passwordHash 제외 정책은 티켓/예전 Bearer 경로와 동일하다.
  app.get("/export", async (request, reply) => {
    const ticket = (request.query as { ticket?: string }).ticket;
    if (!ticket) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    let jti: string;
    try {
      const decoded = app.jwt.verify<{ purpose?: string; jti?: string }>(ticket);
      if (decoded.purpose !== "backup" || typeof decoded.jti !== "string" || !decoded.jti) {
        return reply.code(401).send({ error: "unauthorized" });
      }
      jti = decoded.jti;
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }

    if (usedBackupTicketJtis.has(jti)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    // 검증 직후 소비 — 빌드 실패해도 같은 티켓으로 재시도하지 못하게 한다(재발급은 가능).
    // 티켓 수명(60s)이 지나면 재사용 불가이므로 Set에서도 지워 누적을 막는다.
    usedBackupTicketJtis.add(jti);
    setTimeout(() => usedBackupTicketJtis.delete(jti), 60_000);

    const tempDirName = `backup_${Date.now()}`;
    // 경로를 여기서 정한다. 빌드가 중간에 실패하면 buildBackupArchive가 값을
    // 돌려주지 못해, 반쯤 만들어진 사본과 아카이브를 catch가 지울 수 없었다 —
    // 스윕이 걷을 때까지 두 시간을 기다려야 했다.
    const tempDir = path.join(UPLOAD_DIR, tempDirName);
    const archivePath = path.join(UPLOAD_DIR, `${tempDirName}.tar.gz`);
    const cleanup = () => {
      rm(tempDir, { recursive: true, force: true }).catch(() => {});
      rm(archivePath, { force: true }).catch(() => {});
    };

    // 빌드는 첨부가 많으면 분 단위인데, 정리 핸들러는 빌드가 끝나야 걸린다. 그동안
    // 탭을 닫으면 이미 지나간 close 이벤트는 다시 오지 않아 아카이브가 그대로 남는다 —
    // 아무도 받지 않을 파일이다. 요청이 끊긴 것을 빌드 전부터 지켜본다.
    let clientGone = false;
    request.raw.on("close", () => {
      clientGone = true;
    });

    try {
      await buildBackupArchive(tempDirName);

      const archiveStat = await stat(archivePath);
      if (clientGone) {
        app.log.warn(
          { bytes: archiveStat.size },
          "Backup export abandoned before delivery; discarding archive",
        );
        cleanup();
        reply.hijack();
        reply.raw.destroy();
        return reply;
      }

      const stream = createReadStream(archivePath);
      stream.on("close", cleanup);
      stream.on("error", cleanup);
      reply.raw.on("close", cleanup);

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
    } catch (err: any) {
      app.log.error(err, "Backup export failed");
      cleanup();
      return reply.code(500).send({ error: `Backup export failed: ${err.message || err}` });
    }
  });

  await app.register(async (admin) => {
    admin.addHook("preHandler", app.authenticate);
    admin.addHook("preHandler", app.requireAdmin);

    // 60초·1회용 티켓. 제거한 7일짜리 ?token= JWT와는 다르다.
    admin.post("/export-ticket", async (request) => {
      const jti = randomBytes(16).toString("hex");
      const ticket = app.jwt.sign(
        { sub: request.user.sub, purpose: "backup", jti },
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
