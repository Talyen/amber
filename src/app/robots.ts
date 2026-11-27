import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/api/v1/", "/api/public/", "/api/mcp"],
      disallow: ["/api/", "/settings"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
