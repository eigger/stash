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
    // jobId는 백업 내보내기 티켓에만 있다 — 미리 만들어 둔 아카이브를 가리킨다
    payload: {
      sub: string;
      role?: "ADMIN" | "GENERAL";
      tv?: number;
      purpose?: string;
      jti?: string;
      jobId?: string;
    };
    user: {
      sub: string;
      role?: "ADMIN" | "GENERAL";
      tv?: number;
      purpose?: string;
      jti?: string;
      jobId?: string;
    };
  }
}
