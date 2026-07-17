import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import type { BarcodeSymbology } from "./types";

// 이 앱이 실제로 다루는 값만으로 제한한다 — EAN/UPC(상품 바코드), CODE_128(서버의
// guessSymbology가 기대하는 포맷), QR_CODE(자체 발급 QR·Matter 커미셔닝 QR). 기본값은
// PDF417/Aztec/DataMatrix 등 쓰지도 않는 포맷까지 매 프레임 전부 시도하므로, 여기서
// 줄이면 프레임당 처리 시간이 짧아져 체감 속도가 빨라지고 무관한 포맷의 오탐도 준다.
export const SCAN_HINTS = new Map<DecodeHintType, unknown>([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE],
  ],
]);

// 해상도를 충분히 높게 요청하고 연속 오토포커스를 명시적으로 요청해 근거리의 작은
// 바코드도 잘 잡히게 한다. focusMode를 지원하지 않는 기기/브라우저는 이 필드를
// 그냥 무시하므로 안전하다.
export const SCAN_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: "environment",
  width: { ideal: 1280 },
  height: { ideal: 720 },
  advanced: [{ focusMode: "continuous" }] as unknown as MediaTrackConstraintSet[],
};

// 스캔 결과는 실제 포맷을 이미 알고 있으니, 서버의 guessSymbology(자릿수 추측)보다 이걸
// 그대로 매핑하는 게 더 정확하다 — 수동 타이핑(포맷 정보 없음)일 때만 서버 추측에 맡긴다.
// EAN_8/UPC_E는 별도 심볼로지가 없어(label 렌더링도 결국 code128로 폴백) OTHER로 둔다.
export function symbologyFromScanFormat(format: BarcodeFormat): BarcodeSymbology {
  switch (format) {
    case BarcodeFormat.EAN_13:
      return "EAN13";
    case BarcodeFormat.UPC_A:
      return "UPCA";
    case BarcodeFormat.CODE_128:
      return "CODE128";
    case BarcodeFormat.QR_CODE:
      return "QR";
    default:
      return "OTHER";
  }
}
