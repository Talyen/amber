import { apiError, servePublicApi } from "@/lib/public-api";
import { getPublicLensContext } from "@/data/public-market";
import { getSearchIndex } from "@/data/repository";
import { parseAgentScreenerFilters, screenCompaniesForAgent } from "@/lib/agentic-data";
import { SITE_URL } from "@/lib/site";

export async function GET(request: Request) {
  return servePublicApi(request, async () => {
    const { searchParams } = new URL(request.url);
    const parsed = parseAgentScreenerFilters((key) => searchParams.get(key) ?? undefined, "query");
    if ("error" in parsed) {
      return apiError(400, "invalid_screener_filter", parsed.error, "Check /openapi.json for supported filters and numeric bounds.");
    }
    const { filters } = parsed;
    const [entries, lensContext] = await Promise.all([getSearchIndex(), getPublicLensContext(filters.lens)]);
    const result = screenCompaniesForAgent(entries, filters, lensContext);

    return Response.json({
        ...result,
        explore_url: SITE_URL,
        attribution: `SEC EDGAR verified screener via Amber (${SITE_URL})`,
    });
  });
}

export {
  publicApiMethodNotAllowed as POST,
  publicApiMethodNotAllowed as PUT,
  publicApiMethodNotAllowed as PATCH,
  publicApiMethodNotAllowed as DELETE,
  publicApiOptions as OPTIONS,
} from "@/lib/public-api";
