const LOWERCASE_CONNECTORS = new Set([
  "of",
  "and",
  "the",
  "for",
  "in",
  "on",
  "at",
  "by",
  "to",
  "de",
  "du",
  "la",
  "el",
]);

const BRAND_CASING: Record<string, string> = {
  aes: "AES",
  amd: "AMD",
  ametek: "AMETEK",
  arm: "ARM",
  asml: "ASML",
  "at&t": "AT&T",
  ati: "ATI",
  astrazeneca: "AstraZeneca",
  autozone: "AutoZone",
  bill: "BILL",
  bjs: "BJ's",
  cbre: "CBRE",
  cdw: "CDW",
  csx: "CSX",
  cvs: "CVS",
  davita: "DaVita",
  ebay: "eBay",
  fedex: "FedEx",
  ge: "GE",
  gm: "GM",
  hp: "HP",
  ibm: "IBM",
  iqvia: "IQVIA",
  jpmorgan: "JPMorgan",
  kla: "KLA",
  l3harris: "L3Harris",
  mcdonald: "McDonald",
  "mcdonald's": "McDonald's",
  mckesson: "McKesson",
  mccormick: "McCormick",
  msci: "MSCI",
  nasdaq: "Nasdaq",
  nvidia: "NVIDIA",
  nvr: "NVR",
  nxp: "NXP",
  paypal: "PayPal",
  pnc: "PNC",
  ppg: "PPG",
  rtx: "RTX",
  sap: "SAP",
  sba: "SBA",
  steris: "STERIS",
  tjx: "TJX",
  tpg: "TPG",
  tsmc: "TSMC",
  ubs: "UBS",
  ups: "UPS",
  us: "US",
  usa: "USA",
  verisign: "VeriSign",
};

const SUFFIX_MAP: Record<string, string> = {
  inc: "Inc.",
  "inc.": "Inc.",
  corp: "Corp.",
  "corp.": "Corp.",
  co: "Co.",
  "co.": "Co.",
  ltd: "Ltd.",
  "ltd.": "Ltd.",
  llc: "LLC",
  "l.l.c.": "LLC",
  lp: "LP",
  "l.p.": "L.P.",
  plc: "PLC",
  "p.l.c.": "PLC",
  nv: "N.V.",
  "n.v.": "N.V.",
  sa: "S.A.",
  "s.a.": "S.A.",
  ag: "AG",
  se: "SE",
};

/**
 * Normalizes SEC EDGAR company names into clean editorial capitalization:
 * - Fixes possessive apostrophes ("Dick'S" -> "Dick's", "Lowe'S" -> "Lowe's")
 * - Normalizes ALL-CAPS legal suffixes ("INC" -> "Inc.", "CORP" -> "Corp.", "CO" -> "Co.", "LTD" -> "Ltd.")
 * - Lowercases mid-name connectors ("Bank OF America" -> "Bank of America")
 * - Preserves known acronyms & mixed-case brands ("AES", "eBay", "AstraZeneca", "L3Harris", "TPG")
 */
export function normalizeCompanyName(raw: string): string {
  if (!raw) return raw;
  let cleaned = raw
    .replace(/&amp;/gi, "&")
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

  // Fix "O Reilly" -> "O'Reilly"
  cleaned = cleaned.replace(/\bO\s+Reilly\b/gi, "O'Reilly");

  const tokens = cleaned.split(" ");
  const normalized = tokens.map((token, idx) => {
    const match = token.match(/^([^A-Za-z0-9']*)([A-Za-z0-9'&.-]+)([^A-Za-z0-9']*)$/);
    if (!match) return token;
    const [, prefix, core, suffix] = match;
    const lower = core.toLowerCase();
    const bare = lower.replace(/\.$/, "");

    // Legal suffixes (typically near the end of the company name)
    if (idx > 0 && SUFFIX_MAP[lower]) {
      return `${prefix}${SUFFIX_MAP[lower]}${suffix}`;
    }

    // Known mixed-case brands / acronyms
    if (BRAND_CASING[lower]) {
      return `${prefix}${BRAND_CASING[lower]}${suffix}`;
    }
    if (BRAND_CASING[bare] && core.endsWith(".")) {
      return `${prefix}${BRAND_CASING[bare]}.${suffix}`;
    }

    // Lowercase mid-name connectors ("Bank OF America" -> "Bank of America")
    if (idx > 0 && idx < tokens.length - 1 && LOWERCASE_CONNECTORS.has(lower)) {
      return `${prefix}${lower}${suffix}`;
    }

    // Fix possessive apostrophe ("Dick'S" -> "Dick's", "Lowe'S" -> "Lowe's")
    if (/^[A-Za-z]+'[Ss]$/.test(core)) {
      const [stem] = core.split("'");
      const stemLower = stem.toLowerCase();
      const casedStem =
        BRAND_CASING[stemLower] ??
        (stem.length <= 2 && stem === stem.toUpperCase()
          ? stem
          : stem[0].toUpperCase() + stem.slice(1).toLowerCase());
      return `${prefix}${casedStem}'s${suffix}`;
    }

    // Fix "O'Reilly" / "O'..."
    if (/^[Oo]'[A-Za-z]+$/.test(core)) {
      const rest = core.slice(2);
      return `${prefix}O'${rest[0].toUpperCase()}${rest.slice(1).toLowerCase()}${suffix}`;
    }

    // Preserve intentional mixed-case or short all-caps tickers/acronyms (e.g. "IBM", "NVIDIA", "GE")
    // while converting long ALL-CAPS SEC words like "HOLDINGS" or "TECHNOLOGIES"
    if (core.length >= 5 && core === core.toUpperCase() && /^[A-Z]+$/.test(core)) {
      return `${prefix}${core[0]}${core.slice(1).toLowerCase()}${suffix}`;
    }

    return token;
  });

  return normalized
    .join(" ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*$/g, "")
    .trim();
}
