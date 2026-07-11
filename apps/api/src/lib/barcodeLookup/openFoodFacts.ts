import type { ProductLookupProvider, ProductLookupResult } from "./types.js";

// 키 없이 쓸 수 있는 오픈 데이터베이스 — 식료품 위주로 커버리지가 좋다.
export const openFoodFactsProvider: ProductLookupProvider = {
  name: "openfoodfacts",
  async lookup(barcodeValue: string): Promise<ProductLookupResult | null> {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcodeValue}.json`, {
      headers: { "User-Agent": "stash-app" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    if (data.status !== 1 || !data.product) return { found: false, provider: "openfoodfacts" };

    const product = data.product;
    return {
      found: true,
      name: product.product_name || product.product_name_ko || undefined,
      brand: product.brands || undefined,
      imageUrl: product.image_front_url || product.image_url || undefined,
      provider: "openfoodfacts",
      raw: product,
    };
  },
};
