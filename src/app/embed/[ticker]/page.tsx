import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanySnapshot } from "@/data/repository";
import { EmbedChartFrame, type EmbedChartType } from "@/components/EmbedChartFrame";

export const revalidate = 86400;

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

function parseChart(raw?: string): EmbedChartType {
  if (raw === "true-fcf" || raw === "reverse-dcf" || raw === "sankey") {
    return raw;
  }
  return "sankey";
}

export default async function EmbedTickerPage({
  params,
  searchParams,
}: {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<{ chart?: string; theme?: string }>;
}) {
  const [{ ticker }, sp] = await Promise.all([params, searchParams]);
  const company = await getCompanySnapshot(ticker);
  if (!company) notFound();

  const chart = parseChart(sp.chart);
  const theme = sp.theme === "dark" || sp.theme === "light" ? sp.theme : undefined;

  return <EmbedChartFrame company={company} chart={chart} theme={theme} />;
}
