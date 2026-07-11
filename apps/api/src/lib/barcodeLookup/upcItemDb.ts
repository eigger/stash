import { getSetting } from "../settings.js";
import type { ProductLookupProvider, ProductLookupResult } from "./types.js";

// 식료품 외 일반 소매 제품 커버리지가 넓다. 무료 티어는 키 없이도 동작하지만
// 요청량이 많아지면 관리자가 Setting에서 API 키를 등록해 쓸 수 있게 열어둔다.
export const upcItemDbProvider: ProductLookupProvider = {
  name: "upcitemdb",
  async lookup(barcodeValue: string): Promise<ProductLookupResult | null> {
    const apiKey = await getSetting("UPCITEMDB_API_KEY", process.env.UPCITEMDB_API_KEY);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey) headers["user_key"] = apiKey;

    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcodeValue)}`,
      { headers },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const item = data.items?.[0];
    if (!item) return { found: false, provider: "upcitemdb" };

    return {
      found: true,
      name: item.title || undefined,
      brand: item.brand || undefined,
      imageUrl: item.images?.[0] || undefined,
      provider: "upcitemdb",
      raw: item,
    };
  },
};
