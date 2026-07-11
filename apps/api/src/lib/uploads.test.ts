import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { UPLOAD_DIR, deleteUploadedFile } from "./uploads.js";

describe("deleteUploadedFile", () => {
  const testFile = "vitest-temp-file.txt";
  const filePath = path.join(UPLOAD_DIR, testFile);

  afterEach(async () => {
    await rm(filePath, { force: true });
  });

  it("deletes an existing file", async () => {
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(filePath, "fake image bytes");
    expect(existsSync(filePath)).toBe(true);

    await deleteUploadedFile(testFile);

    expect(existsSync(filePath)).toBe(false);
  });

  it("does not throw when the file does not exist", async () => {
    await expect(deleteUploadedFile("nonexistent-file.txt")).resolves.toBeUndefined();
  });
});
