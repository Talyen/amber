import type { MetadataRoute } from "next";
import { getAllTickers, getSearchIndex } from "@/data/repository";
import { POPULAR_COMPARE_SLUGS, resolveComparisonTickers } from "@/lib/compare";
import { sectorSlug } from "@/lib/agentic-data";
import { DISCOVERY_LENSES } from "@/lib/insights";
import { SITE_URL } from "@/lib/site";

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [tickers, entries] = await Promise.all([
    getAllTickers(),
    getSearchIndex(),
  ]);
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE_URL}/feed`, lastModified: now, changeFrequency: "daily", priority: 0.95 },
    { url: `${SITE_URL}/compare`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/portfolio`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/arena`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/developers`, lastModified: now, changeFrequency: "weekly", priority: 0.75 },
    { url: `${SITE_URL}/mcp`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/docs`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ];

  const lensRoutes: MetadataRoute.Sitemap = DISCOVERY_LENSES.map((lens) => ({
    url: `${SITE_URL}/lenses/${lens.id}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.85,
  }));

  // Programmatically generate 250+ high-intent same-sector peer comparison URLs
  const available = new Set(entries.map((entry) => entry.ticker));
  const compareSlugSet = new Set<string>(
    POPULAR_COMPARE_SLUGS.filter((slug) => resolveComparisonTickers(slug, available).length > 0)
  );
  const bySector = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = bySector.get(e.sector) ?? [];
    list.push(e);
    bySector.set(e.sector, list);
  }
  for (const [, sectorList] of bySector) {
    const top = [...sectorList]
      .sort((a, b) => b.marketCap - a.marketCap)
      .slice(0, 12);
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < Math.min(top.length, i + 4); j++) {
        const slug = `${top[i].ticker}-vs-${top[j].ticker}`;
        compareSlugSet.add(slug);
      }
    }
  }

  const compareRoutes: MetadataRoute.Sitemap = [...compareSlugSet].map(
    (slug) => ({
      url: `${SITE_URL}/compare/${slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    })
  );

  const tickerRoutes: MetadataRoute.Sitemap = tickers.map((t) => ({
    url: `${SITE_URL}/t/${t}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.75,
  }));

  // Index high-intent wedge sub-routes (/sbc, /valuation, /filings) for top 150 issuers by market cap
  const topWedgeTickers = [...entries]
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, 150)
    .map((e) => e.ticker);
  const wedgeRoutes: MetadataRoute.Sitemap = topWedgeTickers.flatMap((t) => [
    {
      url: `${SITE_URL}/t/${t}/sbc`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.72,
    },
    {
      url: `${SITE_URL}/t/${t}/valuation`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.72,
    },
    {
      url: `${SITE_URL}/t/${t}/filings`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    },
  ]);

  const sectorRoutes: MetadataRoute.Sitemap = Array.from(
    new Set(entries.map((e) => sectorSlug(e.sector)))
  ).map((slug) => ({
    url: `${SITE_URL}/sectors/${slug}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.82,
  }));

  return [
    ...staticRoutes,
    ...lensRoutes,
    ...sectorRoutes,
    ...compareRoutes,
    ...tickerRoutes,
    ...wedgeRoutes,
  ];
}
