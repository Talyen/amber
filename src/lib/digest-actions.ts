export const digestHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

export function digestActionUrl(site: string, action: "confirm" | "unsubscribe", token: string) {
  const url = new URL(`/api/digest-${action}`, site);
  url.searchParams.set("token", token);
  return url.href;
}

export function digestToken(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  return token && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(token) ? token : null;
}

export function digestPage(message: string, status = 200, form?: "confirm" | "unsubscribe") {
  const button = form === "confirm" ? "Confirm subscription" : "Unsubscribe";
  const input = form === "unsubscribe" ? '<input type="hidden" name="List-Unsubscribe" value="One-Click">' : "";
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Sunday Signal · Amber</title></head>
    <body><main><h1>Sunday Signal</h1><p>${message}</p>
    ${form ? `<form method="post">${input}<button type="submit">${button}</button></form>` : ""}
    <p><a href="/feed">Back to the Amber feed</a></p></main></body></html>`, {
    status,
    headers: {
      ...digestHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    },
  });
}
