import { randomUUID } from "node:crypto";
import { existsSync, createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { processImageForStorage } from "../lib/imageProcessing.js";
import { UPLOAD_DIR, deleteUploadedFile } from "../lib/uploads.js";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export async function attachmentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // 아이템 사진, 영수증, 설명서/보증서 등을 아이템에 첨부한다.
  app.post("/", async (request, reply) => {
    const { itemId } = request.query as { itemId?: string };
    if (!itemId) return reply.code(400).send({ error: "itemId가 필요합니다" });

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) return reply.code(404).send({ error: "item not found" });

    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "파일이 없습니다" });
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return reply.code(400).send({ error: `지원하지 않는 파일 형식: ${file.mimetype}` });
    }

    await mkdir(UPLOAD_DIR, { recursive: true });

    let fileBuffer = await file.toBuffer();
    let mimeType = file.mimetype;
    let ext = path.extname(file.filename) || "";

    if (mimeType.startsWith("image/")) {
      try {
        const processed = await processImageForStorage(fileBuffer);
        fileBuffer = processed.buffer;
        mimeType = processed.mimeType;
        ext = processed.ext;
      } catch {
        return reply.code(400).send({ error: "손상되었거나 지원하지 않는 이미지 파일입니다" });
      }
    }

    const storedName = `${randomUUID()}${ext}`;
    await writeFile(path.join(UPLOAD_DIR, storedName), fileBuffer);

    const attachment = await prisma.attachment.create({
      data: { filePath: storedName, mimeType, itemId },
    });

    return reply.code(201).send(attachment);
  });

  app.get("/file/:filename", async (request, reply) => {
    const { filename } = request.params as { filename: string };
    const safeName = path.basename(filename); // 경로 탐색 공격 방지
    const filePath = path.join(UPLOAD_DIR, safeName);

    const attachment = await prisma.attachment.findFirst({ where: { filePath: safeName } });
    if (!attachment) return reply.code(404).send({ error: "file not found" });
    if (!existsSync(filePath)) return reply.code(404).send({ error: "file on disk not found" });

    reply.type(attachment.mimeType);
    return createReadStream(filePath);
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const attachment = await prisma.attachment.delete({ where: { id } }).catch(() => null);
    if (!attachment) return reply.code(404).send({ error: "attachment not found" });
    await deleteUploadedFile(attachment.filePath);
    return reply.code(204).send();
  });
}
