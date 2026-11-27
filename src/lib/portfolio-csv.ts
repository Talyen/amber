export interface ParsedPortfolioCsvResult {
  mode: "weight" | "dollars";
  holdings: Array<{ ticker: string; value: number }>;
  skippedTickers: string[];
  negativeTickers: string[];
  missingAllocationTickers: string[];
  totalRows: number;
}

function parseRows(text: string, delimiter: string, limit = Infinity): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && ch === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (!inQuotes && (ch === "\n" || ch === "\r")) {
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      if (rows.length === limit) return rows;
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (inQuotes) throw new Error("CSV has an unclosed quoted field.");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseNumericCell(
  raw: string | undefined,
  unit: "weight" | "dollars" | "shares"
): number | null {
  if (!raw || (unit !== "weight" && raw.includes("%")) || (unit !== "dollars" && raw.includes("$"))) {
    return null;
  }
  const cleaned = raw
    .trim()
    .replace(/^\((.*)\)$/, "-$1")
    .replace(/[$,%\s]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function normalizeHeader(cell: string): string {
  return cell.toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();
}

function findColumnIndex(headers: string[], patterns: RegExp[]): number {
  for (const pattern of patterns) {
    const idx = headers.findIndex((h) => pattern.test(h));
    if (idx >= 0) return idx;
  }
  return -1;
}

const SYMBOL_PATTERNS = [
  /^(symbol|ticker|stock|security symbol|instrument)$/,
  /\b(symbol|ticker)\b/,
];

const VALUE_PATTERNS = [
  /^(current value|market value|position value|total value|equity|value|amount)$/,
  /\b(current value|market value|position value|total value)\b/,
  /^(?!.*\b(?:cost|basis|book|purchase|original|prior|previous|gain|loss|change)\b).*\bvalue\b/,
];

const WEIGHT_PATTERNS = [
  /^(weight|allocation|% of account|percent of account|portfolio weight|weight %|allocation %)$/,
  /\b(weight|allocation|% of account|percent of account)\b/,
];

const SHARES_PATTERNS = [
  /^(quantity|shares|qty|position|units)$/,
  /\b(quantity|shares|qty)\b/,
];

function detectDelimiter(text: string) {
  const delimiters = [",", "\t"];
  const samples = delimiters.map((delimiter) => parseRows(text, delimiter, 12));
  const hasHeader = (rows: string[][]) => rows.some((row) =>
    row.length > 1 && findColumnIndex(row.map(normalizeHeader), SYMBOL_PATTERNS) >= 0
  );
  const [csvHeader, tsvHeader] = samples.map(hasHeader);
  if (csvHeader !== tsvHeader) return tsvHeader ? "\t" : ",";

  const [commas, tabs] = samples.map((rows) => rows.reduce((total, row) => total + row.length - 1, 0));
  return tabs > commas ? "\t" : ",";
}

/** Parses brokerage CSV/TSV positions and combines tax lots in the same unit. */
export function parseBrokerageCsv(
  rawText: string,
  knownTickers: ReadonlySet<string>,
  priceByTicker?: ReadonlyMap<string, number>
): ParsedPortfolioCsvResult {
  const text = rawText.replace(/^\uFEFF/, "");
  const rows = parseRows(text, detectDelimiter(text));
  let headerRow = -1;
  let symbolCol = 0;
  let valueCol = -1;
  let weightCol = -1;
  let sharesCol = -1;

  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const cells = rows[i].map(normalizeHeader);
    const symbol = findColumnIndex(cells, SYMBOL_PATTERNS);
    if (symbol < 0) continue;

    headerRow = i;
    symbolCol = symbol;
    valueCol = findColumnIndex(cells, VALUE_PATTERNS);
    weightCol = findColumnIndex(cells, WEIGHT_PATTERNS);
    sharesCol = findColumnIndex(cells, SHARES_PATTERNS);
    break;
  }

  // Headerless two-column files use dollars unless the first allocation has a percent sign.
  if (headerRow === -1 && (rows[0]?.length ?? 0) >= 2) {
    if (rows[0][1].includes("%")) weightCol = 1;
    else valueCol = 1;
  }

  const mode = valueCol >= 0 || (weightCol < 0 && sharesCol >= 0) ? "dollars" : "weight";
  const totals = new Map<string, number>();
  const skippedTickers = new Set<string>();
  const negativeTickers = new Set<string>();
  const missingAllocationTickers = new Set<string>();
  let totalRows = 0;

  for (let i = headerRow + 1; i < rows.length; i++) {
    const cells = rows[i];
    const ticker = (cells[symbolCol] ?? "").toUpperCase().replace(/^\$/, "").replace(/\*{1,2}$/, "");
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) continue;
    if (["TOTAL", "CASH", "SPAXX", "FDRXX", "VMFXX"].includes(ticker)) continue;

    totalRows++;
    if (!knownTickers.has(ticker)) {
      skippedTickers.add(ticker);
      continue;
    }

    let amount: number | null;
    if (mode === "dollars") {
      amount = parseNumericCell(cells[valueCol], "dollars");
      if (amount === null) {
        const shares = parseNumericCell(cells[sharesCol], "shares");
        const price = priceByTicker?.get(ticker);
        if (shares !== null && shares <= 0) amount = shares;
        else if (shares !== null && price != null && Number.isFinite(price) && price > 0) amount = shares * price;
      }
    } else {
      amount = weightCol < 0 ? 10 : parseNumericCell(cells[weightCol], "weight");
    }

    if (amount !== null && amount < 0) {
      negativeTickers.add(ticker);
    } else if (amount === null || !Number.isFinite(amount)) {
      missingAllocationTickers.add(ticker);
    } else {
      totals.set(ticker, (totals.get(ticker) ?? 0) + amount);
    }
  }

  return {
    mode,
    holdings: Array.from(totals, ([ticker, total]) => ({ ticker, value: Number(total.toFixed(2)) })),
    skippedTickers: [...skippedTickers],
    negativeTickers: [...negativeTickers],
    missingAllocationTickers: [...missingAllocationTickers],
    totalRows,
  };
}
