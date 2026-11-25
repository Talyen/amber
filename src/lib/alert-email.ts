import { setTimeout as sleep } from "node:timers/promises";

const ALERT_DELIVERY_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

export const defaultAlertSender = "Amber Alerts <alerts@amber.finance>";

export function filingAlertEmailIsVerified(
  email: string,
  account?: { email: string; emailVerified: boolean } | null,
) {
  return account?.emailVerified === true && account.email.trim().toLowerCase() === email;
}

export function canRetryAlertDelivery(startedAt: Date, now = Date.now()) {
  return now - startedAt.getTime() < ALERT_DELIVERY_RETRY_WINDOW_MS;
}

const HTML_ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeAlertHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char as keyof typeof HTML_ENTITIES]);
}

export function alertActionUrl(site: string, action: "confirm" | "unsubscribe", token: string) {
  const url = new URL("/api/alerts/manage", site);
  url.searchParams.set("action", action);
  url.searchParams.set("token", token);
  return url.href;
}

export async function sendAlertEmail(
  apiKey: string,
  deliveryKey: string,
  message: { from: string; to: string[]; subject: string; html: string },
  wait: (ms: number) => Promise<void> = sleep,
) {
  const body = JSON.stringify(message);
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": deliveryKey,
        },
        body,
        signal: AbortSignal.timeout(12_000),
      });
    } catch (error) {
      if (attempt >= 2) throw error;
      await wait(500 * 2 ** attempt);
      continue;
    }
    if (response.ok) return;
    const error: { name?: string } | null = response.status === 409 && attempt < 2
      ? await response.json().catch(() => null)
      : null;
    const retryable = response.status === 429 || response.status >= 500 ||
      error?.name === "concurrent_idempotent_requests";
    if (!retryable || attempt >= 2) {
      throw new Error(`Email delivery returned HTTP ${response.status}`);
    }
    await wait(500 * 2 ** attempt);
  }
}
