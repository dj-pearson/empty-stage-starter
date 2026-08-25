/**
 * Content decay agent (US-650).
 *
 * Weekly (dispatcher). Compares the trailing 28 days of gsc_page_performance
 * against the preceding 28 and drafts a tier-2 'content_refresh' approval for
 * every published page that lost a meaningful share of its clicks.
 *
 * This closes the one-way door in the content programme. agent-content-calendar
 * (US-502) proposes new topics and agent-seo-audit (US-505) checks hygiene, so
 * before this the only available response to a page losing its traffic was to
 * publish another page.
 *
 * All windowing, thresholds and dedupe live in ../_shared/content-decay-logic.ts
 * and are unit-tested from src/lib/contentDecay.test.ts. This file is the I/O:
 * read the window, filter, verify each survivor still resolves, draft.
 *
 * POST /agent-content-decay  { trigger, agent_id? }
 * Auth: verify_jwt=false; internal AGENT_DISPATCH_SECRET header (dispatcher).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import { validateExternalUrl, fetchWithTimeout } from '../_shared/url-validator.ts';
import { isSameHost } from '../_shared/seo-audit-logic.ts';
import {
  DEFAULT_THRESHOLDS,
  dedupeAgainstOpenApprovals,
  detectDecay,
  normalizeUrl,
  type DecayFinding,
  type DecayThresholds,
  type PagePerformanceRow,
} from '../_shared/content-decay-logic.ts';

const AGENT_NAME = 'content-decay';
const ACTION_TYPE = 'content_refresh';

/**
 * Cap on approvals drafted per run. A first run over a year of history could
 * otherwise draft hundreds at once and the queue stops being read, which is the
 * failure mode this agent exists to avoid. The run reports what it dropped.
 */
const MAX_DRAFTS_PER_RUN = 10;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/**
 * The sibling agents all write `type SupabaseClient = any` with a
 * deno-lint-ignore above it. That directive is Deno's, not ESLint's, so each of
 * those lines is one of the 1234 errors in .ci/lint-baseline.txt, and the
 * ratchet in scripts/ci/lint-ratchet.sh means a new one cannot be added.
 * Inferring the type off createClient costs nothing and is more accurate.
 */
type SupabaseClient = ReturnType<typeof createClient>;

function productionOrigin(): string {
  return (Deno.env.get('APP_BASE_URL') ?? 'https://tryeatpal.com').replace(/\/$/, '');
}

/** Read threshold overrides from the agent's autonomy_policy. */
function thresholdsFrom(policy: Record<string, unknown> | null | undefined): Partial<DecayThresholds> {
  const raw = policy?.decay_thresholds;
  if (!raw || typeof raw !== 'object') return {};
  const src = raw as Record<string, unknown>;
  const out: Partial<DecayThresholds> = {};
  for (const key of ['windowDays', 'minClickDrop', 'minPriorImpressions', 'minPageAgeDays'] as const) {
    const value = src[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) out[key] = value;
  }
  return out;
}

/**
 * Does this URL still resolve on our own host?
 *
 * A page that 404s or redirects away is not a refresh candidate -- it is either
 * already retired on purpose or a different problem, and drafting a "rewrite
 * this" approval for a dead URL wastes the reviewer's time. Same-host check
 * plus the SSRF validator, matching agent-seo-audit.
 */
async function stillResolves(url: string, origin: string): Promise<boolean> {
  const absolute = url.startsWith('http') ? url : `${origin}${normalizeUrl(url)}`;
  if (!isSameHost(absolute, origin)) return false;
  const check = await validateExternalUrl(absolute);
  if (!check.valid) return false;
  try {
    const res = await fetchWithTimeout(absolute, {
      headers: { 'user-agent': 'eatpal-content-decay' },
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

serve(async (req) => {
  const expected = Deno.env.get('AGENT_DISPATCH_SECRET');
  if (!expected || req.headers.get('x-agent-dispatch-secret') !== expected) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const db: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const { data: def } = await db
    .from('agent_definitions')
    .select('id, name, model, system_prompt, daily_cost_cap_usd, autonomy_policy')
    .eq('name', AGENT_NAME)
    .maybeSingle();
  if (!def) return json({ error: `agent '${AGENT_NAME}' is not registered` }, 404);

  const thresholds = {
    ...DEFAULT_THRESHOLDS,
    ...thresholdsFrom((def as AgentDefinition).autonomy_policy as Record<string, unknown>),
  };

  const result = await runAgent({
    agentDefinition: def as AgentDefinition,
    trigger: 'dispatcher',
    handler: async (ctx) => {
      const origin = productionOrigin();

      // asOf is the latest date GSC has actually delivered, not today. Search
      // Console lags by two to three days, so anchoring on today would compare
      // a short window against a full one and read the lag as a collapse.
      const { data: latest } = await db
        .from('gsc_page_performance')
        .select('date')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
      const asOf = (latest as { date?: string } | null)?.date;
      if (!asOf) return { skipped: 'no gsc_page_performance rows' };

      const windowStart = new Date(
        Date.parse(`${asOf}T00:00:00Z`) - 2 * thresholds.windowDays * 86_400_000,
      )
        .toISOString()
        .slice(0, 10);

      const { data: rows, error } = await db
        .from('gsc_page_performance')
        .select('page_url, date, clicks, impressions, position, top_queries')
        .gte('date', windowStart)
        .lte('date', asOf);
      if (error) throw new Error(`gsc_page_performance read failed: ${error.message}`);

      // Publish dates, so a page still ramping is never called decayed.
      const { data: posts } = await db
        .from('blog_posts')
        .select('slug, published_at, created_at')
        .eq('status', 'published')
        .limit(2000);
      const publishedAt: Record<string, string> = {};
      for (const p of (posts ?? []) as Array<{
        slug: string;
        published_at?: string | null;
        created_at?: string | null;
      }>) {
        const when = p.published_at ?? p.created_at;
        if (when) publishedAt[`${origin}/blog/${p.slug}`] = when.slice(0, 10);
      }

      const findings = detectDecay({
        rows: (rows ?? []) as PagePerformanceRow[],
        asOf,
        thresholds,
        publishedAt,
      });

      // Anything already queued for a rewrite is not queued again. Without this
      // the same page redrafts every week for as long as the approval sits
      // unread, which is what stops the queue being read.
      const { data: openApprovals } = await db
        .from('agent_approvals')
        .select('payload')
        .eq('action_type', ACTION_TYPE)
        .in('status', ['draft', 'approved']);
      const openUrls = ((openApprovals ?? []) as Array<{ payload?: { page_url?: string } }>)
        .map((a) => a.payload?.page_url)
        .filter((u): u is string => typeof u === 'string');

      const fresh = dedupeAgainstOpenApprovals(findings, openUrls);

      const drafted: string[] = [];
      let goneCount = 0;
      let capped = 0;

      for (const finding of fresh) {
        if (drafted.length >= MAX_DRAFTS_PER_RUN) {
          capped = fresh.length - drafted.length - goneCount;
          break;
        }
        if (!(await stillResolves(finding.pageUrl, origin))) {
          goneCount++;
          continue;
        }
        await ctx.requestApproval({
          actionType: ACTION_TYPE,
          payload: toPayload(finding),
          expiresInHours: 336,
        });
        drafted.push(finding.pageUrl);
      }

      return {
        as_of: asOf,
        window_days: thresholds.windowDays,
        pages_examined: new Set((rows ?? []).map((r: PagePerformanceRow) => r.page_url)).size,
        decaying: findings.length,
        already_queued: findings.length - fresh.length,
        no_longer_resolving: goneCount,
        drafted: drafted.length,
        // Never a silent truncation: a capped run reads as "10 pages decayed"
        // unless the number it did not draft is on the record.
        not_drafted_over_cap: capped,
      };
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});

/** Everything a reviewer needs to judge the rewrite without opening GSC. */
function toPayload(f: DecayFinding): Json {
  return {
    page_url: f.pageUrl,
    clicks_lost: f.clicksLost,
    click_drop_pct: Math.round(f.clickDrop * 100),
    prior_clicks: f.priorClicks,
    recent_clicks: f.recentClicks,
    prior_impressions: f.priorImpressions,
    recent_impressions: f.recentImpressions,
    prior_position: f.priorPosition,
    recent_position: f.recentPosition,
    top_queries: f.topQueries,
  } as unknown as Json;
}
