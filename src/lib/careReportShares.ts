/**
 * Care report share links (20260930000001_care_report_shares.sql): the URL a
 * token opens, the expiry choices, the consent wording version, and how a
 * row reads in the parent's list.
 */
import { supabase } from '@/integrations/supabase/client';
import type { CareReport } from '@/lib/careReport';
import type { Json } from '@/integrations/supabase/types';

/**
 * Which wording of the consent step the parent accepted. Bump it whenever the
 * consent copy (careReport.share.consent.* in the locale file) changes
 * meaning, so each stored link says what its sharer agreed to.
 */
export const CARE_SHARE_CONSENT_VERSION = 'v1';

/** Days a link can live. The database caps it at 90. */
export const CARE_SHARE_EXPIRY_DAYS = [7, 30, 90] as const;
export type CareShareExpiryDays = (typeof CARE_SHARE_EXPIRY_DAYS)[number];
export const DEFAULT_CARE_SHARE_EXPIRY: CareShareExpiryDays = 30;

export const CARE_SHARE_LABEL_MAX = 60;

export interface CareReportShare {
  id: string;
  token: string;
  label: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
}

export type CareShareState = 'live' | 'expired' | 'revoked';

export function careShareState(share: Pick<CareReportShare, 'expiresAt' | 'revokedAt'>, now: Date): CareShareState {
  if (share.revokedAt) return 'revoked';
  return Date.parse(share.expiresAt) > now.getTime() ? 'live' : 'expired';
}

/** The page a token opens. */
export function buildCareShareUrl(token: string, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/care/${encodeURIComponent(token)}`;
}

const SELECT = 'id, token, label, created_at, expires_at, revoked_at, view_count, last_viewed_at';

interface ShareRow {
  id: string;
  token: string;
  label: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
}

function fromRow(row: ShareRow): CareReportShare {
  return {
    id: row.id,
    token: row.token,
    label: row.label,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    viewCount: row.view_count,
    lastViewedAt: row.last_viewed_at,
  };
}

/** Every link ever made for this child, newest first. */
export async function listCareShares(kidId: string): Promise<CareReportShare[]> {
  const { data, error } = await supabase
    .from('care_report_shares')
    .select(SELECT)
    .eq('kid_id', kidId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return ((data ?? []) as ShareRow[]).map(fromRow);
}

export interface CreateCareShareArgs {
  householdId: string;
  kidId: string;
  report: CareReport;
  label: string;
  expiresInDays: CareShareExpiryDays;
  now?: Date;
}

/**
 * Store the snapshot and get its link. The token, created_at and view
 * counters are the database's; only these columns are sent.
 */
export async function createCareShare(args: CreateCareShareArgs): Promise<CareReportShare> {
  const now = args.now ?? new Date();
  // A minute short of the full span, so the database's own now() at insert
  // time cannot land the expiry a hair past its 90-day cap.
  const expiresAt = new Date(now.getTime() + args.expiresInDays * 86_400_000 - 60_000).toISOString();
  const label = args.label.trim().slice(0, CARE_SHARE_LABEL_MAX);
  const { data, error } = await supabase
    .from('care_report_shares')
    .insert({
      household_id: args.householdId,
      kid_id: args.kidId,
      label: label || null,
      report: args.report as unknown as Json,
      consent_version: CARE_SHARE_CONSENT_VERSION,
      expires_at: expiresAt,
    })
    .select(SELECT)
    .single();
  if (error) throw error;
  return fromRow(data as ShareRow);
}

/** Turn a link off. revoked_at is the only column a member may update. */
export async function revokeCareShare(id: string): Promise<void> {
  const { error } = await supabase
    .from('care_report_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
