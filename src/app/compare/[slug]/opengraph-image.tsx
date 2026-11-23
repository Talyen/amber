import { ImageResponse } from "next/og";
import { getSearchIndex } from "@/data/repository";
import { resolveComparisonTickers } from "@/lib/compare";
import { formatCurrencyCompact, formatPct } from "@/lib/finance";

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
  const tickers = resolveComparisonTickers(slug, new Set(byTicker.keys())).slice(0, 2);
  const matched = tickers
    .map((t) => byTicker.get(t))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

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

  const [a, b] = matched;
  const rows = [
    { label: "Market Cap", va: formatCurrencyCompact(a.marketCap), vb: formatCurrencyCompact(b.marketCap) },
    { label: "True FCF (FCF − SBC)", va: formatCurrencyCompact(a.trueFcf), vb: formatCurrencyCompact(b.trueFcf), accent: true },
    { label: "True FCF Margin", va: formatPct(a.trueFcfMargin), vb: formatPct(b.trueFcfMargin) },
    { label: "SBC Burden (% Rev)", va: formatPct(a.sbcPctRevenue), vb: formatPct(b.sbcPctRevenue) },
    { label: "Implied 10Y Growth", va: formatPct(a.impliedCagr), vb: formatPct(b.impliedCagr), accent: true },
  ];

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

        <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
          <span style={{ fontSize: 54, fontWeight: 700, color: "#E5A03C" }}>{a.ticker}</span>
          <span style={{ fontSize: 32, color: "#6B707D" }}>vs.</span>
          <span style={{ fontSize: 54, fontWeight: 700, color: "#F2F2F3" }}>{b.ticker}</span>
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
              <span style={{ width: 220, textAlign: "right", fontWeight: 700, color: r.accent ? "#E5A03C" : "#F2F2F3" }}>
                {r.va}
              </span>
              <span style={{ width: 220, textAlign: "right", fontWeight: 700, color: r.accent ? "#E5A03C" : "#F2F2F3" }}>
                {r.vb}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, color: "#6B707D" }}>
          <span>{a.name} vs. {b.name}</span>
          <span>SEC EDGAR XBRL | True FCF &amp; Reverse DCF</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
