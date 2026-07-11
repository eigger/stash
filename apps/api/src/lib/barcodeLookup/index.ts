import { prisma } from "../prisma.js";
import { openFoodFactsProvider } from "./openFoodFacts.js";
import { upcItemDbProvider } from "./upcItemDb.js";
import type { ProductLookupResult } from "./types.js";

// Open Food Facts를 먼저 시도(식료품 커버리지가 좋음)하고, 못 찾으면 UPCItemDB로 폴백한다.
const providers = [openFoodFactsProvider, upcItemDbProvider];

export async function resolveProduct(barcodeValue: string): Promise<ProductLookupResult> {
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
