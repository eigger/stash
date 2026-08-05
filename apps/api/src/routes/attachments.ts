import { randomUUID } from "node:crypto";
import { existsSync, createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { processImageForStorage } from "../lib/imageProcessing.js";
import { UPLOAD_DIR, deleteUploadedFile } from "../lib/uploads.js";
import { t } from "../lib/i18n.js";
import { requireMediaAccess } from "../lib/mediaAuth.js";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function safeContentType(mimeType: string): string {
  // DB에 저장된 값을 그대로 쓰지 않고 화이트리스트를 한 번 더 통과시킨다.
  return ALLOWED_MIME.has(mimeType) ? mimeType : "application/octet-stream";
}

// <img src>는 Authorization 헤더를 못 보내므로, 로그인 시 내려준 httpOnly 미디어 쿠키
// (또는 Bearer)로 인증한다. barcodes.ts의 라벨 공개 라우트와 달리 영수증·보증서 PDF도
// 서빙하므로 "URL을 아는 사람"만으로는 부족하다.
export async function mediaAttachmentRoutes(app: FastifyInstance) {
  app.get("/file/:filename", async (request, reply) => {
    const allowed = await requireMediaAccess(app, request, reply);
    if (!allowed) return;

    const { filename } = request.params as { filename: string };
    const safeName = path.basename(filename); // 경로 탐색 공격 방지
    const filePath = path.join(UPLOAD_DIR, safeName);

    const attachment = await prisma.attachment.findFirst({ where: { filePath: safeName } });
    if (!attachment) return reply.code(404).send({ error: t("fileNotFound", request.locale) });
    if (!existsSync(filePath)) return reply.code(404).send({ error: t("fileMissingOnDisk", request.locale) });

    const contentType = safeContentType(attachment.mimeType);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.type(contentType);

    // PDF는 브라우저에서 인라인 실행(JS 포함 가능)되지 않도록 강제 다운로드.
    // 이미지는 <img src>로 써야 하므로 인라인 유지.
    if (contentType === "application/pdf") {
      reply.header("Content-Disposition", `attachment; filename="${safeName}"`);
    }

    return createReadStream(filePath);
  });
}

export async function attachmentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // 아이템 사진, 영수증, 설명서/보증서 등을 아이템에 첨부한다.
  app.post("/", async (request, reply) => {
    const { itemId } = request.query as { itemId?: string };
    if (!itemId) return reply.code(400).send({ error: t("itemIdRequired", request.locale) });

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) return reply.code(404).send({ error: t("itemNotFound", request.locale) });

    const file = await request.file();
    if (!file) return reply.code(400).send({ error: t("fileRequired", request.locale) });
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return reply.code(400).send({ error: t("unsupportedFileType", request.locale, { mimetype: file.mimetype }) });
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
        return reply.code(400).send({ error: t("invalidImageFile", request.locale) });
      }
    }

    const storedName = `${randomUUID()}${ext}`;
    await writeFile(path.join(UPLOAD_DIR, storedName), fileBuffer);

    const attachment = await prisma.attachment.create({
      data: { filePath: storedName, mimeType, itemId },
    });

    return reply.code(201).send(attachment);
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const attachment = await prisma.attachment.delete({ where: { id } }).catch(() => null);
    if (!attachment) return reply.code(404).send({ error: t("attachmentNotFound", request.locale) });
    await deleteUploadedFile(attachment.filePath);
    return reply.code(204).send();
  });
}
