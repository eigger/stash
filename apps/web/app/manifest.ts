import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Stash - 가정용 재고관리",
    short_name: "Stash",
    description: "바코드로 관리하는 셀프호스트 가정용 재고/제품 관리",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1d5fa8",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // 홈 화면 아이콘을 길게 눌러 자주 쓰는 동작으로 바로 진입한다.
    shortcuts: [
      {
        name: "스캔하기",
        short_name: "스캔",
        description: "바코드/QR을 스캔해 입고·소비를 바로 기록",
        url: "/scan",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "직접 등록",
        short_name: "등록",
        description: "새 아이템을 직접 입력해 등록",
        url: "/items/new",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
