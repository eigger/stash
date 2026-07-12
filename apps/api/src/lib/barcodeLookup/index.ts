import { prisma } from "../prisma.js";
import { getSetting } from "../settings.js";
import { openFoodFactsProvider } from "./openFoodFacts.js";
import { upcItemDbProvider } from "./upcItemDb.js";
import { naverShoppingProvider } from "./naverShopping.js";
import type { ProductLookupProvider, ProductLookupResult } from "./types.js";

export const LOOKUP_PROVIDER_REGISTRY: Record<string, ProductLookupProvider> = {
  openfoodfacts: openFoodFactsProvider,
  upcitemdb: upcItemDbProvider,
  naver: naverShoppingProvider,
};

// 관리자가 설정(외부 연동)에서 하나도 고르지 않은 채로 둔(=처음 설치 등) 경우 기존과
// 동일하게 동작해야 하므로 이 순서가 기본값이다. 네이버는 키 발급이 필요한 옵트인이라
// 기본 목록엔 넣지 않는다 — 관리자가 설정에서 켜고 클라이언트 ID/Secret도 넣어야 동작한다.
export const DEFAULT_LOOKUP_PROVIDER_IDS = ["openfoodfacts", "upcitemdb"];

// Setting("LOOKUP_PROVIDERS")의 원본 문자열 → 활성화된 provider id 목록.
// 설정 라우트(GET /api/settings)도 같은 파싱 규칙으로 "현재 적용 값"을 보여줘야 하므로
// 로직을 여기 하나로 모아 공유한다.
export function parseEnabledProviderIds(raw: string | undefined): string[] {
  if (raw === "none") return []; // 관리자가 전부 해제하고 저장한 경우 — 폴백 없이 진짜로 0개.
  if (!raw) return DEFAULT_LOOKUP_PROVIDER_IDS;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function getEnabledProviders(): Promise<ProductLookupProvider[]> {
  const raw = await getSetting("LOOKUP_PROVIDERS");
  return parseEnabledProviderIds(raw)
    .map((id) => LOOKUP_PROVIDER_REGISTRY[id])
    .filter((p): p is ProductLookupProvider => Boolean(p));
}

export async function resolveProduct(barcodeValue: string): Promise<ProductLookupResult> {
  const providers = await getEnabledProviders();
  // 외부 조회를 전부 꺼둔 상태(LOOKUP_PROVIDERS=none)라면 예전에 캐싱된 결과도 쓰지 않고
  // 아예 조회 자체를 안 한 것으로 취급한다 — "외부 참조 안 씀"을 절반만 지키는 걸 막는다.
  if (providers.length === 0) return { found: false, provider: "none" };

  const cached = await prisma.productLookupCache.findUnique({ where: { barcodeValue } });
  if (cached) {
    return {
      found: Boolean(cached.name),
      name: cached.name ?? undefined,
      brand: cached.brand ?? undefined,
      imageUrl: cached.imageUrl ?? undefined,
      provider: cached.provider ?? "cache",
    };
  }

  for (const provider of providers) {
    try {
      const result = await provider.lookup(barcodeValue);
      if (result?.found) {
        await prisma.productLookupCache.upsert({
          where: { barcodeValue },
          create: {
            barcodeValue,
            name: result.name,
            brand: result.brand,
            imageUrl: result.imageUrl,
            provider: result.provider,
            rawPayload: result.raw as any,
          },
          update: {
            name: result.name,
            brand: result.brand,
            imageUrl: result.imageUrl,
            provider: result.provider,
            rawPayload: result.raw as any,
          },
        });
        return result;
      }
    } catch {
      // 한 provider가 실패해도 다음 provider로 계속 진행한다.
    }
  }

  return { found: false, provider: "none" };
}
