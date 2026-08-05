import type { XpAward } from "./types";
import type { TranslationKey } from "./i18n/translations";

const REASON_KEYS: Record<string, TranslationKey> = {
  location: "xpReasonLocation",
  category: "xpReasonCategory",
  barcode: "xpReasonBarcode",
  photo: "xpReasonPhoto",
  price: "xpReasonPrice",
  minQuantity: "xpReasonMinQuantity",
  expiryDate: "xpReasonExpiry",
  warrantyExpiresAt: "xpReasonWarranty",
  serial: "xpReasonSerial",
  confirmLocation: "xpReasonConfirmLocation",
  confirmQuantity: "xpReasonConfirmQuantity",
};

export function formatXpToast(
  xp: XpAward | undefined | null,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string | null {
  if (!xp || xp.total <= 0) return null;
  const reasons = xp.breakdown.map((b) => {
    const key = REASON_KEYS[b.reason];
    return key ? t(key, { n: b.points }) : `+${b.points}`;
  });
  return t("xpGainedDetailToast", { n: xp.total, detail: reasons.join(", ") });
}
