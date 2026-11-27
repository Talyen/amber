const ENTITY_KEYWORD_PATTERN =
  /\b(llc|l\.l\.c\.|lp|l\.p\.|llp|inc|corp|corporation|co\.|company|ltd|limited|trust|trustee|fund|funds|partners|partnership|holdings|holding|capital|management|advisors|advisers|group|ventures|investments|investment|foundation|association|bank|bancorp|plc|sa|ag|nv|gmbh|international|enterprises|associates|family|estate|revocable|irrevocable)\b/i;

const SUFFIX_PATTERN = /^(jr\.?|sr\.?|ii|iii|iv|v|phd|md|esq\.?)$/i;

const ACRONYM_PATTERN = /\b(Ceo|Cfo|Coo|Cto|Cio|Cmo|Evp|Svp|Vp|Llc|Lp|Llp|Iii|Ii|Iv)\b/g;

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/gi, "&")
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\/+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCasing(text: string): string {
  if (
    text.length >= 3 &&
    text === text.toUpperCase() &&
    /[A-Z]/.test(text) &&
    !/^(CEO|CFO|COO|CTO|CIO|CMO|EVP|SVP|VP)$/.test(text)
  ) {
    return text
      .toLowerCase()
      .replace(/(^|[\s\-'])([a-z])/g, (_, sep: string, ch: string) => `${sep}${ch.toUpperCase()}`)
      .replace(ACRONYM_PATTERN, (m) => m.toUpperCase());
  }
  return text;
}

/**
 * Formats SEC Form 4 reporting owner names from raw EDGAR conventions
 * (e.g. "THIEL PETER", "Thiel Peter", "COOK TIMOTHY D", "Smith John Jr")
 * into natural reading order ("Peter Thiel", "Timothy D Cook", "John Smith Jr")
 * while preserving organizational/trust entity names intact.
 */
export function formatInsiderName(raw: string): string {
  const decoded = decodeHtmlEntities(raw);
  if (!decoded) return "";

  const normalized = normalizeCasing(decoded);

  // Preserve corporate, fund, and trust entity names in original word order
  if (ENTITY_KEYWORD_PATTERN.test(normalized) || normalized.includes("&")) {
    return normalized;
  }

  // Handle explicit "Last, First [Middle]" comma syntax
  if (normalized.includes(",")) {
    const [lastPart, ...restParts] = normalized.split(",").map((s) => s.trim()).filter(Boolean);
    if (lastPart && restParts.length > 0) {
      return `${restParts.join(" ")} ${lastPart}`.replace(/\s+/g, " ").trim();
    }
  }

  const tokens = normalized.split(" ").filter(Boolean);
  // SEC EDGAR individual names are almost always "Last First" or "Last First Middle [Suffix]"
  if (tokens.length >= 2 && tokens.length <= 4) {
    let suffix: string | null = null;
    const working = [...tokens];
    if (working.length >= 3 && SUFFIX_PATTERN.test(working[working.length - 1])) {
      suffix = working.pop()!;
    }
    const [last, ...given] = working;
    if (last && given.length > 0) {
      return [...given, last, ...(suffix ? [suffix] : [])].join(" ");
    }
  }

  return normalized;
}

export function formatInsiderTitle(raw: string): string {
  const cleaned = decodeHtmlEntities(raw).replace(/See Remarks below\.?/i, "Executive Officer").trim();
  if (!cleaned || cleaned === "Dir") return "Director";
  if (cleaned === "10%") return "10% Owner";
  return normalizeCasing(cleaned)
    .replace(/\bDir\b/g, "Director")
    .replace(/\bPres\b/g, "President")
    .replace(/\bTreas\b/g, "Treasurer")
    .replace(/\bSec\b/g, "Secretary");
}
