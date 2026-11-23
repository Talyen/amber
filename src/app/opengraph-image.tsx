import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  const pillars = [
    {
      label: "TRUE FREE CASH FLOW",
      title: "FCF minus SBC",
      desc: "Isolates stock-based compensation and real diluted share creep across fiscal years.",
    },
    {
      label: "REVERSE DCF STUDIO",
      title: "Priced-in 10Y growth",
      desc: "Interactive solver revealing the exact revenue CAGR baked into Enterprise Value.",
    },
    {
      label: "10-K PROSE DIFFS",
      title: "Material filing shifts",
      desc: "Structured Risk Factor & MD&A changes plus open-market Form 4 insider flows.",
    },
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
          padding: "56px 64px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Top Brand Row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 16,
                height: 16,
                backgroundColor: "#E5A03C",
                transform: "rotate(45deg)",
              }}
            />
            <span
              style={{
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "#F2F2F3",
              }}
            >
              AMBER
            </span>
          </div>
          <span
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "#E5A03C",
              letterSpacing: "0.06em",
            }}
          >
            FUNDAMENTAL EQUITY ANALYSIS
          </span>
        </div>

        {/* Hero Headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              fontSize: 58,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.08,
              color: "#F2F2F3",
            }}
          >
            Understand any business in 60 seconds.
          </div>
          <div style={{ fontSize: 24, color: "#9CA0AB" }}>
            Real cash flow, dilution, and priced-in growth directly from SEC EDGAR filings.
          </div>
        </div>

        {/* 3 Pillar Cards */}
        <div style={{ display: "flex", gap: 20 }}>
          {pillars.map((p) => (
            <div
              key={p.label}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                backgroundColor: "#111317",
                border: "1px solid #23262E",
                borderRadius: 14,
                padding: "22px 24px",
                height: 170,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  color: "#E5A03C",
                }}
              >
                {p.label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#F2F2F3" }}>
                {p.title}
              </div>
              <div style={{ fontSize: 15, color: "#9CA0AB", lineHeight: 1.35 }}>
                {p.desc}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid #23262E",
            paddingTop: 18,
            fontSize: 16,
            color: "#8B909E",
          }}
        >
          <span>600+ Public Companies | Official SEC EDGAR XBRL &amp; 10-K/10-Q</span>
          <span>True FCF | Reverse DCF | Portfolio Arena</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
