import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { existsSync } from "fs";
import { mkdir, writeFile, readFile, rm, readdir, copyFile } from "fs/promises";

const execAsync = promisify(exec);
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

export async function backupRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", async (request, reply) => {
    if (request.user.role !== "ADMIN") {
      return reply.code(403).send({ error: t("adminRoleRequired", request.locale) });
    }
  });

  // GET /api/backup/export
  // Setting(외부 API 키)은 의도적으로 백업 대상에서 제외한다 — 유출 시 키까지 노출되는 걸 막기 위함.
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
        prisma.user.findMany(),
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

        if (dbData.users?.length) await tx.user.createMany({ data: dbData.users });
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

      return { success: true };
    } catch (err: any) {
      app.log.error(err, "Backup restore failed");
      return reply.code(500).send({ error: `Restore failed: ${err.message || err}` });
    } finally {
      rm(restoreTempDir, { recursive: true, force: true }).catch(() => {});
      rm(archivePath, { force: true }).catch(() => {});
    }
  });
}
