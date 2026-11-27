import { NextResponse, type NextRequest } from "next/server";
import { AGENT_DISCOVERY_LINKS, AMBER_HOME_MARKDOWN } from "@/lib/agent-readiness";
import { prefersMarkdown } from "@/lib/http-accept";

const TICKER_PATH_RE = /^\/t\/([A-Za-z0-9.-]{1,10})(?:\/(sbc|valuation|filings))?\/?$/;
const DISCOVERY_SECTIONS = new Set(["t", "sectors", "lenses", "compare", "feed", "docs", "developers", "mcp"]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isRead = request.method === "GET" || request.method === "HEAD";
  const wantsMarkdown = isRead && !request.headers.has("rsc") && prefersMarkdown(request.headers.get("accept"), "text/html");

  if (pathname === "/" && wantsMarkdown) {
    return new Response(request.method === "HEAD" ? null : AMBER_HOME_MARKDOWN, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "no-store",
        Vary: "Accept, RSC",
        Link: AGENT_DISCOVERY_LINKS,
      },
    });
  }

  // Unmatched document URLs can fall back to a Markdown 404 after Next.js has
  // checked the actual routes. Only middleware can set the fallback flag.
  const headers = new Headers(request.headers);
  headers.delete("x-amber-markdown-fallback");
  if (wantsMarkdown) headers.set("x-amber-markdown-fallback", "1");
  const response = NextResponse.next({ request: { headers } });
  const firstSegment = pathname.split("/")[1] ?? "";
  if (pathname === "/" || DISCOVERY_SECTIONS.has(firstSegment)) {
    response.headers.set("Link", AGENT_DISCOVERY_LINKS);
    const tickerPath = pathname.match(TICKER_PATH_RE);
    if (tickerPath) {
      response.headers.append(
        "Link",
        `</api/public/t/${tickerPath[1].toUpperCase()}?format=markdown>; rel="alternate"; type="text/markdown"`,
      );
    }
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|webp|ico|woff2?|css|js|map)$).*)"],
};
