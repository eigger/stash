import type { FastifyInstance } from "fastify";
import { locationInputSchema } from "@stash/shared";
import { prisma } from "../lib/prisma.js";

export async function locationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async () => {
    return prisma.location.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { items: true } } },
    });
  });

  app.post("/", async (request, reply) => {
    const parsed = locationInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const location = await prisma.location.create({ data: parsed.data });
    return reply.code(201).send(location);
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = locationInputSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const location = await prisma.location.update({ where: { id }, data: parsed.data });
    return location;
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.location.delete({ where: { id } });
    return reply.code(204).send();
  });
}
