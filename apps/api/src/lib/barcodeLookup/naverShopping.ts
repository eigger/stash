import { getSetting } from "../settings.js";
import type { ProductLookupProvider, ProductLookupResult } from "./types.js";

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}

// Open Food Facts/UPCItemDB는 둘 다 국내 유통 제품 커버리지가 약하다(전자는 식료품+해외
// 위주, 후자는 미국 UPC 위주). 네이버 쇼핑은 전용 바코드 DB가 아니라 검색 API라 완벽한
// 매칭은 아니지만, 바코드 숫자를 그대로 검색어로 던지면 국내 제품은 실제로 꽤 잘 걸린다.
// 클라이언트 ID/Secret이 없으면(관리자가 발급 안 함) 조용히 스킵되어 다음 provider로 넘어간다.
export const naverShoppingProvider: ProductLookupProvider = {
  name: "naver",
  async lookup(barcodeValue: string): Promise<ProductLookupResult | null> {
    const clientId = await getSetting("NAVER_CLIENT_ID", process.env.NAVER_CLIENT_ID);
    const clientSecret = await getSetting("NAVER_CLIENT_SECRET", process.env.NAVER_CLIENT_SECRET);
    if (!clientId || !clientSecret) return null;

    const res = await fetch(
      `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(barcodeValue)}&display=1`,
      { headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const item = data.items?.[0];
    if (!item) return { found: false, provider: "naver" };

    return {
      found: true,
      name: item.title ? stripHtml(item.title) : undefined,
      brand: item.brand || item.maker || undefined,
      imageUrl: item.image || undefined,
      provider: "naver",
      raw: item,
    };
  },
};
