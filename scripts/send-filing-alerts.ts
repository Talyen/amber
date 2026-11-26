/** Send periodic filing alerts and watchlist digests to confirmed subscribers. */
import { isFreshPriceDate } from "../src/lib/market-price.ts";
import { buildScenarioBasis } from "../src/lib/finance.ts";
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import {
  alertSubscriptions,
  annualFinancials,
  companies,
  filingDiffs,
  insiderTrades,
  user,
  userAlertPreferences,
  userValuationPresets,
  userWatchlists,
} from "../src/db/schema.ts";
import {
  alertActionUrl,
  canRetryAlertDelivery,
  defaultAlertSender,
  renderFilingAlertHtml,
  renderWatchlistDigestHtml,
  sendAlertEmail,
  type WatchlistDigestItem,
} from "../src/lib/alert-email.ts";
import {
  evaluateValuationTriggers,
  type PresetValuationEntry,
  type SavedScenarioLens,
} from "../src/lib/valuation-presets.ts";

const MATERIALITY_RANK: Record<string, number> = { High: 0, Medium: 1, Watch: 2 };

export async function dispatchFilingAlerts({
  databaseUrl = process.env.DATABASE_URL,
  resendKey = process.env.RESEND_API_KEY,
  fromEmail = process.env.ALERT_FROM_EMAIL || defaultAlertSender,
  siteUrl = process.env.AMBER_PROD_URL ?? "https://amber-theta-three.vercel.app",
  wait = sleep,
  requireConfig = false,
}: {
  databaseUrl?: string;
  resendKey?: string;
  fromEmail?: string;
  siteUrl?: string;
  wait?: (ms: number) => Promise<void>;
  requireConfig?: boolean;
} = {}) {
  if (!databaseUrl || !resendKey) {
    const missing = [!databaseUrl && "DATABASE_URL", !resendKey && "RESEND_API_KEY"].filter(Boolean);
    const message = `Email dispatch requires ${missing.join(" and ")}.`;
    if (requireConfig) throw new Error(message);
    console.log(`[amber-alerts] ${message}`);
    return;
  }

  const db = drizzle(neon(databaseUrl));
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const due = await db
    .select({
      id: alertSubscriptions.id,
      email: alertSubscriptions.email,
      ticker: alertSubscriptions.ticker,
      token: alertSubscriptions.unsubscribeToken,
      name: companies.name,
      filingType: companies.lastFilingType,
      filingDate: companies.lastFilingDate,
      accession: companies.lastFilingAccession,
    })
    .from(alertSubscriptions)
    .innerJoin(companies, eq(alertSubscriptions.ticker, companies.ticker))
    .where(and(
      gte(companies.lastFilingDate, cutoff),
      isNull(alertSubscriptions.confirmationExpiresAt),
      sql`${alertSubscriptions.lastNotifiedAccession} is distinct from ${companies.lastFilingAccession}`,
    ));

  let sent = 0;
  let failed = 0;
  for (const item of due) {
    try {
      const subscription = and(
        eq(alertSubscriptions.id, item.id),
        eq(alertSubscriptions.unsubscribeToken, item.token),
      );
      const [claim] = await db.update(alertSubscriptions).set({
        deliveryAccession: item.accession,
        deliveryStartedAt: sql`case when ${alertSubscriptions.deliveryAccession} = ${item.accession}
          then coalesce(${alertSubscriptions.deliveryStartedAt}, statement_timestamp())
          else statement_timestamp() end`,
      }).where(and(
        subscription,
        isNull(alertSubscriptions.confirmationExpiresAt),
        sql`${alertSubscriptions.lastNotifiedAccession} is distinct from ${item.accession}`,
        sql`exists (select 1 from ${companies}
          where ${companies.ticker} = ${item.ticker} and ${companies.lastFilingAccession} = ${item.accession})`,
      )).returning({ startedAt: alertSubscriptions.deliveryStartedAt });

      if (!claim) continue;
      // A response can be lost after Resend accepts a message. Stop before its key expires.
      if (!claim.startedAt || !canRetryAlertDelivery(claim.startedAt)) {
        console.warn(`[amber-alerts] ${item.ticker} filing ${item.accession} has an unresolved delivery outside the retry window.`);
        failed++;
        continue;
      }

      // Fetch any extracted Filing Diff Radar highlights for this ticker + accession (best-effort)
      let highlights: Array<{ materiality: string; section: string; headline: string; summary: string }> = [];
      try {
        const diffs = await db
          .select({
            materiality: filingDiffs.materiality,
            section: filingDiffs.section,
            headline: filingDiffs.headline,
            summary: filingDiffs.summary,
          })
          .from(filingDiffs)
          .where(and(
            eq(filingDiffs.ticker, item.ticker),
            eq(filingDiffs.accessionNumber, item.accession),
          ))
          .limit(8);

        highlights = diffs
          .sort((a, b) => (MATERIALITY_RANK[a.materiality] ?? 9) - (MATERIALITY_RANK[b.materiality] ?? 9))
          .slice(0, 3);
      } catch {
        highlights = [];
      }

      const unsubscribe = alertActionUrl(siteUrl, "unsubscribe", item.token);
      const companyUrl = new URL(`/t/${encodeURIComponent(item.ticker)}`, siteUrl).href;
      await sendAlertEmail(resendKey, `filing-alert/${item.token}/${item.accession}`, {
        from: fromEmail,
        to: [item.email],
        subject: `Amber Alert: ${item.ticker} filed a new ${item.filingType} (${item.filingDate})`,
        html: renderFilingAlertHtml({
          companyName: item.name,
          ticker: item.ticker,
          filingType: item.filingType,
          filingDate: item.filingDate,
          accession: item.accession,
          companyUrl,
          unsubscribeUrl: unsubscribe,
          highlights,
        }),
      }, wait);

      for (let attempt = 0; ; attempt++) {
        try {
          await db.update(alertSubscriptions)
            .set({ lastNotifiedAccession: item.accession, deliveryAccession: null, deliveryStartedAt: null })
            .where(and(subscription, eq(alertSubscriptions.deliveryAccession, item.accession)));
          break;
        } catch {
          if (attempt >= 2) throw new Error("Could not record accepted delivery");
          await wait(500 * 2 ** attempt);
        }
      }
      sent++;
    } catch (error) {
      failed++;
      const detail = error instanceof Error && !("query" in error) ? error.message : "Database error";
      console.warn(`[amber-alerts] ${item.ticker} filing ${item.accession} delivery failed: ${detail}.`);
    }
  }

  console.log(`[amber-alerts] Dispatched ${sent}/${due.length} due filing alerts (${failed} unresolved).`);

  // Dispatch daily Watchlist Digests for opted-in verified users
  let digestsSent = 0;
  let digestFailures = 0;
  const digestCooldown = new Date(Date.now() - 20 * 60 * 60 * 1000);
  const digestCutoffDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const todayIso = new Date().toISOString().slice(0, 10);

  const subscribers = await db
    .select({
      userId: userAlertPreferences.userId,
      email: user.email,
      emailVerified: user.emailVerified,
      includeFilingDiffs: userAlertPreferences.includeFilingDiffs,
      includeForm4Buys: userAlertPreferences.includeForm4Buys,
      includeForm8k: userAlertPreferences.includeForm8k,
      includeValuationTriggers: userAlertPreferences.includeValuationTriggers,
      valuationIrrThreshold: userAlertPreferences.valuationIrrThreshold,
      lastDigestSentAt: userAlertPreferences.lastDigestSentAt,
    })
    .from(userAlertPreferences)
    .innerJoin(user, eq(userAlertPreferences.userId, user.id))
    .where(and(
      eq(userAlertPreferences.watchlistDigest, true),
      eq(user.emailVerified, true),
    ));

  for (const sub of subscribers) {
    if (sub.lastDigestSentAt && sub.lastDigestSentAt > digestCooldown) continue;
    try {
      const watchedRows = await db
        .select({ ticker: userWatchlists.ticker })
        .from(userWatchlists)
        .where(eq(userWatchlists.userId, sub.userId));
      const tickers = watchedRows.map((r) => r.ticker);

      const items: WatchlistDigestItem[] = [];
      const triggeredPresetIds: string[] = [];

      if (sub.includeValuationTriggers) {
        const presetRows = await db
          .select({
            id: userValuationPresets.id,
            ticker: userValuationPresets.ticker,
            lens: userValuationPresets.lens,
            revGrowth: userValuationPresets.revGrowth,
            targetMargin: userValuationPresets.targetMargin,
            exitMultiple: userValuationPresets.exitMultiple,
            thesisNote: userValuationPresets.thesisNote,
            lastValuationAlertAt: userValuationPresets.lastValuationAlertAt,
            updatedAt: userValuationPresets.updatedAt,
          })
          .from(userValuationPresets)
          .where(eq(userValuationPresets.userId, sub.userId));

        if (presetRows.length > 0) {
          const presetTickers = presetRows.map((p) => p.ticker);
          const companyRows = await db
            .select({
              ticker: companies.ticker,
              price: companies.price,
              priceAsOf: companies.priceAsOf,
              sector: companies.sector,
              cashAndEquiv: companies.cashAndEquiv,
              totalDebt: companies.totalDebt,
            })
            .from(companies)
            .where(inArray(companies.ticker, presetTickers));

          const annualRows = await db
            .select({
              ticker: annualFinancials.ticker,
              fiscalYear: annualFinancials.fiscalYear,
              dilutedShares: annualFinancials.dilutedShares,
              revenue: annualFinancials.revenue,
              operatingCashFlow: annualFinancials.operatingCashFlow,
              capex: annualFinancials.capex,
              sbc: annualFinancials.sbc,
              operatingIncome: annualFinancials.operatingIncome,
              netIncome: annualFinancials.netIncome,
            })
            .from(annualFinancials)
            .where(inArray(annualFinancials.ticker, presetTickers))
            .orderBy(asc(annualFinancials.sortOrder));

          const annualsByTicker = new Map<string, typeof annualRows>();
          for (const row of annualRows) {
            const annuals = annualsByTicker.get(row.ticker) ?? [];
            annuals.push(row);
            annualsByTicker.set(row.ticker, annuals);
          }

          const entriesByTicker = new Map<string, PresetValuationEntry>();
          for (const company of companyRows) {
            const annuals = annualsByTicker.get(company.ticker);
            if (annuals?.length && isFreshPriceDate(company.priceAsOf)) {
              entriesByTicker.set(company.ticker, {
                ticker: company.ticker,
                scenarioBasis: buildScenarioBasis({ ...company, annuals }),
              });
            }
          }

          const hits = evaluateValuationTriggers(
            presetRows.map((p) => ({
              id: p.id,
              ticker: p.ticker,
              lens: (p.lens === "ebit" || p.lens === "pe" ? p.lens : "fcf") as SavedScenarioLens,
              revGrowth: p.revGrowth,
              targetMargin: p.targetMargin,
              exitMultiple: p.exitMultiple,
              thesisNote: p.thesisNote,
              lastValuationAlertAt: p.lastValuationAlertAt,
              updatedAt: p.updatedAt.toISOString(),
            })),
            entriesByTicker,
            sub.valuationIrrThreshold
          );

          for (const hit of hits.slice(0, 6)) {
            triggeredPresetIds.push(hit.presetId);
            items.push({
              ticker: hit.ticker,
              kind: "Valuation Target",
              date: todayIso,
              headline: `${hit.ticker} at $${hit.price.toFixed(2)} implies +${hit.irrPct.toFixed(1)}%/yr (Fair Value $${hit.fairValueToday.toFixed(2)})`,
              detail: hit.thesisNote
                ? `Your ${hit.lens.toUpperCase()} thesis crossed your ${sub.valuationIrrThreshold}% IRR threshold — "${hit.thesisNote}"`
                : `Your saved ${hit.lens.toUpperCase()} thesis crossed your ${sub.valuationIrrThreshold}% IRR target.`,
            });
          }
        }
      }

      if (tickers.length > 0 && (sub.includeFilingDiffs || sub.includeForm8k)) {
        const recentDiffs = await db
          .select({
            ticker: filingDiffs.ticker,
            filingType: filingDiffs.filingType,
            filingDate: filingDiffs.filingDate,
            headline: filingDiffs.headline,
            summary: filingDiffs.summary,
            materiality: filingDiffs.materiality,
          })
          .from(filingDiffs)
          .where(and(
            inArray(filingDiffs.ticker, tickers),
            gte(filingDiffs.filingDate, digestCutoffDate),
          ))
          .orderBy(desc(filingDiffs.filingDate))
          .limit(20);

        for (const d of recentDiffs) {
          const is8k = d.filingType === "8-K";
          if (is8k && !sub.includeForm8k) continue;
          if (!is8k && !sub.includeFilingDiffs) continue;
          items.push({
            ticker: d.ticker,
            kind: is8k ? "8-K Event" : "10-K/10-Q Diff",
            date: d.filingDate,
            headline: `[${d.materiality}] ${d.headline}`,
            detail: d.summary,
          });
        }
      }

      if (tickers.length > 0 && sub.includeForm4Buys) {
        const recentBuys = await db
          .select({
            ticker: insiderTrades.ticker,
            filingDate: insiderTrades.filingDate,
            insiderName: insiderTrades.insiderName,
            insiderTitle: insiderTrades.insiderTitle,
            totalValue: insiderTrades.totalValue,
          })
          .from(insiderTrades)
          .where(and(
            inArray(insiderTrades.ticker, tickers),
            eq(insiderTrades.transactionType, "Buy"),
            gte(insiderTrades.filingDate, digestCutoffDate),
          ))
          .orderBy(desc(insiderTrades.totalValue))
          .limit(10);

        for (const b of recentBuys) {
          const valStr = b.totalValue >= 1 ? `$${b.totalValue.toFixed(2)}M` : `$${Math.round(b.totalValue * 1000)}K`;
          items.push({
            ticker: b.ticker,
            kind: "Form 4 Buy",
            date: b.filingDate,
            headline: `${b.insiderName} (${b.insiderTitle}) bought ${valStr}`,
            detail: `Open-market Form 4 purchase filed ${b.filingDate}.`,
          });
        }
      }

      if (items.length === 0) continue;

      await sendAlertEmail(resendKey, `watchlist-digest/${sub.userId}/${todayIso}`, {
        from: fromEmail,
        to: [sub.email],
        subject: `Amber Watchlist Digest: ${items.length} new signal${items.length === 1 ? "" : "s"} (${todayIso})`,
        html: renderWatchlistDigestHtml({
          dateLabel: todayIso,
          siteUrl,
          items,
        }),
      }, wait);

      const sentAt = new Date();
      const recordDigest = db.update(userAlertPreferences)
        .set({ lastDigestSentAt: sentAt })
        .where(eq(userAlertPreferences.userId, sub.userId));
      for (let attempt = 0; ; attempt++) {
        try {
          if (triggeredPresetIds.length > 0) {
            await db.batch([
              recordDigest,
              db.update(userValuationPresets)
                .set({ lastValuationAlertAt: sentAt })
                .where(inArray(userValuationPresets.id, triggeredPresetIds)),
            ]);
          } else {
            await recordDigest;
          }
          break;
        } catch {
          if (attempt >= 2) throw new Error("Could not record accepted digest delivery");
          await wait(500 * 2 ** attempt);
        }
      }
      digestsSent++;
    } catch (error) {
      digestFailures++;
      const detail = error instanceof Error && !("query" in error) ? error.message : "Database error";
      console.warn(`[amber-alerts] Watchlist digest delivery failed: ${detail}.`);
    }
  }
  if (subscribers.length > 0) {
    console.log(`[amber-alerts] Dispatched ${digestsSent}/${subscribers.length} watchlist digests.`);
  }

  const deliveryErrors = [
    failed > 0 && `${failed} filing alert deliveries need attention.`,
    digestFailures > 0 && `${digestFailures} watchlist digest failures need attention.`,
  ].filter(Boolean);
  if (deliveryErrors.length > 0) throw new Error(deliveryErrors.join(" "));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await dispatchFilingAlerts({ requireConfig: process.argv.includes("--require-config") });
}
