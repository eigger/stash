import { prisma } from "./prisma.js";

// 관리자가 UI에서 입력한 Setting 값이 있으면 그걸 우선하고, 없으면 env 변수로 폴백한다.
export async function getSetting(key: string, envFallback?: string): Promise<string | undefined> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (row?.value) return row.value;
  return envFallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}
