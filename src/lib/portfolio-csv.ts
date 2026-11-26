export interface ParsedPortfolioCsvResult {
  mode: "weight" | "dollars";
  holdings: Array<{ ticker: string; value: number }>;
  skippedTickers: string[];
  totalRows: number;
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseNumericCell(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .replace(/^\((.*)\)$/, "-$1")
    .replace(/[$,%\s,]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function normalizeHeader(cell: string): string {
  return cell
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
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
  /\bvalue\b/,
];

const WEIGHT_PATTERNS = [
  /^(weight|allocation|% of account|percent of account|portfolio weight|weight %|allocation %)$/,
  /\b(weight|allocation|% of account|percent of account)\b/,
];

const SHARES_PATTERNS = [
  /^(quantity|shares|qty|position|units)$/,
  /\b(quantity|shares|qty)\b/,
];

/**
 * Parses brokerage position exports (Fidelity, Schwab, Vanguard, IBKR, Robinhood, or custom CSV/TSV)
 * into Amber portfolio holdings. Aggregates duplicate tax lots for the same ticker and skips
 * cash/ETFs/tickers outside Amber's covered universe.
 */
export function parseBrokerageCsv(
  rawText: string,
  knownTickers: ReadonlySet<string>,
  priceByTicker?: ReadonlyMap<string, number>
): ParsedPortfolioCsvResult {
  const text = rawText.replace(/^\uFEFF/, "").trim();
  if (!text) {
    return { mode: "weight", holdings: [], skippedTickers: [], totalRows: 0 };
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { mode: "weight", holdings: [], skippedTickers: [], totalRows: 0 };
  }

  // Detect delimiter from the first 10 lines
  const sample = lines.slice(0, 10).join("\n");
  const delimiter = (sample.match(/\t/g)?.length ?? 0) > (sample.match(/,/g)?.length ?? 0) ? "\t" : ",";

  // Scan first 10 rows to locate the header row (brokerage exports often include account summary preambles)
  let headerRowIdx = -1;
  let symbolCol = -1;
  let valueCol = -1;
  let weightCol = -1;
  let sharesCol = -1;

  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const cells = parseCsvLine(lines[i], delimiter).map(normalizeHeader);
    const sym = findColumnIndex(cells, SYMBOL_PATTERNS);
    if (sym >= 0) {
      headerRowIdx = i;
      symbolCol = sym;
      valueCol = findColumnIndex(cells, VALUE_PATTERNS);
      weightCol = findColumnIndex(cells, WEIGHT_PATTERNS);
      sharesCol = findColumnIndex(cells, SHARES_PATTERNS);
      break;
    }
  }

  // Fallback: headerless 2-column CSV like "NVDA, 25000" or "NVDA, 25%"
  let startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
  if (headerRowIdx < 0) {
    symbolCol = 0;
    const firstCells = parseCsvLine(lines[0], delimiter);
    if (firstCells.length >= 2) {
      const second = firstCells[1] ?? "";
      if (second.includes("$")) valueCol = 1;
      else if (second.includes("%")) weightCol = 1;
      else valueCol = 1;
    }
    startRow = 0;
  }

  const useDollars = valueCol >= 0 || (weightCol < 0 && sharesCol >= 0);
  const mode: "weight" | "dollars" = useDollars ? "dollars" : "weight";

  const totals = new Map<string, number>();
  const skipped = new Set<string>();
  let totalRows = 0;

  for (let i = startRow; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], delimiter);
    const rawSym = (cells[symbolCol] ?? "")
      .trim()
      .toUpperCase()
      .replace(/^\$/, "")
      .replace(/\*{1,2}$/, "");
    if (!rawSym || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(rawSym)) continue;
    // Ignore common brokerage summary/cash labels
    if (rawSym === "TOTAL" || rawSym === "CASH" || rawSym === "SPAXX" || rawSym === "FDRXX" || rawSym === "VMFXX") {
      continue;
    }

    totalRows++;
    if (!knownTickers.has(rawSym)) {
      skipped.add(rawSym);
      continue;
    }

    let amount: number | null = null;
    if (valueCol >= 0) {
      amount = parseNumericCell(cells[valueCol]);
    }
    if ((amount === null || amount <= 0) && weightCol >= 0 && mode === "weight") {
      amount = parseNumericCell(cells[weightCol]);
    }
    if ((amount === null || amount <= 0) && sharesCol >= 0) {
      const shares = parseNumericCell(cells[sharesCol]);
      const px = priceByTicker?.get(rawSym);
      if (shares !== null && shares > 0 && typeof px === "number" && px > 0) {
        amount = shares * px;
      }
    }
    if (amount === null || amount <= 0) {
      amount = mode === "dollars" ? 0 : 10;
    }

    if (amount > 0) {
      totals.set(rawSym, Number(((totals.get(rawSym) ?? 0) + amount).toFixed(2)));
    }
  }

  // If dollar mode produced zero positive values (e.g. only symbols were present), fall back to equal weights
  const holdings = [...totals.entries()].map(([ticker, value]) => ({ ticker, value }));
  if (holdings.length === 0 && totalRows > 0) {
    return {
      mode: "weight",
      holdings: [],
      skippedTickers: [...skipped],
      totalRows,
    };
  }

  return {
    mode,
    holdings,
    skippedTickers: [...skipped],
    totalRows,
  };
}
