"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../lib/i18n/locale-context";
import { loadDefaultCurrency, saveDefaultCurrency } from "../lib/currency";

const OPTIONS = [
  { value: "KRW", labelKey: "currencyKrwOption" as const },
  { value: "USD", labelKey: "currencyUsdOption" as const },
];

export function CurrencyToggle() {
  const { t } = useLocale();
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(loadDefaultCurrency());
  }, []);

  function handleSelect(next: string) {
    setValue(next);
    saveDefaultCurrency(next);
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={value === opt.value ? "" : "secondary"}
          onClick={() => handleSelect(opt.value)}
          style={{ flex: 1 }}
        >
          {t(opt.labelKey)}
        </button>
      ))}
    </div>
  );
}
