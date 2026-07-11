"use client";

import { useLocale } from "../lib/i18n/locale-context";
import type { Locale } from "../lib/i18n/translations";

const OPTIONS: { value: Locale; label: string }[] = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
];

export function LanguageToggle() {
  const { locale, setLocale } = useLocale();

  return (
    <div style={{ display: "flex", gap: 8 }}>
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className={locale === opt.value ? "" : "secondary"}
          onClick={() => setLocale(opt.value)}
          style={{ flex: 1 }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
