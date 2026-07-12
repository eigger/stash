import QRCode from "qrcode";
import bwipjs from "bwip-js";
import type { BarcodeSymbology } from "@prisma/client";

// 아이템 상세페이지 딥링크 — 이 URL을 QR로 인코딩해두면 어떤 카메라 앱으로 스캔해도
// 바로 아이템 화면이 열린다 (스캐너 앱 없이도 동작하는 게 핵심).
// baseUrl은 호출부(routes/barcodes.ts)가 Setting("APP_PUBLIC_URL") → env 순으로 미리
// 구해서 넘긴다 — 이 함수 자체는 DB 없이도 테스트 가능한 순수 함수로 남겨둔다.
export function buildItemDeepLink(itemId: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/i/${itemId}`;
}

// 바코드 값 + 심볼로지에 맞는 라벨 이미지를 PNG로 생성한다.
// QR(자체 발급/Matter)은 qrcode로, 그 외 1차원 바코드(EAN/UPC/CODE128)는 bwip-js로 렌더링한다.
export async function renderLabelPng(value: string, symbology: BarcodeSymbology): Promise<Buffer> {
  if (symbology === "QR" || symbology === "DATA_MATRIX") {
    return QRCode.toBuffer(value, { type: "png", width: 400, margin: 2 });
  }

  const bcid =
    symbology === "EAN13" ? "ean13" : symbology === "UPCA" ? "upca" : "code128";

  return new Promise((resolve, reject) => {
    bwipjs.toBuffer(
      { bcid, text: value, scale: 3, height: 12, includetext: true, textxalign: "center" },
      (err, png) => (err ? reject(err) : resolve(png)),
    );
  });
}
