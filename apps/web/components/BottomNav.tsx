"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { SVGProps } from "react";
import { useAuth } from "../lib/auth-context";
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

function CartIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6" />
      <circle cx="9.5" cy="20" r="1.3" />
      <circle cx="17" cy="20" r="1.3" />
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

// 지도 위치가 아니라 냉장고/선반/상자 같은 보관 위치라 핀 아이콘 대신 선반(칸막이) 모양을 쓴다.
function LocationIcon({ size = 24 }: { size?: number }) {
  return (
    <svg {...iconProps()} width={size} height={size}>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M4 9h16M4 15h16" />
    </svg>
  );
}

function CategoryIcon({ size = 24 }: { size?: number }) {
  return (
    <svg {...iconProps()} width={size} height={size}>
      <path d="M3 3h7.5L21 13.5 13.5 21 3 10.5V3Z" />
      <circle cx="8" cy="8" r="1.3" />
    </svg>
  );
}

function HistoryIcon({ size = 24 }: { size?: number }) {
  return (
    <svg {...iconProps()} width={size} height={size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function LabelIcon({ size = 24 }: { size?: number }) {
  return (
    <svg {...iconProps()} width={size} height={size}>
      <path d="M6 9V4h12v5" />
      <rect x="4" y="9" width="16" height="7" rx="1.5" />
      <path d="M8 13h8v7H8v-7Z" />
    </svg>
  );
}

function TrashIcon({ size = 24 }: { size?: number }) {
  return (
    <svg {...iconProps()} width={size} height={size}>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function SettingsIcon({ size = 24 }: { size?: number }) {
  return (
    <svg {...iconProps()} width={size} height={size}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </svg>
  );
}

function UsersIcon({ size = 24 }: { size?: number }) {
  return (
    <svg {...iconProps()} width={size} height={size}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <circle cx="17" cy="9" r="2.3" />
      <path d="M15 13.2c2 .3 3.7 1.9 3.7 4.3" />
    </svg>
  );
}

function IntegrationIcon({ size = 24 }: { size?: number }) {
  return (
    <svg {...iconProps()} width={size} height={size}>
      <path d="M9 3v4M15 3v4" />
      <path d="M6 7h12v3a6 6 0 0 1-12 0V7Z" />
      <path d="M12 16v5" />
    </svg>
  );
}

const TABS: { href: string; labelKey: TranslationKey; Icon: () => JSX.Element; primary?: boolean }[] = [
  { href: "/", labelKey: "navHome", Icon: HomeIcon },
  { href: "/items", labelKey: "navItems", Icon: BoxIcon },
  { href: "/scan", labelKey: "navScan", Icon: CameraIcon, primary: true },
  { href: "/shopping", labelKey: "navShopping", Icon: CartIcon },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLocale();
  const { isAdmin } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [moreOpen]);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  if (pathname === "/login" || pathname.startsWith("/i/")) return null;

  function go(href: string) {
    setMoreOpen(false);
    router.push(href);
  }

  return (
    <>
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
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
          <button type="button" className={`bottom-nav-more ${moreOpen ? "active" : ""}`} onClick={() => setMoreOpen((v) => !v)}>
            <span className="icon">
              <MoreIcon />
            </span>
            {t("navMore")}
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="sheet-card" ref={sheetRef} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />

            <div className="sheet-group-label">{t("menuGroupStructure")}</div>
            <div className="sheet-grid">
              <button type="button" className="sheet-item" onClick={() => go("/locations")}>
                <LocationIcon size={20} /> {t("manageLocations")}
              </button>
              <button type="button" className="sheet-item" onClick={() => go("/categories")}>
                <CategoryIcon size={20} /> {t("manageCategories")}
              </button>
            </div>

            <div className="sheet-group-label">{t("menuGroupActions")}</div>
            <div className="sheet-grid">
              <button type="button" className="sheet-item" onClick={() => go("/history")}>
                <HistoryIcon size={20} /> {t("historyTitle")}
              </button>
              <button type="button" className="sheet-item" onClick={() => go("/labels")}>
                <LabelIcon size={20} /> {t("printLabels")}
              </button>
              <button type="button" className="sheet-item" onClick={() => go("/trash")}>
                <TrashIcon size={20} /> {t("trashTitle")}
              </button>
            </div>

            <div className="sheet-group-label">{t("menuGroupAccount")}</div>
            <div className="sheet-grid">
              <button type="button" className="sheet-item" onClick={() => go("/settings")}>
                <SettingsIcon size={20} /> {t("settingsLabel")}
              </button>
              {isAdmin && (
                <button type="button" className="sheet-item" onClick={() => go("/users")}>
                  <UsersIcon size={20} /> {t("familyAccounts")}
                </button>
              )}
              {isAdmin && (
                <button type="button" className="sheet-item" onClick={() => go("/settings/integrations")}>
                  <IntegrationIcon size={20} /> {t("integrationSettings")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
