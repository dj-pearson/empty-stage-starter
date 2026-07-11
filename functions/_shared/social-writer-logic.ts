/**
 * Pure logic for the social post agent (US-504).
 * DB-free so the per-network daily rate cap is unit-testable.
 */

export const SOCIAL_NETWORKS = ['instagram', 'pinterest'] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

/** Max posts per network per day. */
export const PER_NETWORK_DAILY_CAP = 1;

/**
 * Which networks are still under the daily cap, given how many were already
 * drafted/posted per network today.
 */
export function networksUnderCap(
  networks: readonly string[],
  sentTodayByNetwork: Record<string, number>,
  cap: number = PER_NETWORK_DAILY_CAP,
): string[] {
  return networks.filter((n) => (sentTodayByNetwork[n] ?? 0) < cap);
}

/** Tally per-network counts from today's social approval payloads. */
export function tallyNetworks(approvalNetworkLists: string[][]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const list of approvalNetworkLists) {
    for (const n of list) out[n] = (out[n] ?? 0) + 1;
  }
  return out;
}
