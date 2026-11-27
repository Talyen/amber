import { ImageResponse } from "next/og";
import { getFilingDiffById } from "@/data/repository";
import { SITE_HOST } from "@/lib/site";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default async function FilingDiffOpenGraphImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const diff = await getFilingDiffById(id);

  if (!diff) {
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
            fontSize: 42,
            fontWeight: 700,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          Amber SEC Filing Diff Radar
        </div>
      ),
      size
    );
  }

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
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span
              style={{
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: "#E5A03C",
              }}
            >
              {`${diff.ticker} · SEC ${diff.filingType} DIFF`}
            </span>
            <span
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "#9CA0AB",
                backgroundColor: "#171A20",
                border: "1px solid #262A34",
                borderRadius: 8,
                padding: "4px 12px",
              }}
            >
              {`${diff.materiality} Signal · ${diff.category}`}
            </span>
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#D4D4D8" }}>
            {SITE_HOST}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 22, color: "#9CA0AB", fontWeight: 600 }}>
            {`${diff.companyName} · Filed ${diff.filingDate} · ${diff.section}`}
          </div>
          <div
            style={{
              fontSize: 46,
              fontWeight: 700,
              letterSpacing: "-0.025em",
              lineHeight: 1.12,
            }}
          >
            {diff.headline.slice(0, 110)}
          </div>
          <div style={{ fontSize: 23, color: "#A1A1AA", lineHeight: 1.4 }}>
            {diff.summary.slice(0, 210)}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid #23262E",
            paddingTop: 20,
            fontSize: 17,
            color: "#8B909E",
          }}
        >
          <span>{`SEC EDGAR Accession ${diff.accessionNumber}`}</span>
          <span style={{ color: "#E5A03C", fontWeight: 600 }}>
            {`${SITE_HOST}/t/${diff.ticker}/filings`}
          </span>
        </div>
      </div>
    ),
    size
  );
}
