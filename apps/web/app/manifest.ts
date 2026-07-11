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
  };
}
