"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../lib/i18n/locale-context";

// 오프라인일 때 화면은 캐시된 셸로 뜨지만 데이터 갱신은 안 되므로, 왜 그런지 알려주는
// 배너를 상단에 고정으로 띄운다.
export function OfflineBanner() {
  const { t } = useLocale();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 60,
        background: "var(--color-warning-bg)",
        color: "var(--color-warning-text)",
        textAlign: "center",
        padding: "6px 12px",
        fontSize: "0.85rem",
      }}
    >
      {t("offlineBannerText")}
    </div>
  );
}
