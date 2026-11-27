import { ImageResponse } from "next/og";
import { SITE_HOST } from "@/lib/site";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function ArenaOpenGraphImage() {
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
          padding: "56px 64px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "#E5A03C",
            }}
          >
            PORTFOLIO ARENA
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 14,
                height: 14,
                backgroundColor: "#E5A03C",
                transform: "rotate(45deg)",
              }}
            />
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "0.08em",
              }}
            >
              AMBER
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              fontSize: 60,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.08,
            }}
          >
            Portfolio Leaderboards
          </div>
          <div style={{ fontSize: 26, color: "#9CA0AB", maxWidth: 960 }}>
            Live &amp; archived rankings across strategy bots and community portfolios, benchmarked against SPY with weighted True FCF fundamentals.
          </div>
        </div>

        <div style={{ display: "flex", gap: 20 }}>
          {[
            { k: "BENCHMARK", v: "S&P 500 (SPY)" },
            { k: "TRACKING", v: "Time-Weighted NAV" },
            { k: "FUNDAMENTALS", v: "True FCF & Implied 10Y" },
          ].map((item) => (
            <div
              key={item.k}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                backgroundColor: "#111317",
                border: "1px solid #23262E",
                borderRadius: 14,
                padding: "22px 24px",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  color: "#8B909E",
                }}
              >
                {item.k}
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#E5A03C" }}>
                {item.v}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            borderTop: "1px solid #23262E",
            paddingTop: 18,
            fontSize: 16,
            color: "#8B909E",
          }}
        >
          <span>Amber Portfolio Arena · Monthly | Yearly | All-Time</span>
          <span style={{ color: "#E5A03C", fontWeight: 700 }}>{`${SITE_HOST}/arena`}</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
