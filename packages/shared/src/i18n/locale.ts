export const locales = ["ko", "en"] as const;
export type Locale = (typeof locales)[number];

export function parseLocale(value: string | null | undefined): Locale {
  return value === "en" ? "en" : "ko";
}
