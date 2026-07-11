import { unlink } from "node:fs/promises";
import path from "node:path";

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

// 파일이 이미 없어도(수동 삭제 등) 조용히 넘어간다 — DB 정리가 목적이지 파일 존재를
// 보장하는 게 목적이 아니다.
export async function deleteUploadedFile(storedName: string): Promise<void> {
  await unlink(path.join(UPLOAD_DIR, storedName)).catch(() => {});
}
