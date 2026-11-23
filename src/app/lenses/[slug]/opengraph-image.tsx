import { ImageResponse } from "next/og";
import { DISCOVERY_LENSES } from "@/lib/insights";
import {
  getInsiderBuyTickers,
  getMaterialEventTickers,
  getSearchIndex,
} from "@/data/repository";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function LensOgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const lens = DISCOVERY_LENSES.find((l) => l.id === slug);
  const [entries, insiderBuyTickers, materialEventTickers] = await Promise.all([
    getSearchIndex(),
    getInsiderBuyTickers(),
    getMaterialEventTickers(),
  ]);
  const ctx = {
    insiderBuyTickers: new Set(insiderBuyTickers),
    materialEventTickers: new Set(materialEventTickers),
  };
  const matches = lens ? entries.filter((e) => lens.filter(e, ctx)).sort(lens.sort) : [];
  const topTickers = matches.slice(0, 6).map((m) => m.ticker);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#111317",
          color: "#F2F2F3",
          padding: "56px 64px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#E5A03C", letterSpacing: 1.5 }}>
            AMBER  ·  SEC DISCOVERY LENS
          </div>
          <div style={{ fontSize: 18, color: "#9CA0AB" }}>
            {matches.length} Matching Companies
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 54, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.08 }}>
            {lens?.title ?? "SEC Discovery Screen"}
          </div>
          <div style={{ fontSize: 24, color: "#B8BCC6", lineHeight: 1.4, maxWidth: 960 }}>
            {lens?.whyItMatters ?? "Live SEC EDGAR screening across 600+ public companies."}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 12 }}>
            {topTickers.map((t) => (
              <div
                key={t}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  backgroundColor: "rgba(229, 160, 60, 0.14)",
                  border: "1px solid rgba(229, 160, 60, 0.35)",
                  color: "#E5A03C",
                  fontSize: 20,
                  fontWeight: 700,
                }}
              >
                {t}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 18, color: "#9CA0AB" }}>
            Updated nightly from SEC EDGAR
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
