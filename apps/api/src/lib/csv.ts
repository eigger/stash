function escapeCsvField(value: string): string {
  // Excel/Sheets가 =+-@ 및 탭/CR로 시작하는 값을 수식으로 실행하지 못하도록 선행 '를 붙인다.
  // 단순 따옴표 감싸기만으로는 Excel이 여전히 수식으로 해석한다.
  let safe = value;
  if (/^[=+\-@\t\r]/.test(safe)) {
    safe = `'${safe}`;
  }
  if (/[",\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function encodeCsvRow(fields: (string | number | null | undefined)[]): string {
  // 숫자 컬럼(quantity/price 등)은 음수(-5)가 수식 방어에 걸리면 안 되므로,
  // 문자열로 변환하기 전에 number는 그대로 String()만 하고 escapeCsvField의 수식 검사를 우회한다.
  return (
    fields
      .map((f) => {
        if (f == null) return escapeCsvField("");
        if (typeof f === "number") return String(f);
        return escapeCsvField(f);
      })
      .join(",") + "\r\n"
  );
}

// export 시 붙인 선행 ' 하나를 import에서 벗겨 라운드트립이 깨지지 않게 한다.
// 원래 이름에 '가 있던 경우(의도적)와 구분할 수 없지만, formula injection 방어 부작용이라 허용한다.
export function stripCsvFormulaGuard(value: string): string {
  if (value.length >= 2 && value.startsWith("'") && /^[=+\-@\t\r]/.test(value.slice(1))) {
    return value.slice(1);
  }
  return value;
}

// 최소한의 RFC4180 파서 — 따옴표로 감싼 필드 안의 쉼표/줄바꿈/이스케이프된 따옴표까지 처리한다.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}
