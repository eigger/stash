import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  STALE_ARTIFACT_AGE_MS,
  backupArtifactCreatedAt,
  linkOrCopy,
  sweepStaleBackupArtifacts,
} from "./backupFiles.js";

describe("linkOrCopy", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "stash-backup-"));
  });

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  /**
   * 작업 디렉터리는 UPLOAD_DIR 안이라 늘 같은 파일시스템이다. 복사하면 백업 한 번이
   * 원본만큼의 디스크를 더 먹는다 — 사진이 쌓인 인스턴스에서 그게 그대로 문제가 된다.
   */
  it("links instead of copying the bytes", async () => {
    const source = path.join(dir, "photo.jpg");
    const dest = path.join(dir, "staged.jpg");
    await writeFile(source, "photo-bytes");

    await linkOrCopy(source, dest);

    const a = await stat(source);
    const b = await stat(dest);
    expect(b.ino).toBe(a.ino);
    expect(b.nlink).toBe(2);
    expect(await readFile(dest, "utf8")).toBe("photo-bytes");
  });

  // 링크가 안 되는 환경에서도 백업은 돼야 한다 — 자리가 이미 차 있으면 link는 실패한다
  it("falls back to copying when the link cannot be made", async () => {
    const source = path.join(dir, "photo.jpg");
    const dest = path.join(dir, "taken.jpg");
    await writeFile(source, "photo-bytes");
    await writeFile(dest, "something-else");

    await linkOrCopy(source, dest);

    expect(await readFile(dest, "utf8")).toBe("photo-bytes");
    expect((await stat(dest)).nlink).toBe(1);
  });
});

/**
 * 내보내기의 정리 핸들러는 빌드가 끝나야 걸린다. 빌드 도중 탭을 닫거나 프로세스가
 * 죽으면 uploads 사본과 아카이브가 그대로 남는데, 지금까지 이걸 걷는 주체가 없어
 * 누를 때마다 쌓였다.
 */
describe("sweepStaleBackupArtifacts", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "stash-sweep-"));
  });

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("removes abandoned backup and restore leftovers", async () => {
    const old = Date.now() - STALE_ARTIFACT_AGE_MS - 1;
    await writeFile(path.join(dir, `backup_${old}.tar.gz`), "stale archive");
    await mkdir(path.join(dir, `backup_${old}`, "files"), { recursive: true });
    await mkdir(path.join(dir, `restore_${old}`), { recursive: true });
    await writeFile(path.join(dir, "photo.jpg"), "a real attachment");

    const swept = await sweepStaleBackupArtifacts(dir);

    expect(swept.sort()).toEqual([`backup_${old}`, `backup_${old}.tar.gz`, `restore_${old}`].sort());
    // 사용자 파일은 건드리지 않는다
    expect(await readFile(path.join(dir, "photo.jpg"), "utf8")).toBe("a real attachment");
  });

  // 빌드 중인 것을 걷어 가면 tar가 깨진다 — 이름에 박힌 시각이 근거다
  it("leaves a build that is still young alone", async () => {
    await writeFile(path.join(dir, `backup_${Date.now()}.tar.gz`), "building");
    expect(await sweepStaleBackupArtifacts(dir)).toEqual([]);
  });

  // 접두어만 보고 자르면 안 된다 — 사용자 파일이 그 이름일 수도 있다
  it("only recognises names that carry a timestamp", () => {
    expect(backupArtifactCreatedAt("backup_notes.txt")).toBeNull();
    expect(backupArtifactCreatedAt("photo.jpg")).toBeNull();
    expect(backupArtifactCreatedAt("backup_1757000000000")).toBe(1757000000000);
    expect(backupArtifactCreatedAt("restore_1757000000000.tar.gz")).toBe(1757000000000);
  });

  it("does nothing when the upload dir does not exist yet", async () => {
    expect(await sweepStaleBackupArtifacts(path.join(tmpdir(), "stash-missing-xyz"))).toEqual([]);
  });
});
