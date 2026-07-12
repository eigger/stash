import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import {
  bootstrapAdminSchema,
  createUserSchema,
  loginSchema,
  updateProfileSchema,
} from "@stash/shared";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";

export async function authRoutes(app: FastifyInstance) {
  app.get("/bootstrap/status", async () => {
    const userCount = await prisma.user.count();
    return { needsBootstrap: userCount === 0 };
  });

  app.post("/bootstrap/admin", async (request, reply) => {
    const parsed = bootstrapAdminSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return reply.code(409).send({ error: t("bootstrapDisabled", request.locale) });
    }

    const { name, email, password } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role: "ADMIN" },
    });
    return reply
      .code(201)
      .send({ id: user.id, name: user.name, email: user.email, role: user.role });
  });

  app.post(
    "/login",
    // 무차별 대입 방어: IP당 15분에 10회로 제한.
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const { email, password } = parsed.data;
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return reply.code(401).send({ error: t("invalidCredentials", request.locale) });

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return reply.code(401).send({ error: t("invalidCredentials", request.locale) });

      const token = app.jwt.sign({ sub: user.id, role: user.role }, { expiresIn: "90d" });
      return {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      };
    },
  );

  app.get("/me", { preHandler: [app.authenticate] }, async (request) => {
    const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
    if (!user) return null;
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  });

  // 공개 회원가입은 없다 — 관리자만 가족 구성원 계정을 만들 수 있다.
  app.post(
    "/users",
    { preHandler: [app.authenticate, app.requireAdmin] },
    async (request, reply) => {
      const parsed = createUserSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const { name, email, password, role } = parsed.data;
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({ data: { name, email, passwordHash, role } });
      return reply
        .code(201)
        .send({ id: user.id, name: user.name, email: user.email, role: user.role });
    },
  );

  app.get("/users", { preHandler: [app.authenticate, app.requireAdmin] }, async () => {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true },
      orderBy: { createdAt: "asc" },
    });
    return users;
  });

  app.delete(
    "/users/:id",
    { preHandler: [app.authenticate, app.requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (id === request.user.sub) {
        return reply.code(400).send({ error: t("cannotDeleteSelf", request.locale) });
      }
      await prisma.user.delete({ where: { id } });
      return reply.code(204).send();
    },
  );

  app.patch("/profile", { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const userId = request.user.sub;
    const { name, email, currentPassword, newPassword } = parsed.data;

    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;

    if (newPassword) {
      if (!currentPassword) {
        return reply.code(400).send({ error: t("currentPasswordRequired", request.locale) });
      }
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return reply.code(404).send({ error: t("userNotFound", request.locale) });

      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return reply.code(400).send({ error: t("incorrectCurrentPassword", request.locale) });

      updateData.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    const user = await prisma.user.update({ where: { id: userId }, data: updateData });
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  });
}
