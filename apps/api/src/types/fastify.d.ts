import "fastify";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    locale: "ko" | "en";
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    // role은 API 토큰에만 필수. 미디어 쿠키 토큰은 purpose:"media"만 담는다.
    payload: { sub: string; role?: "ADMIN" | "GENERAL"; tv?: number; purpose?: string; jti?: string };
    user: { sub: string; role?: "ADMIN" | "GENERAL"; tv?: number; purpose?: string; jti?: string };
  }
}
