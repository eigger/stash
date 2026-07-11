import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { RegisterServiceWorker } from "./register-sw";
import { AuthProvider } from "../lib/auth-context";
import { ToastProvider } from "../lib/toast-context";
import { ThemeProvider } from "../lib/theme-context";
import { LocaleProvider } from "../lib/i18n/locale-context";
import { BottomNav } from "../components/BottomNav";
import { OfflineBanner } from "../components/OfflineBanner";

// 첫 페인트 전에 저장된 테마를 적용해서, React가 붙기 전까지 잠깐 시스템 테마로
// 보였다가 사용자가 고른 테마로 바뀌는 깜빡임을 막는다.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("stash_theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export const metadata: Metadata = {
  title: "Stash",
  description: "바코드로 관리하는 가정용 재고관리",
  appleWebApp: {
    capable: true,
    title: "Stash",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1d5fa8" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <RegisterServiceWorker />
        <LocaleProvider>
          <ThemeProvider>
            <ToastProvider>
              <AuthProvider>
                <OfflineBanner />
                {children}
                <BottomNav />
              </AuthProvider>
            </ToastProvider>
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
