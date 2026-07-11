import type { BarcodeSymbology } from "@prisma/client";

// 스캔/수동 입력으로 들어온 바코드 문자열의 자릿수만으로 심볼로지를 추정한다.
// 실제 체크섬 검증은 하지 않는다 — 라벨 렌더링(bwip-js bcid 선택)용 힌트면 충분하다.
export function guessSymbology(value: string): BarcodeSymbology {
  if (/^\d{13}$/.test(value)) return "EAN13";
  if (/^\d{12}$/.test(value)) return "UPCA";
  if (/^\d{6,}$/.test(value)) return "CODE128";
  return "OTHER";
}
