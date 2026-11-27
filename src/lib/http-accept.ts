// An explicit media type can opt into an alternate representation.
export function mediaTypeQuality(accept: string | null, mediaType: string): number {
  return (accept ?? "").split(",").reduce((highest, range) => {
    const [type, ...params] = range.toLowerCase().split(";").map((part) => part.trim());
    if (type !== mediaType) return highest;
    const quality = params.find((param) => param.startsWith("q="));
    const value = quality === undefined ? 1 : Number(quality.slice(2));
    return Number.isFinite(value) && value >= 0 && value <= 1 ? Math.max(value, highest) : highest;
  }, 0);
}

export function prefersMarkdown(accept: string | null): boolean {
  return mediaTypeQuality(accept, "text/markdown") > mediaTypeQuality(accept, "application/json");
}
