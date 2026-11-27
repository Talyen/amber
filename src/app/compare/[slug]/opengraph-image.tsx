import { ImageResponse } from "next/og";
import { getSearchIndex } from "@/data/repository";
import { resolveComparisonTickers, toComparisonEntry, type ComparisonEntry } from "@/lib/compare";
import { formatCurrencyCompact, formatPct } from "@/lib/finance";
import { SITE_HOST } from "@/lib/site";

export const revalidate = 86400;

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default async function CompareOpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const index = await getSearchIndex();
  const byTicker = new Map(index.map((entry) => [entry.ticker, entry]));
  const tickers = resolveComparisonTickers(slug, new Set(byTicker.keys()));
  const matched = tickers
    .map((t) => byTicker.get(t))
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .map(toComparisonEntry);

  if (matched.length < 2) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#0B0C0E",
            color: "#F2F2F3",
            fontSize: 44,
            fontWeight: 600,
          }}
        >
          Amber: Side-by-Side Equity Comparison
        </div>
      ),
      { ...size }
    );
  }

  const rows: Array<{ label: string; format: (entry: ComparisonEntry) => string; accent?: boolean }> = [
    { label: "Market Cap", format: (entry) => formatCurrencyCompact(entry.marketCap) },
    { label: "True FCF (FCF − SBC)", format: (entry) => entry.trueFcf === null ? "—" : formatCurrencyCompact(entry.trueFcf), accent: true },
    { label: "True FCF Margin", format: (entry) => formatPct(entry.trueFcfMargin) },
    { label: "SBC Burden (% Rev)", format: (entry) => formatPct(entry.sbcPctRevenue) },
    { label: "Implied 10Y Growth", format: (entry) => formatPct(entry.impliedCagr), accent: true },
  ];
  const columnWidth = Math.floor(736 / matched.length);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0B0C0E",
          color: "#F2F2F3",
          padding: "52px 64px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#E5A03C", fontSize: 20, fontWeight: 700, letterSpacing: "0.06em" }}>
            HEAD-TO-HEAD COMPARISON
          </span>
          <span style={{ color: "#F2F2F3", fontSize: 20, fontWeight: 700, letterSpacing: "0.08em" }}>
            AMBER
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          {matched.map(({ ticker }, index) => (
            <div key={ticker} style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              {index > 0 && <span style={{ fontSize: 26, color: "#6B707D" }}>vs.</span>}
              <span style={{ fontSize: matched.length > 3 ? 40 : 54, fontWeight: 700, color: index ? "#F2F2F3" : "#E5A03C" }}>{ticker}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((r) => (
            <div
              key={r.label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "#111317",
                border: "1px solid #23262E",
                borderRadius: 10,
                padding: "14px 24px",
                fontSize: 22,
              }}
            >
              <span style={{ width: 280, color: "#9CA0AB", fontSize: 19 }}>{r.label}</span>
              {matched.map((entry) => (
                <span key={entry.ticker} style={{
                  width: columnWidth, textAlign: "right", fontWeight: 700,
                  color: r.accent ? "#E5A03C" : "#F2F2F3",
                }}>
                  {r.format(entry)}
                </span>
              ))}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, color: "#6B707D" }}>
          <span>{matched.length === 2 ? matched.map(({ name }) => name).join(" vs. ") : `${matched.length} companies`}</span>
          <span style={{ color: "#E5A03C", fontWeight: 700 }}>{`${SITE_HOST}/compare/${slug}`}</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
