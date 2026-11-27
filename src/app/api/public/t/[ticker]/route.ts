import { apiError, servePublicApi } from "@/lib/public-api";
import { getCompanySnapshot, getInsiderTradesForTickers } from "@/data/repository";
import {
  buildPublicCompanyPayload,
  formatCompanyMarkdown,
} from "@/lib/agentic-data";
import { prefersMarkdown } from "@/lib/http-accept";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  return servePublicApi(request, async () => {
    const { ticker } = await params;
    const company = await getCompanySnapshot(ticker);
    if (!company) {
      return apiError(404, "ticker_not_found", `Ticker ${ticker.toUpperCase()} not found in Amber coverage.`,
        "Verify the ticker symbol or query /api/v1/screener for covered companies.");
    }

    const insiderTrades = await getInsiderTradesForTickers([company.ticker], 5, true);
    const payload = buildPublicCompanyPayload(company, insiderTrades);
    const format = new URL(request.url).searchParams.get("format");
    const wantsMarkdown = format === "markdown" ||
      (format !== "json" && prefersMarkdown(request.headers.get("accept")));
    const headers = {
      Link: `</t/${company.ticker}>; rel="canonical", </llms.txt>; rel="describedby"; type="text/markdown"`,
    };

    if (wantsMarkdown) {
      return new Response(formatCompanyMarkdown(payload), {
        headers: { ...headers, "Content-Type": "text/markdown; charset=utf-8" },
      });
    }

    return Response.json(payload, { headers });
  }, "Accept");
}

export {
  publicApiMethodNotAllowed as POST,
  publicApiMethodNotAllowed as PUT,
  publicApiMethodNotAllowed as PATCH,
  publicApiMethodNotAllowed as DELETE,
  publicApiOptions as OPTIONS,
} from "@/lib/public-api";
