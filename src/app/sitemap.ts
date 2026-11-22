import type { MetadataRoute } from "next";
import { getAllTickers } from "@/data/repository";
import { DISCOVERY_LENSES } from "@/lib/insights";

export const revalidate = 86400;

export const POPULAR_COMPARE_SLUGS = [
  "NVDA-vs-AMD",
  "PLTR-vs-SNOW",
  "AAPL-vs-MSFT",
  "V-vs-MA",
  "COST-vs-WMT",
  "AMZN-vs-GOOGL",
  "META-vs-NFLX",
  "CRWD-vs-PANW",
  "SNOW-vs-DDOG",
  "UBER-vs-ABNB",
  "CRM-vs-NOW",
  "HD-vs-LOW",
  "AVGO-vs-NVDA",
  "SHOP-vs-AMZN",
  "ADBE-vs-INTU",
  "KO-vs-PEP",
];

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "https://amber-theta-three.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const tickers = await getAllTickers();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${siteUrl}/compare`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl}/portfolio`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl}/arena`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/filings`, lastModified: now, changeFrequency: "daily", priority: 0.85 },
  ];

  const lensRoutes: MetadataRoute.Sitemap = DISCOVERY_LENSES.map((lens) => ({
    url: `${siteUrl}/lenses/${lens.id}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.85,
  }));

  const compareRoutes: MetadataRoute.Sitemap = POPULAR_COMPARE_SLUGS.map(
    (slug) => ({
      url: `${siteUrl}/compare/${slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    })
  );

  const tickerRoutes: MetadataRoute.Sitemap = tickers.map((t) => ({
    url: `${siteUrl}/t/${t}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.75,
  }));

  return [...staticRoutes, ...lensRoutes, ...compareRoutes, ...tickerRoutes];
}
