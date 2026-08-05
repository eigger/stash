import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Prisma 7은 드라이버 어댑터가 필수다. URL만 넘기던 생성자는 제거됐다.
// 모듈 로드 시점에 DATABASE_URL이 없는 단위 테스트(webhook 등)를 깨지 않도록 lazy 초기화한다.
let client: PrismaClient | undefined;

function getClient(): PrismaClient {
  if (client) return client;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  const adapter = new PrismaPg({ connectionString });
  client = new PrismaClient({ adapter });
  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getClient(), prop, receiver);
    return typeof value === "function" ? value.bind(getClient()) : value;
  },
});
