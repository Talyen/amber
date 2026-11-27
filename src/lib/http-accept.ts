// Prefer an explicit opt-in to Markdown. General media ranges still count
// toward the default representation's quality, with exact types taking priority.
function acceptRanges(accept: string | null) {
  return (accept ?? "").split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((range) => {
    const [type, ...params] = range.toLowerCase().split(";").map((part) => part.trim());
    const weight = params.find((param) => /^q\s*=/.test(param))?.split("=")[1]?.trim();
    const quality = weight === undefined
      ? 1
      : /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(weight) ? Number(weight) : 0;
    return { type, quality };
  });
}

export function mediaTypeQuality(accept: string | null, mediaType: string): number {
  return Math.max(0, ...acceptRanges(accept).filter(({ type }) => type === mediaType).map(({ quality }) => quality));
}

export function prefersMarkdown(accept: string | null, defaultType = "application/json"): boolean {
  const ranges = acceptRanges(accept);
  const markdown = mediaTypeQuality(accept, "text/markdown");
  if (markdown === 0) return false;

  for (const type of [defaultType, `${defaultType.split("/")[0]}/*`, "*/*"]) {
    const matches = ranges.filter((range) => range.type === type);
    if (matches.length > 0) return markdown > Math.max(...matches.map(({ quality }) => quality));
  }
  return true;
}
