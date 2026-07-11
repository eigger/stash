import type { FastifyInstance } from "fastify";
import { resolveProduct } from "../lib/barcodeLookup/index.js";

export async function lookupRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // 스캔 화면에서 저장 전 미리보기로 쓸 수 있는 순수 조회 엔드포인트 (DB에 아무것도 만들지 않음).
  app.get("/:barcode", async (request) => {
    const { barcode } = request.params as { barcode: string };
    return resolveProduct(barcode);
  });
}
