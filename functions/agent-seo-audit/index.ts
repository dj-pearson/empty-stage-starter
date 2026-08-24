/**
 * SEO audit agent (US-505).
 *
 * Weekly (dispatcher). Fetches the production sitemap and audits pages for
 * missing/duplicate title & meta description, missing canonical, broken internal
 * links (404s), and missing JSON-LD on blog/recipe pages. All outbound fetches
 * are restricted to the production domain (same-host check + SSRF validator).
 * New findings (deduped against prior unresolved SEO escalations) are compiled
 * into ONE tier-2 escalation; the summary is stored on the run output.
 *
 * POST /agent-seo-audit  { trigger, agent_id? }
 * Auth: verify_jwt=false; internal AGENT_DISPATCH_SECRET header (dispatcher).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import { validateExternalUrl, fetchWithTimeout } from '../_shared/url-validator.ts';
// US-651: the cannibalization algorithm lives in the web tree because the admin
// tab is its other consumer. It has no imports of its own, so Deno loads it as
// written; the explicit .ts extension is for Deno's resolver.
import {
  findCannibalization,
  summarizeCannibalization,
  type PageQueryRow,
} from '../../src/lib/seo/cannibalization.ts';
import {
  parseSitemapUrls,
  extractMeta,
  auditPage,
  detectDuplicates,
  dedupeAgainstPrior,
  fingerprint,
  isSameHost,
  type Finding,
  type PageMeta,
} from '../_shared/seo-audit-logic.ts';

const AGENT_NAME = 'seo-audit';
const MAX_PAGES = 30;
const MAX_LINK_CHECKS = 40;
/** Days of gsc_page_performance to read for the cannibalization pass. */
const CANNIBAL_WINDOW_DAYS = 28;
/** Lines carried into the escalation body; the full count rides alongside. */
const MAX_CANNIBAL_LINES = 5;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

function productionOrigin(): string {
  return (Deno.env.get('APP_BASE_URL') ?? 'https://tryeatpal.com').replace(/\/$/, '');
}

/** Fetch a same-host URL through the SSRF validator; null on any failure. */
async function safeFetchText(url: string, origin: string): Promise<string | null> {
  if (!isSameHost(url, origin)) return null;
  const check = await validateExternalUrl(url);
  if (!check.valid) return null;
  try {
    const res = await fetchWithTimeout(url, { headers: { 'user-agent': 'eatpal-seo-audit' } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function linkStatus(url: string, origin: string): Promise<number | null> {
  if (!isSameHost(url, origin)) return null;
  const check = await validateExternalUrl(url);
  if (!check.valid) return null;
  try {
    const res = await fetchWithTimeout(url, { method: 'GET', headers: { 'user-agent': 'eatpal-seo-audit' } });
    return res.status;
  } catch {
    return null;
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

  const result = await runAgent({
    agentDefinition: def as AgentDefinition,
    trigger: 'dispatcher',
    handler: async (ctx) => {
      const origin = productionOrigin();

      const sitemapXml = await safeFetchText(`${origin}/sitemap.xml`, origin);
      if (!sitemapXml) return { error: 'sitemap unavailable', findings: 0 };

      const urls = parseSitemapUrls(sitemapXml)
        .filter((u) => isSameHost(u, origin))
        .slice(0, MAX_PAGES);

      const pages: PageMeta[] = [];
      for (const url of urls) {
        const html = await safeFetchText(url, origin);
        if (html) pages.push(extractMeta(url, html));
      }

      const findings: Finding[] = [];
      for (const p of pages) findings.push(...auditPage(p));
      findings.push(...detectDuplicates(pages));

      // Broken internal links (bounded, deduped, absolutized).
      const linkSet = new Set<string>();
      for (const p of pages) {
        for (const l of p.internalLinks) {
          const abs = l.startsWith('/') ? `${origin}${l}` : l;
          linkSet.add(abs.split('#')[0]);
        }
      }
      const links = [...linkSet].slice(0, MAX_LINK_CHECKS);
      for (const link of links) {
        const status = await linkStatus(link, origin);
        if (status === 404) findings.push({ url: link, issue: 'broken internal link (404)' });
      }

      // Dedup against prior unresolved SEO escalations.
      const { data: priorEsc } = await db
        .from('agent_escalations')
        .select('context')
        .eq('domain', 'marketing')
        .eq('status', 'open')
        .ilike('title', 'SEO audit%');
      const prior = new Set<string>();
      for (const e of (priorEsc ?? []) as Array<{ context: { findings?: Finding[] } }>) {
        for (const f of e.context?.findings ?? []) prior.add(fingerprint(f));
      }
      const newFindings = dedupeAgainstPrior(findings, prior);

      // US-651: queries several of our own URLs are splitting. This audit is
      // the only weekly thing a human reads, so the finding rides along here
      // rather than waiting on someone opening the admin tab -- which is how
      // the /compare pages sat unreachable for months.
      const { data: perfRows } = await db
        .from('gsc_page_performance')
        .select('page_url, date, top_queries')
        .gte('date', new Date(Date.now() - CANNIBAL_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10));
      const cannibalization = findCannibalization((perfRows ?? []) as PageQueryRow[]);
      const cannibalizationTop = summarizeCannibalization(cannibalization, MAX_CANNIBAL_LINES);

      const byIssue: Record<string, number> = {};
      for (const f of findings) byIssue[f.issue.split(':')[0]] = (byIssue[f.issue.split(':')[0]] ?? 0) + 1;
      const summary = {
        pagesAudited: pages.length,
        totalFindings: findings.length,
        newFindings: newFindings.length,
        byIssue,
        cannibalizedQueries: cannibalization.length,
        // Never a silent top-N: the count above is the whole set, these are the
        // lines that fit.
        cannibalizationTop,
      };

      if (newFindings.length > 0 || cannibalization.length > 0) {
        const parts = [];
        if (newFindings.length > 0) parts.push(`${newFindings.length} new finding(s)`);
        if (cannibalization.length > 0) parts.push(`${cannibalization.length} cannibalized query(s)`);
        await ctx.escalate({
          tier: 2,
          severity: 'medium',
          domain: 'marketing',
          title: `SEO audit: ${parts.join(', ')}`,
          context: { findings: newFindings, summary } as unknown as Json,
        });
      }

      return summary;
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});
