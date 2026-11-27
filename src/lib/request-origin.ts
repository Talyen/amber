export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") return false;
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const protocol = request.headers.get("x-forwarded-proto") === "https" ? "https:" : url.protocol;
  return origin === `${protocol}//${host}`;
}
