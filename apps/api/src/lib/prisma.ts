import { PrismaClient } from "@prisma/client";

// 앱 전체에서 하나의 PrismaClient 인스턴스만 재사용한다.
export const prisma = new PrismaClient();
