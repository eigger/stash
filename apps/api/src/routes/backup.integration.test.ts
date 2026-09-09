import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { buildApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

/**
 * POST /api/backup/restore는 DATABASE_URL이 가리키는 DB의 모든 테이블을 지우고 백업
 * 내용으로 되채운다. 실수로 개발 DB를 향하면 그걸 통째로 날린다. 이 파일을 읽는 것은
 * vitest.integration.config.ts뿐이고 CI는 잡 전용 컨테이너만 물리지만, 로컬에서
 * 잘못된 env로 실행될 여지가 남으므로 **버려도 되는 DB라고 이름이 말할 때만** 돈다.
 */
function assertSafeToWipeDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/test/i.test(url)) {
    throw new Error(
      `Refusing to run backup restore tests: DATABASE_URL does not look like a disposable test database (${url}). ` +
        "This suite deletes all rows in every backed-up table.",
    );
  }
}

function multipartRestoreRequest(archive: Buffer) {
  const boundary = `----stashBackupTest${randomUUID()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="file"; filename="backup.tar.gz"\r\n`),
    Buffer.from(`Content-Type: application/gzip\r\n\r\n`),
    archive,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

describe("backup export/restore round trip", () => {
  let app: FastifyInstance;
  const suffix = randomUUID();
  let adminId: string;
  let adminToken: string;
  let locationId: string;
  let itemId: string;

  beforeAll(async () => {
    assertSafeToWipeDatabase();
    app = await buildApp();
    await app.ready();

    const admin = await prisma.user.create({
      data: {
        name: "Backup Admin",
        email: `backup-${suffix}@example.com`,
        passwordHash: await bcrypt.hash("test-password-123", 10),
        role: "ADMIN",
      },
    });
    adminId = admin.id;
    adminToken = app.jwt.sign({ sub: admin.id, role: "ADMIN", tv: admin.tokenVersion });

    const location = await prisma.location.create({ data: { name: `Pantry ${suffix}` } });
    locationId = location.id;
    const item = await prisma.item.create({
      data: { name: `Canned beans ${suffix}`, quantity: 7, locationId: location.id },
    });
    itemId = item.id;
  });

  afterAll(async () => {
    await prisma.item.deleteMany({ where: { id: itemId } }).catch(() => {});
    await prisma.location.deleteMany({ where: { id: locationId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: adminId } }).catch(() => {});
    await app.close();
    await prisma.$disconnect();
  });

  /**
   * 내보내기는 두 걸음이다 — 빌드를 시작시키고, 다 될 때까지 진행률을 물어본다.
   * 예전처럼 GET /export 하나가 만들면서 흘려보내지 않는다.
   */
  async function buildReadyJob(): Promise<string> {
    const startRes = await app.inject({
      method: "POST",
      url: "/api/backup/export/jobs",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(startRes.statusCode).toBe(200);
    const { jobId } = startRes.json() as { jobId: string };

    for (let i = 0; i < 200; i += 1) {
      const statusRes = await app.inject({
        method: "GET",
        url: `/api/backup/export/jobs/${jobId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(statusRes.statusCode).toBe(200);
      const job = statusRes.json() as { phase: string; error: string | null };
      if (job.phase === "ready") return jobId;
      expect(job.phase, job.error ?? "").not.toBe("failed");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("backup job did not become ready");
  }

  async function issueTicket(jobId: string): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: "/api/backup/export-ticket",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { jobId },
    });
    expect(res.statusCode).toBe(200);
    const { ticket } = res.json() as { ticket: string };
    expect(ticket).toBeTruthy();
    return ticket;
  }

  it("round-trips users, locations and items through export and restore", async () => {
    const ticket = await issueTicket(await buildReadyJob());

    const exportRes = await app.inject({
      method: "GET",
      url: `/api/backup/export?ticket=${encodeURIComponent(ticket)}`,
    });
    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.headers["content-type"]).toBe("application/gzip");
    // 길이가 없으면 chunked로 나가 브라우저가 진행률을 못 그리고, 길이 없는 응답을
    // 통째로 버퍼링하는 프록시에 걸린다.
    expect(exportRes.headers["content-length"]).toBeDefined();
    const archive = exportRes.rawPayload;
    expect(Number(exportRes.headers["content-length"])).toBe(archive.length);
    expect(archive.length).toBeGreaterThan(0);

    // 복원이 지웠다가 되채우는 것을 확인하려면, 백업에 없는 행을 하나 만들어 둔다
    const strayId = (
      await prisma.location.create({ data: { name: `Should be wiped ${suffix}` } })
    ).id;

    const { body, contentType } = multipartRestoreRequest(archive);
    const restoreRes = await app.inject({
      method: "POST",
      url: "/api/backup/restore",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      payload: body,
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.json()).toMatchObject({ success: true });

    // 백업 시점에 있던 것은 되살아나고
    const restoredItem = await prisma.item.findUnique({ where: { id: itemId } });
    expect(restoredItem?.name).toBe(`Canned beans ${suffix}`);
    expect(restoredItem?.quantity).toBe(7);
    expect(restoredItem?.locationId).toBe(locationId);

    const restoredAdmin = await prisma.user.findUnique({ where: { id: adminId } });
    expect(restoredAdmin?.email).toBe(`backup-${suffix}@example.com`);
    expect(restoredAdmin?.role).toBe("ADMIN");

    // 그 뒤에 생긴 것은 사라진다
    expect(await prisma.location.findUnique({ where: { id: strayId } })).toBeNull();
  });

  // 티켓은 미리 만들어 둔 아카이브를 가리킨다 — 가리킬 것이 없으면 발급하지 않는다
  it("refuses a ticket for a job that does not exist", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/backup/export-ticket",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { jobId: "no-such-job" },
    });
    expect(res.statusCode).toBe(404);
  });

  /**
   * 준비되지 않은 작업으로 티켓을 태우면 안 된다 — 사용자는 다시 발급받으면 되지만,
   * 그러려면 409가 티켓을 소비하지 않아야 한다.
   */
  it("does not burn the ticket when the archive is not ready", async () => {
    const jobId = await buildReadyJob();
    const ticket = await issueTicket(jobId);

    // 아카이브를 버려 준비되지 않은 상태로 만든다
    await app.inject({
      method: "DELETE",
      url: `/api/backup/export/jobs/${jobId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    const first = await app.inject({
      method: "GET",
      url: `/api/backup/export?ticket=${encodeURIComponent(ticket)}`,
    });
    expect(first.statusCode).toBe(409);

    // 같은 티켓이 여전히 유효하다 — 401(재사용)이 아니라 409(준비 안 됨)로 남는다
    const second = await app.inject({
      method: "GET",
      url: `/api/backup/export?ticket=${encodeURIComponent(ticket)}`,
    });
    expect(second.statusCode).toBe(409);
  });

  it("names an export ticket that was never issued as unauthorized", async () => {
    const noTicket = await app.inject({ method: "GET", url: "/api/backup/export" });
    expect(noTicket.statusCode).toBe(401);

    const garbage = await app.inject({ method: "GET", url: "/api/backup/export?ticket=not-a-jwt" });
    expect(garbage.statusCode).toBe(401);

    // 로그인 토큰을 그대로 붙이면 서명은 맞지만 용도가 다르다
    const loginToken = app.jwt.sign({ sub: adminId, role: "ADMIN", tv: 0 });
    const wrongPurpose = await app.inject({
      method: "GET",
      url: `/api/backup/export?ticket=${encodeURIComponent(loginToken)}`,
    });
    expect(wrongPurpose.statusCode).toBe(401);
  });
});
