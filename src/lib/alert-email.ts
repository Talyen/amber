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

export interface FilingDiffHighlight {
  materiality: string;
  section: string;
  headline: string;
  summary: string;
}

export function renderFilingAlertHtml(params: {
  companyName: string;
  ticker: string;
  filingType: string;
  filingDate: string;
  accession: string;
  companyUrl: string;
  unsubscribeUrl: string;
  highlights?: FilingDiffHighlight[];
}) {
  const ticker = escapeAlertHtml(params.ticker);
  const filingType = escapeAlertHtml(params.filingType);
  const filingDate = escapeAlertHtml(params.filingDate);
  const accession = escapeAlertHtml(params.accession);
  const companyUrl = escapeAlertHtml(params.companyUrl);
  const unsubscribe = escapeAlertHtml(params.unsubscribeUrl);
  const highlights = (params.highlights ?? []).slice(0, 3);

  const highlightsBlock =
    highlights.length > 0
      ? `
        <div style="margin:16px 0;padding:14px 16px;background:#FAF8F5;border:1px solid #E7E2D8;border-radius:8px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;color:#B45309;margin-bottom:8px;">FILING DIFF RADAR HIGHLIGHTS</div>
          ${highlights
            .map(
              (h) => `
              <div style="margin-bottom:10px;">
                <div style="font-size:12px;font-weight:600;color:#151517;">
                  [${escapeAlertHtml(h.materiality)}] ${escapeAlertHtml(h.headline)}
                </div>
                <div style="font-size:12px;color:#52525B;margin-top:2px;">
                  ${escapeAlertHtml(h.summary)}
                </div>
              </div>`
            )
            .join("")}
        </div>`
      : "";

  return `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#151517;">
      <div style="font-size:12px;font-weight:600;letter-spacing:0.06em;color:#B45309;">AMBER / SEC FILING ALERT</div>
      <h2 style="margin:8px 0 4px;font-size:20px;">${escapeAlertHtml(params.companyName)} (${ticker})</h2>
      <p style="margin:0 0 12px;font-size:14px;color:#52525B;">
        A new <strong>${filingType}</strong> was filed on ${filingDate} (EDGAR ${accession}).
      </p>
      ${highlightsBlock}
      <a href="${companyUrl}" style="display:inline-block;padding:10px 16px;background:#B45309;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">
        Open ${ticker} in Amber →
      </a>
      <p style="margin:20px 0 0;font-size:11px;color:#71717A;">
        <a href="${unsubscribe}" style="color:#B45309;">Unsubscribe from ${ticker} filing alerts</a>.
      </p>
    </div>
  `;
}

export interface WatchlistDigestItem {
  ticker: string;
  kind: "10-K/10-Q Diff" | "8-K Event" | "Form 4 Buy" | "Valuation Target";
  date: string;
  headline: string;
  detail: string;
}

export function renderWatchlistDigestHtml(params: {
  dateLabel: string;
  siteUrl: string;
  items: WatchlistDigestItem[];
}) {
  const feedUrl = escapeAlertHtml(new URL("/feed", params.siteUrl).href);
  const settingsUrl = escapeAlertHtml(new URL("/settings", params.siteUrl).href);

  const rows = params.items
    .slice(0, 15)
    .map((item) => {
      const tickerUrl = escapeAlertHtml(new URL(`/t/${encodeURIComponent(item.ticker)}`, params.siteUrl).href);
      return `
        <div style="padding:12px 0;border-bottom:1px solid #E7E2D8;">
          <div style="font-size:11px;font-weight:600;color:#B45309;letter-spacing:0.04em;">
            <a href="${tickerUrl}" style="color:#B45309;text-decoration:none;">${escapeAlertHtml(item.ticker)}</a>
            &nbsp;·&nbsp;${escapeAlertHtml(item.kind)}&nbsp;·&nbsp;${escapeAlertHtml(item.date)}
          </div>
          <div style="font-size:14px;font-weight:600;color:#151517;margin-top:3px;">
            ${escapeAlertHtml(item.headline)}
          </div>
          <div style="font-size:12px;color:#52525B;margin-top:2px;">
            ${escapeAlertHtml(item.detail)}
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:580px;margin:0 auto;padding:24px;color:#151517;">
      <div style="font-size:12px;font-weight:600;letter-spacing:0.06em;color:#B45309;">AMBER / WATCHLIST DIGEST</div>
      <h2 style="margin:8px 0 4px;font-size:20px;">Watchlist Signals · ${escapeAlertHtml(params.dateLabel)}</h2>
      <p style="margin:0 0 12px;font-size:13px;color:#52525B;">
        ${params.items.length} new SEC signal${params.items.length === 1 ? "" : "s"} across your starred companies.
      </p>
      ${rows}
      <div style="margin-top:18px;">
        <a href="${feedUrl}" style="display:inline-block;padding:10px 16px;background:#B45309;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">
          Open Signal Feed →
        </a>
      </div>
      <p style="margin:20px 0 0;font-size:11px;color:#71717A;">
        Manage your digest preferences in <a href="${settingsUrl}" style="color:#B45309;">Amber Settings</a>.
      </p>
    </div>
  `;
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
