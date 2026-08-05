import type { FastifyInstance } from "fastify";
import { getHouseholdXp } from "../lib/householdXp.js";

export async function xpRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async () => {
    const total = await getHouseholdXp();
    return { total };
  });
}
