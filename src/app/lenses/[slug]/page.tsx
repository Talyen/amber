import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getInsiderBuySummaries,
  getMaterialEventSummaries,
  getSearchIndex,
} from "@/data/repository";
import { SignalIndex } from "@/components/SignalIndex";
import { toExploreEntry } from "@/data/search-index";
import { LensReportHeader } from "@/components/LensReportHeader";
import { DISCOVERY_LENSES } from "@/lib/insights";
import { SITE_URL } from "@/lib/site";

export const revalidate = 21600;

export function generateStaticParams() {
  return DISCOVERY_LENSES.map((lens) => ({ slug: lens.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const lens = DISCOVERY_LENSES.find((l) => l.id === slug);
  if (!lens) return { title: "Lens Not Found" };

  const title = `${lens.title}: ${lens.subtitle}`;
  const description = `${lens.whyItMatters} Live SEC EDGAR XBRL screen updated nightly on Amber.`;
  const canonicalUrl = `${SITE_URL}/lenses/${lens.id}`;
  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: { title, description, url: canonicalUrl },
  };
}

export default async function LensPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const lens = DISCOVERY_LENSES.find((l) => l.id === slug);
  if (!lens) notFound();

  const [entries, insiderBuySummaries, materialEventSummaries] =
    await Promise.all([
      getSearchIndex(),
      getInsiderBuySummaries(),
      getMaterialEventSummaries(),
    ]);
  const exploreEntries = entries.map(toExploreEntry);
  const matchedEntries = exploreEntries
    .filter((e) =>
      lens.filter(e, {
        insiderBuyTickers: new Set(Object.keys(insiderBuySummaries)),
        materialEventTickers: new Set(Object.keys(materialEventSummaries)),
      })
    )
    .sort(lens.sort);

  return (
    <SignalIndex
      entries={exploreEntries}
      initialLensId={lens.id}
      lensHeader={
        <LensReportHeader
          lensId={lens.id}
          title={lens.title}
          subtitle={lens.subtitle}
          whyItMatters={lens.whyItMatters}
          totalUniverse={entries.length}
          matches={matchedEntries}
        />
      }
      insiderBuySummaries={insiderBuySummaries}
      materialEventSummaries={materialEventSummaries}
    />
  );
}
