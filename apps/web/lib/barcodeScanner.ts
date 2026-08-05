import type { BarcodeSymbology } from "./types";

// @zxing/library 값 import를 이 모듈 최상단에서 하지 않는다.
// items/[id]·items/new가 힌트 Map을 정적 import하면 디코더 본체가 초기 그래프에 묶인다.
// 숫자 상수는 @zxing/library BarcodeFormat enum 값과 동일하다.

const FORMAT_EAN_13 = 7;
const FORMAT_UPC_A = 14;
const FORMAT_CODE_128 = 4;
const FORMAT_QR_CODE = 11;

// 해상도를 충분히 높게 요청하고 연속 오토포커스를 명시적으로 요청해 근거리의 작은
// 바코드도 잘 잡히게 한다. focusMode를 지원하지 않는 기기/브라우저는 이 필드를
// 그냥 무시하므로 안전하다.
export const SCAN_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: "environment",
  width: { ideal: 1280 },
  height: { ideal: 720 },
  advanced: [{ focusMode: "continuous" }] as unknown as MediaTrackConstraintSet[],
};

/**
 * 스캐너 힌트 Map. @zxing/library를 동적 import한 뒤에만 호출한다.
 * /scan은 페이지에서 zxing을 정적 import하므로 createScanHints()를 바로 await 하면 된다.
 */
export async function createScanHints(): Promise<Map<number, unknown>> {
  const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
  return new Map<number, unknown>([
    [
      DecodeHintType.POSSIBLE_FORMATS,
      [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.QR_CODE,
      ],
    ],
  ]);
}

// 스캔 결과는 실제 포맷을 이미 알고 있으니, 서버의 guessSymbology(자릿수 추측)보다 이걸
// 그대로 매핑하는 게 더 정확하다 — 수동 타이핑(포맷 정보 없음)일 때만 서버 추측에 맡긴다.
// EAN_8/UPC_E는 별도 심볼로지가 없어(label 렌더링도 결국 code128로 폴백) OTHER로 둔다.
// 인자는 BarcodeFormat 숫자 — @zxing 값 import 없이 상세/등록 페이지에서 쓸 수 있게 한다.
export function symbologyFromScanFormat(format: number): BarcodeSymbology {
  switch (format) {
    case FORMAT_EAN_13:
      return "EAN13";
    case FORMAT_UPC_A:
      return "UPCA";
    case FORMAT_CODE_128:
      return "CODE128";
    case FORMAT_QR_CODE:
      return "QR";
    default:
      return "OTHER";
  }
}

export function isQrScanFormat(format: number): boolean {
  return format === FORMAT_QR_CODE;
}
