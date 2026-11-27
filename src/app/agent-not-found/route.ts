import { AGENT_DISCOVERY_LINKS, AMBER_NOT_FOUND_MARKDOWN } from "@/lib/agent-readiness";

export function GET() {
  return new Response(AMBER_NOT_FOUND_MARKDOWN, {
    status: 404,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
      Vary: "Accept",
      Link: AGENT_DISCOVERY_LINKS,
    },
  });
}
