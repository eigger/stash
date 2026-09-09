import { copyFile, link, readdir, rm } from "node:fs/promises";
import path from "node:path";

/**
 * 백업 작업 디렉터리(`backup_<ts>/files/`)는 UPLOAD_DIR **안**이라 늘 같은
 * 파일시스템이다 — 바이트를 복사할 이유가 없다. 하드링크는 크기와 무관하게 즉시고
 * 자리를 차지하지 않는다. 복사하면 백업 한 번이 원본만큼의 디스크를 더 먹는다.
 *
 * 링크가 안 되는 환경(파일시스템이 지원하지 않거나 경계를 넘는 경우)에서는 조용히
 * 복사로 되돌아간다 — 백업이 되는 것이 먼저다.
 */
export async function linkOrCopy(source: string, dest: string): Promise<void> {
  try {
    await link(source, dest);
  } catch {
    await copyFile(source, dest);
  }
}

/** 백업·복원이 UPLOAD_DIR 안에 만드는 작업 디렉터리와 아카이브 */
const ARTIFACT_PATTERN = /^(?:backup|restore)_(\d{10,})(?:\.tar\.gz)?$/;

/**
 * 빌드 중인 것을 실수로 걷지 않도록 넉넉히 잡는다. 첨부가 많으면 tar가 분 단위다.
 */
export const STALE_ARTIFACT_AGE_MS = 2 * 60 * 60 * 1000;

/**
 * 이름에 박힌 생성 시각을 읽는다.
 *
 * mtime을 쓰지 않는 이유: 빌드가 길면 계속 갱신되어 "오래된 것"을 못 고른다.
 */
export function backupArtifactCreatedAt(name: string): number | null {
  const match = ARTIFACT_PATTERN.exec(name);
  if (!match) return null;
  const ts = Number(match[1]);
  return Number.isFinite(ts) ? ts : null;
}

/**
 * 중단된 백업·복원이 남긴 찌꺼기를 걷는다.
 *
 * 내보내기는 uploads 전체를 `backup_<ts>/files/`로 옮긴 뒤 `backup_<ts>.tar.gz`를
 * 만든다. 정상 종료하면 지워지지만, 빌드 도중 탭을 닫거나 프로세스가 죽으면 그대로
 * 남는다 — **누를 때마다 쌓이고 아무도 걷지 않았다.**
 */
export async function sweepStaleBackupArtifacts(
  uploadDir: string,
  now = Date.now(),
): Promise<string[]> {
  const swept: string[] = [];
  let entries;
  try {
    entries = await readdir(uploadDir, { withFileTypes: true });
  } catch {
    return swept;
  }

  for (const entry of entries) {
    const createdAt = backupArtifactCreatedAt(entry.name);
    if (createdAt === null) continue;
    if (now - createdAt <= STALE_ARTIFACT_AGE_MS) continue;
    await rm(path.join(uploadDir, entry.name), { recursive: true, force: true }).catch(() => {});
    swept.push(entry.name);
  }
  return swept;
}
