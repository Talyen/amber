import { NextResponse, type NextRequest } from "next/server";
import { prefersMarkdown } from "@/lib/http-accept";
import { SITE_HOST, SITE_URL } from "@/lib/site";

const TICKER_PATH_RE = /^\/t\/([A-Za-z0-9.-]{1,10})(?:\/(sbc|valuation|filings))?\/?$/;

const KNOWN_TOP_SEGMENTS = new Set([
  "",
  "t",
  "u",
  "feed",
  "compare",
  "portfolio",
  "arena",
  "sectors",
  "lenses",
  "filings",
  "embed",
  "settings",
  "privacy",
  "terms",
  "about",
  "contact",
  "docs",
  "api",
  "llms.txt",
  "openapi.json",
  "robots.txt",
  "sitemap.xml",
  "feed.xml",
  "opengraph-image",
  "twitter-image",
  "icon.svg",
  "icon",
  "apple-icon",
]);

const DISCOVERY_LINK_HEADER =
  '</llms.txt>; rel="describedby"; type="text/markdown", </openapi.json>; rel="service-desc"; type="application/openapi+json", </api/mcp>; rel="service"; title="Amber MCP Server", </docs>; rel="documentation"';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accept = request.headers.get("accept");
  const wantsMarkdown = prefersMarkdown(accept);

  // Content negotiation on homepage: serve Markdown when Accept: text/markdown is preferred
  if (pathname === "/" && wantsMarkdown) {
    return NextResponse.rewrite(new URL("/llms.txt", request.url));
  }

  // Agent-friendly 404 Markdown for unknown non-API routes when Markdown is requested
  const firstSegment = pathname.split("/")[1] ?? "";
  if (wantsMarkdown && !KNOWN_TOP_SEGMENTS.has(firstSegment)) {
    const body = [
      "# 404 — Page Not Found",
      "",
      `The requested path \`${pathname}\` does not exist on Amber (${SITE_HOST}).`,
      "",
      "## Helpful Links",
      `- Agent & API Index: ${SITE_URL}/llms.txt`,
      `- Public API & MCP Docs: ${SITE_URL}/docs`,
      `- OpenAPI 3.1 Spec: ${SITE_URL}/openapi.json`,
      `- Sitemap: ${SITE_URL}/sitemap.xml`,
      "",
    ].join("\n");

    return new Response(body, {
      status: 404,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        Vary: "Accept",
        Link: DISCOVERY_LINK_HEADER,
      },
    });
  }

  const response = NextResponse.next();
  if (
    pathname === "/" ||
    firstSegment === "t" ||
    firstSegment === "sectors" ||
    firstSegment === "lenses" ||
    firstSegment === "compare" ||
    firstSegment === "feed" ||
    firstSegment === "docs"
  ) {
    response.headers.set("Link", DISCOVERY_LINK_HEADER);
    if (pathname === "/") {
      response.headers.append("Vary", "Accept");
    }
    const tickerPath = pathname.match(TICKER_PATH_RE);
    if (tickerPath) {
      response.headers.append(
        "Link",
        `</api/public/t/${tickerPath[1].toUpperCase()}?format=markdown>; rel="alternate"; type="text/markdown"`
      );
    }
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|webp|ico|woff2?|css|js|map)$).*)",
  ],
};
