const routes = [
  "home", "company", "sbc", "valuation", "filings", "feed", "sectors",
  "lenses", "compare", "embed", "arena", "developer", "research",
] as const;
const sources = [
  "direct", "same_site", "search", "chatgpt", "perplexity", "claude",
  "gemini", "reddit", "x", "substack", "other",
] as const;
const events = ["landing_view", "page_view", "chart_copy", "chart_download", "embed_copy", "embed_click"] as const;

type RouteGroup = typeof routes[number];
type SourceGroup = typeof sources[number];
type DistributionEvent = typeof events[number];

const routeGroups = new Set<string>(routes);
const sourceGroups = new Set<string>(sources);
const eventNames = new Set<string>(events);

export function distributionRoute(path: string): RouteGroup | null {
  if (path === "/") return "home";
  const [, root, child, subpage] = path.split("/");
  if (root === "t" && child) {
    if (subpage === "sbc" || subpage === "valuation" || subpage === "filings") return subpage;
    return "company";
  }
  if (root === "docs" || root === "developers" || root === "mcp") return "developer";
  if (root === "feed" || root === "sectors" || root === "lenses" || root === "compare" ||
      root === "arena" || root === "embed" || root === "filings" || root === "research") return root;
  return null;
}

export function distributionSource(referrer: string, ownHost: string): SourceGroup {
  if (!referrer) return "direct";
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "other";
  }
  if (host === ownHost.replace(/^www\./, "")) return "same_site";
  if (host === "chatgpt.com" || host === "chat.openai.com") return "chatgpt";
  if (host === "perplexity.ai") return "perplexity";
  if (host === "claude.ai") return "claude";
  if (host === "gemini.google.com") return "gemini";
  if (host === "reddit.com" || host === "old.reddit.com") return "reddit";
  if (host === "t.co" || host === "x.com" || host === "twitter.com") return "x";
  if (host === "substack.com" || host.endsWith(".substack.com")) return "substack";
  if (/^google\.[a-z.]+$/.test(host) || ["bing.com", "duckduckgo.com", "search.yahoo.com"].includes(host)) return "search";
  return "other";
}

export function parseDistributionEvent(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const { route, source, event } = value as Record<string, unknown>;
  if (typeof route !== "string" || !routeGroups.has(route) ||
      typeof source !== "string" || !sourceGroups.has(source) ||
      typeof event !== "string" || !eventNames.has(event)) return null;
  return { route, source, event };
}

export function trackDistribution(event: DistributionEvent) {
  if (("globalPrivacyControl" in navigator && navigator.globalPrivacyControl === true) ||
      navigator.doNotTrack === "1") return;
  const route = distributionRoute(window.location.pathname);
  if (!route) return;
  void fetch("/api/distribution", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ route, source: distributionSource(document.referrer, location.hostname), event }),
    credentials: "omit",
    referrerPolicy: "no-referrer",
    keepalive: true,
  }).catch(() => undefined);
}
