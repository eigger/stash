import { describe, expect, it } from "vitest";
import { BarcodeFormat } from "@zxing/library";
import { isQrScanFormat, symbologyFromScanFormat } from "./barcodeScanner";

// 하드코딩한 FORMAT_* 숫자가 @zxing/library enum과 어긋나면
// EAN13이 OTHER로 저장되는 등 조용한 데이터 오염이 난다 — Dependabot 업그레이드 시 여기서 터지게 한다.
describe("barcodeScanner format constants vs @zxing/library", () => {
  it("maps BarcodeFormat enum values to the expected symbology", () => {
    expect(symbologyFromScanFormat(BarcodeFormat.EAN_13)).toBe("EAN13");
    expect(symbologyFromScanFormat(BarcodeFormat.UPC_A)).toBe("UPCA");
    expect(symbologyFromScanFormat(BarcodeFormat.CODE_128)).toBe("CODE128");
    expect(symbologyFromScanFormat(BarcodeFormat.QR_CODE)).toBe("QR");
    expect(symbologyFromScanFormat(BarcodeFormat.EAN_8)).toBe("OTHER");
    expect(symbologyFromScanFormat(BarcodeFormat.UPC_E)).toBe("OTHER");
  });

  it("detects QR via the library enum value", () => {
    expect(isQrScanFormat(BarcodeFormat.QR_CODE)).toBe(true);
    expect(isQrScanFormat(BarcodeFormat.EAN_13)).toBe(false);
  });
});
