"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SVGProps } from "react";
import { useLocale } from "../lib/i18n/locale-context";
import type { TranslationKey } from "../lib/i18n/translations";

function iconProps(): SVGProps<SVGSVGElement> {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
}

function HomeIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10" />
      <path d="M10 20.5V15h4v5.5" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z" />
      <path d="M3.5 7.5 12 12l8.5-4.5" />
      <path d="M12 12v9" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M4 8h3l1.5-2h6L16 8h4a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

const TABS: { href: string; labelKey: TranslationKey; Icon: () => JSX.Element; primary?: boolean }[] = [
  { href: "/", labelKey: "navHome", Icon: HomeIcon },
  { href: "/items", labelKey: "navItems", Icon: BoxIcon },
  { href: "/scan", labelKey: "navScan", Icon: CameraIcon, primary: true },
  { href: "/history", labelKey: "navHistory", Icon: ClockIcon },
  { href: "/backup", labelKey: "navMore", Icon: MoreIcon },
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
                <span className="icon">
                  <tab.Icon />
                </span>
              </span>
              {label}
            </Link>
          );
        }
        return (
          <Link key={tab.href} href={tab.href} className={active ? "active" : ""}>
            <span className="icon">
              <tab.Icon />
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
