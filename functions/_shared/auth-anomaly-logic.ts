/**
 * Pure anomaly detectors for the auth anomaly agent (US-510).
 *
 * DB/network-free so each detector is unit-testable against synthetic log
 * fixtures. Detection ONLY — the agent escalates evidence, it never blocks.
 */

export interface AuthEvent {
  user_id: string | null;
  email: string | null;
  ip: string | null;
  country: string | null;
  event_type: 'login_success' | 'login_failure' | 'signup' | string;
  created_at: string;
}

export interface AnomalyThresholds {
  /** Min failed logins from one IP to flag credential stuffing. */
  credStuffFailures: number;
  /** Min distinct accounts targeted from that IP. */
  credStuffAccounts: number;
  /** Min signups in the window to flag a burst. */
  signupBurst: number;
  /** Min distinct countries for one account to flag rapid geo-switching. */
  geoCountries: number;
}

export const DEFAULT_THRESHOLDS: AnomalyThresholds = {
  credStuffFailures: 20,
  credStuffAccounts: 5,
  signupBurst: 25,
  geoCountries: 2,
};

export function resolveThresholds(policy: Record<string, unknown> | null | undefined): AnomalyThresholds {
  const t = (policy?.anomaly_thresholds ?? {}) as Partial<AnomalyThresholds>;
  return {
    credStuffFailures: numOr(t.credStuffFailures, DEFAULT_THRESHOLDS.credStuffFailures),
    credStuffAccounts: numOr(t.credStuffAccounts, DEFAULT_THRESHOLDS.credStuffAccounts),
    signupBurst: numOr(t.signupBurst, DEFAULT_THRESHOLDS.signupBurst),
    geoCountries: numOr(t.geoCountries, DEFAULT_THRESHOLDS.geoCountries),
  };
}
const numOr = (v: unknown, d: number) => (typeof v === 'number' && v > 0 ? v : d);

export interface Detection {
  type: 'credential_stuffing' | 'signup_burst' | 'geo_switch';
  fingerprint: string;
  evidence: Record<string, unknown>;
}

const account = (e: AuthEvent) => e.user_id ?? e.email ?? 'unknown';

/** Credential stuffing: one IP with many failures across many accounts. */
export function detectCredentialStuffing(events: AuthEvent[], t: AnomalyThresholds): Detection[] {
  const byIp = new Map<string, { failures: number; accounts: Set<string> }>();
  for (const e of events) {
    if (e.event_type !== 'login_failure' || !e.ip) continue;
    const rec = byIp.get(e.ip) ?? { failures: 0, accounts: new Set<string>() };
    rec.failures++;
    rec.accounts.add(account(e));
    byIp.set(e.ip, rec);
  }
  const out: Detection[] = [];
  for (const [ip, rec] of byIp) {
    if (rec.failures >= t.credStuffFailures && rec.accounts.size >= t.credStuffAccounts) {
      out.push({
        type: 'credential_stuffing',
        fingerprint: `credential_stuffing:${ip}`,
        evidence: { ip, failures: rec.failures, distinctAccounts: rec.accounts.size, sampleAccounts: [...rec.accounts].slice(0, 5) },
      });
    }
  }
  return out;
}

/** Signup burst: an unusual number of signups in the window. */
export function detectSignupBurst(events: AuthEvent[], t: AnomalyThresholds): Detection[] {
  const signups = events.filter((e) => e.event_type === 'signup');
  if (signups.length < t.signupBurst) return [];
  const ips = [...new Set(signups.map((e) => e.ip).filter(Boolean))].slice(0, 8);
  return [{
    type: 'signup_burst',
    fingerprint: 'signup_burst',
    evidence: { count: signups.length, sampleIps: ips },
  }];
}

/** Rapid geo-switching: one account seen from several countries in the window. */
export function detectGeoSwitch(events: AuthEvent[], t: AnomalyThresholds): Detection[] {
  const byUser = new Map<string, { countries: Set<string>; ips: Set<string> }>();
  for (const e of events) {
    if (!e.country || (e.event_type !== 'login_success' && e.event_type !== 'login_failure')) continue;
    const key = account(e);
    const rec = byUser.get(key) ?? { countries: new Set<string>(), ips: new Set<string>() };
    rec.countries.add(e.country);
    if (e.ip) rec.ips.add(e.ip);
    byUser.set(key, rec);
  }
  const out: Detection[] = [];
  for (const [user, rec] of byUser) {
    if (rec.countries.size >= t.geoCountries) {
      out.push({
        type: 'geo_switch',
        fingerprint: `geo_switch:${user}`,
        evidence: { account: user, countries: [...rec.countries], ips: [...rec.ips].slice(0, 5) },
      });
    }
  }
  return out;
}

/** Run all detectors. */
export function detectAll(events: AuthEvent[], t: AnomalyThresholds): Detection[] {
  return [
    ...detectCredentialStuffing(events, t),
    ...detectSignupBurst(events, t),
    ...detectGeoSwitch(events, t),
  ];
}
