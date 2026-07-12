import type { FastifyInstance } from "fastify";
import { settingUpdateSchema } from "@stash/shared";
import { prisma } from "../lib/prisma.js";
import { parseEnabledProviderIds } from "../lib/barcodeLookup/index.js";
import { getSetting } from "../lib/settings.js";
import { t } from "../lib/i18n.js";

const DEFAULT_APP_PUBLIC_URL = "http://localhost:3000";

// 관리자 UI에서 입력하는 외부 연동 키. 값은 절대 반환하지 않고 설정 여부(hasValue)만 알려준다.
const MANAGED_KEYS = [
  "UPCITEMDB_API_KEY",
  "INVENTORY_WEBHOOK_URL",
  "APP_PUBLIC_URL",
  "LOOKUP_PROVIDERS",
  "NAVER_CLIENT_ID",
  "NAVER_CLIENT_SECRET",
];

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.requireAdmin);

  app.get("/", async () => {
    const rows = await prisma.setting.findMany({ where: { key: { in: MANAGED_KEYS } } });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return MANAGED_KEYS.map((key) => {
      // APP_PUBLIC_URL/LOOKUP_PROVIDERS는 비밀값이 아니라 실제 동작을 결정하는 값이라,
      // 관리자가 "지금 뭐가 적용되고 있는지"(DB 설정 → 기본값 순) 미리 볼 수 있어야 한다.
      if (key === "APP_PUBLIC_URL") {
        return {
          key,
          hasValue: byKey.has(key),
          effectiveValue: byKey.get(key)?.value || process.env.APP_PUBLIC_URL || DEFAULT_APP_PUBLIC_URL,
        };
      }
      if (key === "LOOKUP_PROVIDERS") {
        return {
          key,
          hasValue: byKey.has(key),
          effectiveValue: parseEnabledProviderIds(byKey.get(key)?.value).join(","),
        };
      }
      return { key, hasValue: byKey.has(key) };
    });
  });

  app.put("/:key", async (request, reply) => {
    const { key } = request.params as { key: string };
    if (!MANAGED_KEYS.includes(key)) return reply.code(400).send({ error: t("unknownSettingKey", request.locale) });

    const parsed = settingUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    await prisma.setting.upsert({
      where: { key },
      create: { key, value: parsed.data.value },
      update: { value: parsed.data.value },
    });
    return { key, hasValue: true };
  });

  app.delete("/:key", async (request, reply) => {
    const { key } = request.params as { key: string };
    await prisma.setting.deleteMany({ where: { key } });
    return reply.code(204).send();
  });

  // 저장한 Client ID/Secret이 실제로 유효한지 그 자리에서 바로 확인한다 — 잘못 입력해도
  // 지금까지는 스캔했을 때 계속 "미확인 상품"만 나오는 것 말고는 원인을 알 방법이 없었다.
  // 바코드 숫자가 아니라 실제 상품명으로 검색해서, "이 연동 자체가 살아있는지"만 본다
  // (바코드 검색 매칭 품질은 별개 문제라 여기서 같이 판단하지 않는다).
  app.post("/test-naver", async (request, reply) => {
    const clientId = await getSetting("NAVER_CLIENT_ID", process.env.NAVER_CLIENT_ID);
    const clientSecret = await getSetting("NAVER_CLIENT_SECRET", process.env.NAVER_CLIENT_SECRET);
    if (!clientId || !clientSecret) {
      return reply.code(400).send({ error: t("naverCredentialsRequired", request.locale) });
    }

    const TEST_QUERY = "농심 신라면";
    try {
      const res = await fetch(
        `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(TEST_QUERY)}&display=1`,
        { headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret } },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return reply.code(400).send({
          error: t("naverApiError", request.locale, {
            status: res.status,
            detail: body.slice(0, 200) || t("naverCredentialsHint", request.locale),
          }),
        });
      }
      const data = (await res.json()) as any;
      const title = data.items?.[0]?.title ? String(data.items[0].title).replace(/<[^>]+>/g, "") : null;
      return { ok: true, sample: title };
    } catch (err: any) {
      return reply.code(400).send({ error: t("naverRequestFailed", request.locale, { detail: err.message || err }) });
    }
  });
}
