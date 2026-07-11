import { fileURLToPath } from "node:url";
import path from "node:path";
import PDFDocument from "pdfkit";
import { renderLabelPng } from "./qrLabel.js";
import type { BarcodeSymbology } from "@prisma/client";

export interface LabelSheetEntry {
  name: string;
  value: string;
  symbology: BarcodeSymbology;
}

// A4 기준 3열 그리드로 라벨을 배치한다 (Avery 계열 라벨지에 대략 맞는 크기).
const PAGE_MARGIN = 24;
const COLS = 3;
const CELL_WIDTH = 170;
const CELL_HEIGHT = 110;
const CELL_GAP = 8;

// pdfkit 기본 폰트(Helvetica)는 한글을 지원하지 않아 아이템 이름이 깨져서 출력된다 —
// 전체 한글 음절을 포함한 서브셋 폰트를 함께 배포해 라벨 시트에서도 한글 이름이 정상 표시되게 한다.
// import.meta.url 기준 상대 경로라 dev(src 직접 실행)와 prod(dist 빌드) 양쪽에서 동일하게 동작한다.
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FONT_PATH = path.join(__dirname, "../../assets/fonts/NotoSansKR-Regular.ttf");

export async function renderLabelSheetPdf(entries: LabelSheetEntry[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN });
  doc.registerFont("NotoSansKR", FONT_PATH);
  doc.font("NotoSansKR");
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const rowsPerPage = Math.floor((doc.page.height - PAGE_MARGIN * 2) / (CELL_HEIGHT + CELL_GAP));

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const indexOnPage = i % (rowsPerPage * COLS);
    if (i > 0 && indexOnPage === 0) doc.addPage();

    const col = indexOnPage % COLS;
    const row = Math.floor(indexOnPage / COLS);
    const x = PAGE_MARGIN + col * (CELL_WIDTH + CELL_GAP);
    const y = PAGE_MARGIN + row * (CELL_HEIGHT + CELL_GAP);

    const png = await renderLabelPng(entry.value, entry.symbology);
    const imageSize = entry.symbology === "QR" || entry.symbology === "DATA_MATRIX" ? 80 : undefined;

    doc.rect(x, y, CELL_WIDTH, CELL_HEIGHT).stroke("#dddddd");
    if (imageSize) {
      doc.image(png, x + (CELL_WIDTH - imageSize) / 2, y + 6, { width: imageSize, height: imageSize });
      doc.fontSize(9).text(entry.name, x + 4, y + imageSize + 10, { width: CELL_WIDTH - 8, align: "center" });
    } else {
      doc.image(png, x + 8, y + 8, { width: CELL_WIDTH - 16 });
      doc.fontSize(9).text(entry.name, x + 4, y + CELL_HEIGHT - 20, { width: CELL_WIDTH - 8, align: "center" });
    }
  }

  doc.end();
  return done;
}
