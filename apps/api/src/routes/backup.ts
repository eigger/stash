import { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
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

const USER_EXPORT_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  tokenVersion: true,
  createdAt: true,
} as const;

export async function backupRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.requireAdmin);

  // GET /api/backup/export
  // Setting(외부 API 키)은 의도적으로 백업 대상에서 제외한다 — 유출 시 키까지 노출되는 걸 막기 위함.
  // passwordHash도 제외한다 — 백업 파일이 클라우드/NAS에 그대로 올라가는 경우가 많아
  // bcrypt 해시 덤프가 되면 오프라인 사전 공격 대상이 된다. 복원 시 임시 비밀번호를 발급한다.
  app.get("/export", async (request, reply) => {
    const tempDirName = `backup_${Date.now()}`;
    const tempDir = path.join(UPLOAD_DIR, tempDirName);
    const filesDir = path.join(tempDir, "files");
    const archivePath = path.join(UPLOAD_DIR, `${tempDirName}.tar.gz`);

    try {
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
      const fileBuffer = await readFile(archivePath);

      reply
        .header("Content-Type", "application/gzip")
        .header(
          "Content-Disposition",
          `attachment; filename="stash_backup_${new Date().toISOString().slice(0, 10)}.tar.gz"`,
        )
        .send(fileBuffer);
    } catch (err: any) {
      app.log.error(err, "Backup export failed");
      return reply.code(500).send({ error: `Backup export failed: ${err.message || err}` });
    } finally {
      rm(tempDir, { recursive: true, force: true }).catch(() => {});
      rm(archivePath, { force: true }).catch(() => {});
    }
  });

  // POST /api/backup/restore
  app.post("/restore", async (request, reply) => {
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
      // (ADMIN만 반환하면 GENERAL은 영구 잠김 — 관리자가 남의 비밀번호를 재설정하는 라우트가 없다.)
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
        if (dbData.maintenanceRecords?.length) await tx.maintenanceRecord.createMany({ data: dbData.maintenanceRecords });
        if (dbData.lookupCache?.length) await tx.productLookupCache.createMany({ data: dbData.lookupCache });
        if (dbData.pushSubscriptions?.length) await tx.pushSubscription.createMany({ data: dbData.pushSubscriptions });
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
}
