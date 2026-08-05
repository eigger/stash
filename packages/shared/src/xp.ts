/**
 * Phase 3-C 품질/확정 XP — 게임 요소를 걷어내도 "필드가 얼마나 채워졌나 /
 * 현장에서 맞았나"가 남는다. 상점·레벨·칭호는 넣지 않는다 (§2.3).
 *
 * 1층(품질): 입력 순간. 쓸모 있는 필드만 가중. 타입에 없는 필드(자산+유통기한 등)는
 * 분모·감점에 넣지 않는다.
 * 2층(확정): 재점검에서 사실로 확인될 때. 1층만 있으면 가짜 값으로 점수를 채운다.
 */

export type XpItemType = "CONSUMABLE" | "ASSET";

export type XpBarcodeSource = "GENERATED" | "EXISTING" | "MATTER" | "SERIAL";

export type XpBreakdownEntry = {
  /** i18n 키 접미사 (xpReason.*) */
  reason: string;
  points: number;
};

export type XpAward = {
  total: number;
  breakdown: XpBreakdownEntry[];
};

/** 높음: 나중에 검색·스캔·알림에 직접 쓰이는 것. 중간: 있으면 좋지만 대리 지표에 가깝다. */
export const QUALITY_XP = {
  location: 15,
  category: 15,
  /** 제조사/자체/Matter 바코드 — 스캔 동선의 핵심 */
  barcode: 20,
  photo: 8,
  price: 8,
  minQuantity: 8,
  expiryDate: 15,
  warrantyExpiresAt: 15,
  /** ASSET 시리얼(SERIAL 소스) */
  serial: 15,
} as const;

export const CONFIRM_XP = {
  /** 기록된 위치(세션 범위)에서 발견 */
  locationMatch: 30,
  /** 기록 수량과 현장 수량이 일치 */
  quantityMatch: 20,
} as const;

export type QualityXpItem = {
  itemType: XpItemType;
  locationId?: string | null;
  categoryId?: string | null;
  photoUrl?: string | null;
  price?: number | null;
  minQuantity?: number | null;
  expiryDate?: Date | string | null;
  warrantyExpiresAt?: Date | string | null;
  barcodes?: { source: XpBarcodeSource }[];
};

function filled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function hasScanBarcode(barcodes: { source: XpBarcodeSource }[] | undefined): boolean {
  return (barcodes ?? []).some((b) => b.source === "GENERATED" || b.source === "EXISTING" || b.source === "MATTER");
}

function hasSerial(barcodes: { source: XpBarcodeSource }[] | undefined): boolean {
  return (barcodes ?? []).some((b) => b.source === "SERIAL");
}

type FieldSpec = {
  reason: string;
  points: number;
  present: (item: QualityXpItem) => boolean;
};

function qualityFieldSpecs(itemType: XpItemType): FieldSpec[] {
  const common: FieldSpec[] = [
    { reason: "location", points: QUALITY_XP.location, present: (i) => filled(i.locationId) },
    { reason: "category", points: QUALITY_XP.category, present: (i) => filled(i.categoryId) },
    { reason: "barcode", points: QUALITY_XP.barcode, present: (i) => hasScanBarcode(i.barcodes) },
    { reason: "photo", points: QUALITY_XP.photo, present: (i) => filled(i.photoUrl) },
    { reason: "price", points: QUALITY_XP.price, present: (i) => i.price != null && !Number.isNaN(i.price) },
  ];
  if (itemType === "CONSUMABLE") {
    return [
      ...common,
      { reason: "minQuantity", points: QUALITY_XP.minQuantity, present: (i) => i.minQuantity != null },
      { reason: "expiryDate", points: QUALITY_XP.expiryDate, present: (i) => filled(i.expiryDate) },
    ];
  }
  return [
    ...common,
    {
      reason: "warrantyExpiresAt",
      points: QUALITY_XP.warrantyExpiresAt,
      present: (i) => filled(i.warrantyExpiresAt),
    },
    { reason: "serial", points: QUALITY_XP.serial, present: (i) => hasSerial(i.barcodes) },
  ];
}

/**
 * 품질 XP. previous가 있으면 "비어 있음 → 채워짐" 델타만 지급해 같은 필드를 반복 수령하지 않는다.
 * 소급 대량 지급을 피하려면 호출부가 과거 아이템에 돌리지 말 것.
 */
export function computeQualityXp(item: QualityXpItem, previous?: QualityXpItem | null): XpAward {
  const specs = qualityFieldSpecs(item.itemType);
  const breakdown: XpBreakdownEntry[] = [];
  for (const spec of specs) {
    const nowFilled = spec.present(item);
    if (!nowFilled) continue;
    if (previous && spec.present(previous)) continue;
    breakdown.push({ reason: spec.reason, points: spec.points });
  }
  return { total: breakdown.reduce((s, e) => s + e.points, 0), breakdown };
}

/** 확정 XP — 재점검에서 PENDING → FOUND 로 올라갈 때만 호출할 것. */
export function computeConfirmXp(opts: {
  locationMatched: boolean;
  quantityMatched: boolean;
}): XpAward {
  const breakdown: XpBreakdownEntry[] = [];
  if (opts.locationMatched) {
    breakdown.push({ reason: "confirmLocation", points: CONFIRM_XP.locationMatch });
  }
  if (opts.quantityMatched) {
    breakdown.push({ reason: "confirmQuantity", points: CONFIRM_XP.quantityMatch });
  }
  return { total: breakdown.reduce((s, e) => s + e.points, 0), breakdown };
}
