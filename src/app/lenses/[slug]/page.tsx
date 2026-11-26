import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getInsiderBuySummaries,
  getMaterialEventSummaries,
  getSearchIndex,
} from "@/data/repository";
import { SignalIndex } from "@/components/SignalIndex";
import { DISCOVERY_LENSES } from "@/lib/insights";

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

  return {
    title: `${lens.title}: ${lens.subtitle}`,
    description: `${lens.whyItMatters} Live SEC EDGAR XBRL screen updated nightly on Amber.`,
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
  return (
    <SignalIndex
      entries={entries}
      initialLensId={lens.id}
      insiderBuySummaries={insiderBuySummaries}
      materialEventSummaries={materialEventSummaries}
    />
  );
}
