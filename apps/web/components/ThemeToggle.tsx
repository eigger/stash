"use client";

import { useTheme, type Theme } from "../lib/theme-context";
import { useLocale } from "../lib/i18n/locale-context";
import type { TranslationKey } from "../lib/i18n/translations";

const OPTIONS: { value: Theme; labelKey: TranslationKey }[] = [
  { value: "light", labelKey: "themeLight" },
  { value: "dark", labelKey: "themeDark" },
  { value: "system", labelKey: "themeSystem" },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useLocale();

  return (
    <div style={{ display: "flex", gap: 8 }}>
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className={theme === opt.value ? "" : "secondary"}
          onClick={() => setTheme(opt.value)}
          style={{ flex: 1 }}
        >
          {t(opt.labelKey)}
        </button>
      ))}
    </div>
  );
}
