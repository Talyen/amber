import { confirmAlert, unsubscribeAlert } from "@/data/alert-subscriptions";
import { getDb } from "@/db";
import { escapeAlertHtml } from "@/lib/alert-email";

const TOKEN_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function page(title: string, content = "", status = 200) {
  return new Response(`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${title} | Amber</title>
<style>body{font:1rem system-ui;max-width:30rem;margin:12vh auto;padding:0 1rem}button{font:inherit;padding:.5rem 1rem}</style>
<main><h1>${title}</h1>${content}<p><a href="/">Back to Amber</a></p></main></html>`, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const action = query.get("action");
  const token = query.get("token") ?? "";
  if ((action !== "confirm" && action !== "unsubscribe") || !TOKEN_RE.test(token)) {
    return page("Invalid filing alert link", "", 400);
  }

  // Require an explicit POST so automated email link previews cannot change subscriptions.
  const button = action === "confirm" ? "Confirm subscription" : "Unsubscribe";
  return page("Amber filing alerts", `<form method="post" action="/api/alerts/manage">
    <input type="hidden" name="action" value="${action}">
    <input type="hidden" name="token" value="${escapeAlertHtml(token)}">
    <button type="submit">${button}</button>
  </form>`);
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const action = form?.get("action");
  const token = form?.get("token");
  if ((action !== "confirm" && action !== "unsubscribe") || typeof token !== "string" || !TOKEN_RE.test(token)) {
    return page("Invalid filing alert link", "", 400);
  }

  const db = getDb();
  if (!db) return page("Filing alerts are temporarily unavailable", "", 503);

  if (action === "confirm") {
    return await confirmAlert(db, token)
      ? page("Filing alerts confirmed")
      : page("This confirmation link has expired or was already used", "", 410);
  }

  await unsubscribeAlert(db, token);
  return page("Unsubscribed from this filing alert");
}
