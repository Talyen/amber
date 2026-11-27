import { ImageResponse } from "next/og";
import { getArenaPerformance, getArenaPortfolioById } from "@/data/arena-repository";
import { roundWeightsToHundred } from "@/lib/arena-weights";
import { formatPct } from "@/lib/finance";
import { SITE_HOST } from "@/lib/site";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default async function ArenaDetailOpenGraphImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const portfolio = await getArenaPortfolioById(id);

  if (!portfolio) {
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
            fontWeight: 700,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          Amber Portfolio Arena
        </div>
      ),
      size
    );
  }

  const { spyReturn } = await getArenaPerformance(portfolio);
  const alpha = typeof spyReturn === "number" ? portfolio.totalReturnPct - spyReturn : null;
  const roundedWeights = roundWeightsToHundred(portfolio.positions.map((p) => p.weightPct));
  const retColor =
    portfolio.totalReturnPct > 0
      ? "#4ADE80"
      : portfolio.totalReturnPct < 0
        ? "#F87171"
        : "#F2F2F3";

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
          padding: "52px 60px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span
            style={{
              fontSize: 19,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "#E5A03C",
            }}
          >
            {`PORTFOLIO ARENA / ${portfolio.handle.toUpperCase()}`}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 13,
                height: 13,
                backgroundColor: "#E5A03C",
                transform: "rotate(45deg)",
              }}
            />
            <span style={{ fontSize: 19, fontWeight: 700, color: "#D4D4D8" }}>
              {SITE_HOST}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 32 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 740 }}>
            <div
              style={{
                fontSize: 52,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                lineHeight: 1.08,
              }}
            >
              {portfolio.title}
            </div>
            <div style={{ fontSize: 22, color: "#9CA0AB", lineHeight: 1.35 }}>
              {portfolio.thesis.slice(0, 115)}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ fontSize: 64, fontWeight: 700, color: retColor, lineHeight: 1 }}>
              {formatPct(portfolio.totalReturnPct, true)}
            </div>
            {alpha !== null && (
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: alpha >= 0 ? "#4ADE80" : "#9CA0AB",
                }}
              >
                {`${formatPct(alpha, true)} vs S&P 500`}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {portfolio.positions.slice(0, 6).map((pos, idx) => (
            <div
              key={pos.ticker}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 18px",
                borderRadius: 12,
                backgroundColor: "#14171D",
                border: "1px solid #262A34",
                fontSize: 20,
              }}
            >
              <span style={{ fontWeight: 700, color: "#E5A03C" }}>{pos.ticker}</span>
              <span style={{ color: "#9CA0AB" }}>{`${roundedWeights[idx]}%`}</span>
              <span
                style={{
                  fontWeight: 600,
                  color: pos.returnPct >= 0 ? "#4ADE80" : "#F87171",
                }}
              >
                {formatPct(pos.returnPct, true)}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
