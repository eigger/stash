// 최초 관리자 계정을 만드는 시드 스크립트. 로그인 화면의 "첫 관리자 생성" 부트스트랩 흐름과
// 별개로, CLI에서 바로 관리자를 만들고 싶을 때 사용한다.
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.ADMIN_PASSWORD ?? "changeme123";
  const name = process.env.ADMIN_NAME ?? "관리자";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`이미 존재하는 계정입니다: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.user.create({ data: { name, email, passwordHash, role: "ADMIN" } });

  console.log(`관리자 계정 생성 완료: ${admin.email} (id: ${admin.id})`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`기본 비밀번호(${password})를 사용했습니다. 로그인 후 즉시 변경하세요.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
