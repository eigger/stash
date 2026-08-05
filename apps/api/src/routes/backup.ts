import { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { existsSync } from "fs";
import { mkdir, writeFile, readFile, rm, readdir, copyFile } from "fs/promises";

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
        await copyFile(path.join(UPLOAD_DIR, entry.name), path.join(filesDir, entry.name));
      }
    }
  }

  await execAsync(`tar -czf "${archivePath}" -C "${tempDir}" .`);
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
    let tempDir = "";
    let archivePath = "";

    try {
      ({ tempDir, archivePath } = await buildBackupArchive(tempDirName));
      const stream = createReadStream(archivePath);
      const cleanup = () => {
        rm(tempDir, { recursive: true, force: true }).catch(() => {});
        rm(archivePath, { force: true }).catch(() => {});
      };
      stream.on("close", cleanup);
      stream.on("error", cleanup);
      reply.raw.on("close", cleanup);

      return reply
        .header("Content-Type", "application/gzip")
        .header(
          "Content-Disposition",
          `attachment; filename="stash_backup_${new Date().toISOString().slice(0, 10)}.tar.gz"`,
        )
        .send(stream);
    } catch (err: any) {
      app.log.error(err, "Backup export failed");
      if (tempDir) rm(tempDir, { recursive: true, force: true }).catch(() => {});
      if (archivePath) rm(archivePath, { force: true }).catch(() => {});
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
      const file = await request.file({ limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB
      if (!file) return reply.code(400).send({ error: t("noBackupFileUploaded", request.locale) });

      const restoreTempDirName = `restore_${Date.now()}`;
      const restoreTempDir = path.join(UPLOAD_DIR, restoreTempDirName);
      const archivePath = path.join(UPLOAD_DIR, `${restoreTempDirName}.tar.gz`);

      try {
        await mkdir(restoreTempDir, { recursive: true });
        const buffer = await file.toBuffer();
        await writeFile(archivePath, buffer);
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
            await copyFile(path.join(filesDir, filename), path.join(UPLOAD_DIR, filename));
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
