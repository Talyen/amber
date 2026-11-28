"use client";

import Link from "next/link";
import { GitCompareArrows } from "lucide-react";
import type { SearchIndexEntry } from "@/data/search-index";
import type { SectorBenchmark } from "@/data/repository";
import {
  formatCurrencyCompact,
  formatPct,
  isFinancialInstitution,
  isReit,
} from "@/lib/finance";

export interface CurrentCompanyPeerRow {
  ticker: string;
  name: string;
  sector: string;
  valuationBusiness?: SearchIndexEntry["valuationBusiness"];
  marketCap: number;
  revenueCagr: number;
  trueFcfMargin: number | null;
  sbcPctRevenue: number;
  netDilutionCagr: number;
  impliedCagr: number | null;
  priceToTbv?: number | null;
  rotcePct?: number | null;
  priceToFfo?: number | null;
  shareholderYieldPct?: number | null;
}

interface SectorPeersTableProps {
  current: CurrentCompanyPeerRow;
  peers: SearchIndexEntry[];
  sectorBenchmark?: SectorBenchmark | null;
}

export function SectorPeersTable({
  current,
  peers,
  sectorBenchmark = null,
}: SectorPeersTableProps) {
  if (peers.length === 0) return null;

  const isReitCompany = isReit(current);
  const isBankOrFin = !isReitCompany && isFinancialInstitution(current);

  const compareTickers = [current.ticker, ...peers.slice(0, 3).map((p) => p.ticker)];
  const rows: Array<{
    ticker: string;
    name: string;
    isCurrent: boolean;
    marketCap: number;
    revenueCagr: number | null;
    trueFcfMargin: number | null;
    sbcPctRevenue: number;
    netDilutionCagr: number;
    impliedCagr: number | null;
    priceToTbv: number | null;
    rotcePct: number | null;
    priceToFfo: number | null;
    shareholderYieldPct: number | null;
  }> = [
    {
      ticker: current.ticker,
      name: current.name,
      isCurrent: true,
      marketCap: current.marketCap,
      revenueCagr: current.revenueCagr,
      trueFcfMargin: current.trueFcfMargin,
      sbcPctRevenue: current.sbcPctRevenue,
      netDilutionCagr: current.netDilutionCagr,
      impliedCagr: current.impliedCagr,
      priceToTbv: current.priceToTbv ?? null,
      rotcePct: current.rotcePct ?? null,
      priceToFfo: current.priceToFfo ?? null,
      shareholderYieldPct: current.shareholderYieldPct ?? null,
    },
    ...peers.map((p) => ({
      ticker: p.ticker,
      name: p.name,
      isCurrent: false,
      marketCap: p.marketCap,
      revenueCagr: p.revenueCagr ?? null,
      trueFcfMargin: p.scenarioBasis.equityLensOnly ? null : p.trueFcfMargin,
      sbcPctRevenue: p.sbcPctRevenue,
      netDilutionCagr: p.netDilutionCagr,
      impliedCagr: p.impliedCagr,
      priceToTbv: p.priceToTbv ?? null,
      rotcePct: p.rotcePct ?? null,
      priceToFfo: p.priceToFfo ?? null,
      shareholderYieldPct: p.shareholderYieldPct ?? null,
    })),
  ];

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          {current.sector} Peers
        </h3>
        <Link
          href={`/compare?t=${compareTickers.join(",")}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--amber)] transition-opacity hover:opacity-90"
        >
          <GitCompareArrows className="h-3.5 w-3.5" aria-hidden="true" />
          Compare
        </Link>
      </div>

      <div
        tabIndex={0}
        role="region"
        aria-label={`${current.sector} peer comparison`}
        className="amber-table-wrapper mt-3.5"
      >
        <table className="amber-table">
          <thead>
            <tr>
              <th scope="col">Company</th>
              <th scope="col">Mkt Cap</th>
              <th scope="col">Rev CAGR</th>
              {isReitCompany ? (
                <>
                  <th scope="col">Price / FFO</th>
                  <th scope="col">Sh. Yield</th>
                  <th scope="col">Share Chg</th>
                </>
              ) : isBankOrFin ? (
                <>
                  <th scope="col">P/TBV</th>
                  <th scope="col">ROTCE</th>
                  <th scope="col">Sh. Yield</th>
                  <th scope="col">Share Chg</th>
                </>
              ) : (
                <>
                  <th scope="col">True FCF %</th>
                  <th scope="col">Stock Comp %</th>
                  <th scope="col">Share Chg</th>
                  <th scope="col">Priced-In</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.ticker}
                className={row.isCurrent ? "bg-[var(--amber-soft)]/50" : undefined}
              >
                <th scope="row">
                  {row.isCurrent ? (
                    <div className="inline-flex items-center gap-2">
                      <span className="font-mono-num w-12 font-bold text-[var(--amber)]">
                        {row.ticker}
                      </span>
                      <span className="truncate font-semibold text-[var(--text-primary)]">
                        {row.name}
                      </span>
                      <span className="rounded bg-[var(--amber-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]">
                        Current
                      </span>
                    </div>
                  ) : (
                    <Link
                      href={`/t/${row.ticker}`}
                      className="group inline-flex items-center gap-2 hover:text-[var(--amber)]"
                    >
                      <span className="font-mono-num w-12 font-semibold text-[var(--amber)]">
                        {row.ticker}
                      </span>
                      <span className="truncate font-medium text-[var(--text-primary)] group-hover:text-[var(--amber)]">
                        {row.name}
                      </span>
                    </Link>
                  )}
                </th>
                <td data-label="Mkt Cap" className="font-mono-num">
                  {formatCurrencyCompact(row.marketCap)}
                </td>
                <td data-label="Rev CAGR" className="font-mono-num">
                  {formatPct(row.revenueCagr, true)}
                </td>
                {isReitCompany ? (
                  <>
                    <td data-label="Price / FFO" className="font-mono-num font-semibold text-[var(--amber)]">
                      {row.priceToFfo !== null ? `${row.priceToFfo.toFixed(1)}×` : "—"}
                    </td>
                    <td data-label="Shareholder Yield" className="font-mono-num">
                      {formatPct(row.shareholderYieldPct, true)}
                    </td>
                    <td data-label="Dilution (4Y)" className="font-mono-num">
                      {formatPct(row.netDilutionCagr, true)}
                    </td>
                  </>
                ) : isBankOrFin ? (
                  <>
                    <td data-label="P/TBV" className="font-mono-num font-semibold text-[var(--amber)]">
                      {row.priceToTbv !== null ? `${row.priceToTbv.toFixed(2)}×` : "—"}
                    </td>
                    <td data-label="ROTCE" className="font-mono-num">
                      {formatPct(row.rotcePct)}
                    </td>
                    <td data-label="Shareholder Yield" className="font-mono-num">
                      {formatPct(row.shareholderYieldPct, true)}
                    </td>
                    <td data-label="Dilution (4Y)" className="font-mono-num">
                      {formatPct(row.netDilutionCagr, true)}
                    </td>
                  </>
                ) : (
                  <>
                    <td data-label="True FCF Margin" className="font-mono-num">
                      {formatPct(row.trueFcfMargin)}
                    </td>
                    <td data-label="SBC / Rev" className="font-mono-num text-[var(--sbc)]">
                      {formatPct(row.sbcPctRevenue)}
                    </td>
                    <td data-label="Dilution (4Y)" className="font-mono-num">
                      {formatPct(row.netDilutionCagr, true)}
                    </td>
                    <td data-label="Implied 10Y" className="font-mono-num font-semibold text-[var(--amber)]">
                      {formatPct(row.impliedCagr)}
                    </td>
                  </>
                )}
              </tr>
            ))}

            {!isReitCompany && !isBankOrFin && sectorBenchmark && (
              <tr className="border-t border-[var(--border-strong)] bg-[var(--surface-subtle)] text-[var(--text-secondary)]">
                <th scope="row" className="text-xs font-semibold text-[var(--text-secondary)]">
                  {current.sector} Median ({sectorBenchmark.count})
                </th>
                <td className="font-mono-num">—</td>
                <td className="font-mono-num">—</td>
                <td data-label="True FCF Margin" className="font-mono-num font-semibold">
                  {formatPct(sectorBenchmark.medianTrueFcfMargin)}
                </td>
                <td data-label="SBC / Rev" className="font-mono-num">
                  {formatPct(sectorBenchmark.medianSbcPctRevenue)}
                </td>
                <td className="font-mono-num">—</td>
                <td data-label="Implied 10Y" className="font-mono-num">
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
