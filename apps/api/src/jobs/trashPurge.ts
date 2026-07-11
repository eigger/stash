import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { deleteUploadedFile } from "../lib/uploads.js";

// 휴지통에 30일 넘게 남아있는 아이템은 완전히 잊혀도 되는 실수로 보고 자동으로
// 영구 삭제한다 — 사용자가 매번 휴지통을 비우러 들어올 필요가 없게 하기 위함.
const RETENTION_DAYS = 30;

export async function purgeOldTrash(): Promise<void> {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - RETENTION_DAYS);

  const stale = await prisma.item.findMany({
    where: { deletedAt: { not: null, lte: threshold } },
  });

  for (const item of stale) {
    const attachments = await prisma.attachment.findMany({ where: { itemId: item.id } });
    await prisma.item.delete({ where: { id: item.id } });
    await Promise.all(attachments.map((a) => deleteUploadedFile(a.filePath)));
  }
}

export function startTrashPurgeJob(): void {
  purgeOldTrash().catch((err) => console.error("[trash-purge] initial run failed", err));
  // 매일 새벽 4시
  cron.schedule("0 4 * * *", () => {
    purgeOldTrash().catch((err) => console.error("[trash-purge] scheduled run failed", err));
  });
}
