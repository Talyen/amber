/**
 * Clean monetization & entitlement boundary for Amber.
 * v1 ships completely open for the 6-ticker pilot; wiring Stripe or Lemon Squeezy
 * later only requires resolving `UserTier` from a session/webhook.
 */
export type UserTier = "free" | "pro";

export interface Entitlements {
  tier: UserTier;
  maxHistoryYears: number;
  canExportCleanPng: boolean;
  canSubscribeFilingAlerts: boolean;
  maxWatchlistTickers: number;
}

export function getEntitlements(tier: UserTier = "free"): Entitlements {
  if (tier === "pro") {
    return {
      tier: "pro",
      maxHistoryYears: 10,
      canExportCleanPng: true,
      canSubscribeFilingAlerts: true,
      maxWatchlistTickers: 100,
    };
  }

  return {
    tier: "free",
    maxHistoryYears: 5,
    canExportCleanPng: true, // Watermarked PNGs are free to maximize organic sharing
    canSubscribeFilingAlerts: false,
    maxWatchlistTickers: 5,
  };
}
