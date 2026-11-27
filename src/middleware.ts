import { NextResponse, type NextRequest } from "next/server";

const TICKER_PATH_RE = /^\/t\/([A-Za-z0-9.-]{1,10})(?:\/(sbc|valuation|filings))?\/?$/;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const tickerPath = pathname.match(TICKER_PATH_RE);

  const response = NextResponse.next();
  response.headers.set(
    "Link",
    '</llms.txt>; rel="describedby"; type="text/markdown", </openapi.json>; rel="service-desc"; type="application/openapi+json", </api/mcp>; rel="service"; title="Amber MCP Server"'
  );
  if (tickerPath) {
    response.headers.append("Link", `</api/public/t/${tickerPath[1].toUpperCase()}?format=markdown>; rel="alternate"; type="text/markdown"`);
  }
  return response;
}

export const config = {
  matcher: ["/", "/t/:path*", "/sectors/:path*", "/lenses/:path*", "/compare/:path*", "/feed"],
};
