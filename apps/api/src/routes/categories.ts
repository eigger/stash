import type { FastifyInstance } from "fastify";
import { categoryInputSchema } from "@stash/shared";
import { prisma } from "../lib/prisma.js";

export async function categoryRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async () => {
    return prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { items: true } } },
    });
  });

  app.post("/", async (request, reply) => {
    const parsed = categoryInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const category = await prisma.category.create({ data: parsed.data });
    return reply.code(201).send(category);
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = categoryInputSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const category = await prisma.category.update({ where: { id }, data: parsed.data });
    return category;
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.category.delete({ where: { id } });
    return reply.code(204).send();
  });
}
