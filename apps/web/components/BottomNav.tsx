"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "../lib/i18n/locale-context";
import type { TranslationKey } from "../lib/i18n/translations";

const TABS: { href: string; labelKey: TranslationKey; icon: string; primary?: boolean }[] = [
  { href: "/", labelKey: "navHome", icon: "🏠" },
  { href: "/items", labelKey: "navItems", icon: "📦" },
  { href: "/scan", labelKey: "navScan", icon: "📷", primary: true },
  { href: "/locations", labelKey: "navLocations", icon: "🗂️" },
  { href: "/backup", labelKey: "navMore", icon: "⋯" },
];

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useLocale();
  if (pathname === "/login" || pathname.startsWith("/i/")) return null;

  return (
    <nav className="bottom-nav">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        const label = t(tab.labelKey);
        if (tab.primary) {
          return (
            <Link key={tab.href} href={tab.href} className={`scan-tab ${active ? "active" : ""}`}>
              <span className="icon-wrap">
                <span className="icon">{tab.icon}</span>
              </span>
              {label}
            </Link>
          );
        }
        return (
          <Link key={tab.href} href={tab.href} className={active ? "active" : ""}>
            <span className="icon">{tab.icon}</span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
