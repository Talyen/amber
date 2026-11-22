import { ImageResponse } from "next/og";
import { getCompany } from "@/data/universe";
import {
  computeAnnualMetrics,
  computeEnterpriseValue,
  computeNetDilutionCagr,
  formatCurrencyCompact,
  formatPct,
  solveReverseDcf,
} from "@/lib/finance";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const company = getCompany(ticker);

  if (!company) {
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
            fontSize: 48,
            fontWeight: 600,
          }}
        >
          Amber — High-Signal Fundamental Analysis
        </div>
      ),
      { ...size }
    );
  }

  const series = computeAnnualMetrics(company.annuals);
  const latest = series[series.length - 1];
  const ev = computeEnterpriseValue(company);
  const dilution = computeNetDilutionCagr(company.annuals);
  const dcf = solveReverseDcf({
    enterpriseValue: ev,
    baseRevenue: latest.revenue,
    waccPct: company.defaultDcf.wacc,
    terminalMultiple: company.defaultDcf.terminalMultiple,
    targetTrueFcfMarginPct: Math.max(
      1.5,
      company.defaultDcf.targetFcfMargin - company.defaultDcf.sbcDragPct
    ),
    currentTrueFcfMarginPct: latest.trueFcfMargin,
  });

  const kpis = [
    {
      label: `TRUE FCF (${latest.fiscalYear})`,
      value: formatCurrencyCompact(latest.trueFcf),
      sub: `Reported ${formatCurrencyCompact(latest.reportedFcf)}`,
      accent: latest.trueFcf >= 0 ? "#E5A03C" : "#F87171",
    },
    {
      label: "SBC BURDEN",
      value: formatPct(latest.sbcPctRevenue),
      sub: `${formatCurrencyCompact(latest.sbc)} (${formatPct(latest.sbcPctReportedFcf, false, 0)} of FCF)`,
      accent: "#D97745",
    },
    {
      label: "NET DILUTION (CAGR)",
      value: formatPct(dilution, true),
      sub: `${latest.dilutedShares.toLocaleString()}M diluted shares`,
      accent: dilution > 1.5 ? "#F87171" : dilution < -0.5 ? "#4ADE80" : "#F2F2F3",
    },
    {
      label: "IMPLIED 10Y REV CAGR",
      value: formatPct(dcf.impliedRevenueCagrPct),
      sub: `${formatPct(company.defaultDcf.wacc)} WACC · ${company.defaultDcf.terminalMultiple}x exit`,
      accent: "#E5A03C",
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
        {/* Top Row: Ticker & Brand */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span
              style={{
                color: "#E5A03C",
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "0.06em",
              }}
            >
              {company.ticker}
            </span>
            <span style={{ color: "#52525B", fontSize: 20 }}>·</span>
            <span style={{ color: "#9CA0AB", fontSize: 20 }}>
              {company.exchange} · {company.sector}
            </span>
          </div>

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
                fontWeight: 600,
                letterSpacing: "0.08em",
                color: "#F2F2F3",
              }}
            >
              AMBER
            </span>
          </div>
        </div>

        {/* Title */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: "#F2F2F3",
            }}
          >
            {company.name}
          </div>
          <div style={{ fontSize: 24, color: "#9CA0AB" }}>
            {company.tagline}
          </div>
        </div>

        {/* 4 KPI Cards */}
        <div style={{ display: "flex", gap: 20 }}>
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
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
                  color: "#6B707D",
                }}
              >
                {kpi.label}
              </div>
              <div
                style={{
                  fontSize: 38,
                  fontWeight: 700,
                  color: kpi.accent,
                }}
              >
                {kpi.value}
              </div>
              <div style={{ fontSize: 14, color: "#9CA0AB" }}>{kpi.sub}</div>
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
            paddingTop: 20,
            fontSize: 16,
            color: "#6B707D",
          }}
        >
          <span>
            Source: SEC EDGAR {company.lastFiling.type} ({company.lastFiling.date}) · CIK {company.cik}
          </span>
          <span>True FCF · Reverse DCF · Filing Diffs</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
