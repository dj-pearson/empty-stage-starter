/**
 * Dependency update / audit agent (US-507).
 *
 * Weekly (dispatcher). Reads package.json from GitHub, queries OSV for known
 * vulnerabilities, has Claude summarize (critical first, then safe minor/patch
 * groupings with risk notes), and drafts a 'Weekly dependency report' GitHub
 * issue. Any critical vulnerability additionally files a tier-2 escalation.
 *
 * POST /agent-dependency-audit  { trigger, agent_id? }
 * Auth: verify_jwt=false; internal AGENT_DISPATCH_SECRET header (dispatcher).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import {
  parseDependencies,
  vulnSeverity,
  hasCritical,
  countBySeverity,
  reportTitle,
  type Dependency,
  type VulnFinding,
} from '../_shared/dependency-audit-logic.ts';

const AGENT_NAME = 'dependency-audit';
const MAX_VULN_DETAILS = 30;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

async function fetchPackageJson(): Promise<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null> {
  const repo = Deno.env.get('GITHUB_REPO');
  const branch = Deno.env.get('GITHUB_DEFAULT_BRANCH') ?? 'main';
  if (!repo) return null;
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/package.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** OSV batch query -> map of "name@version" -> vuln ids. */
async function osvBatch(deps: Dependency[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (deps.length === 0) return out;
  try {
    const res = await fetch('https://api.osv.dev/v1/querybatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queries: deps.map((d) => ({ package: { name: d.name, ecosystem: 'npm' }, version: d.version })),
      }),
    });
    if (!res.ok) return out;
    const data = (await res.json()) as { results: Array<{ vulns?: Array<{ id: string }> }> };
    data.results.forEach((r, i) => {
      const ids = (r.vulns ?? []).map((v) => v.id);
      if (ids.length) out.set(`${deps[i].name}@${deps[i].version}`, ids);
    });
  } catch {
    // network/OSV failure -> no findings
  }
  return out;
}

async function osvVuln(id: string): Promise<{ database_specific?: { severity?: string }; severity?: Array<{ type?: string; score?: string }>; summary?: string } | null> {
  try {
    const res = await fetch(`https://api.osv.dev/v1/vulns/${id}`);
    if (!res.ok) return null;
    return await res.json();
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

  const today = new Date().toISOString().slice(0, 10);

  const result = await runAgent({
    agentDefinition: def as AgentDefinition,
    trigger: 'dispatcher',
    handler: async (ctx) => {
      const pkg = await fetchPackageJson();
      if (!pkg) return { error: 'package.json unavailable (set GITHUB_REPO)', findings: 0 };

      const deps = parseDependencies(pkg);
      const affected = await osvBatch(deps);

      // Resolve severities for a bounded set of vuln ids.
      const findings: VulnFinding[] = [];
      const seen = new Set<string>();
      outer: for (const [pkgKey, ids] of affected) {
        const [name, version] = pkgKey.split('@');
        for (const id of ids) {
          if (findings.length >= MAX_VULN_DETAILS) break outer;
          if (seen.has(id + pkgKey)) continue;
          seen.add(id + pkgKey);
          const v = await osvVuln(id);
          findings.push({
            package: name,
            version,
            id,
            severity: v ? vulnSeverity(v) : 'unknown',
            summary: v?.summary ?? '',
          });
        }
      }

      const counts = countBySeverity(findings);
      // Claude writes the human report (critical first, safe groupings, risk notes).
      const report = await ctx.complete({
        messages: [
          {
            role: 'user',
            content:
              `Write a concise weekly dependency report (GitHub-flavored Markdown) for EatPal.\n` +
              `Total dependencies scanned: ${deps.length}. Severity counts: ${JSON.stringify(counts)}.\n` +
              `Vulnerability findings:\n${JSON.stringify(findings, null, 2)}\n\n` +
              `Order: critical vulnerabilities first (with a clear call to action), then high, then ` +
              `safe minor/patch upgrade groupings, each with a one-line risk note. Be terse.`,
          },
        ],
        maxTokens: 1500,
      });

      const body =
        `_Generated ${today}. ${deps.length} deps scanned, ${findings.length} vulnerability finding(s)._\n\n` +
        report.text;

      await ctx.requestApproval({
        actionType: 'github_issue',
        payload: {
          title: reportTitle(today),
          body,
          labels: ['dependencies', 'maintenance'],
        } as unknown as Json,
        expiresInHours: 336,
      });

      if (hasCritical(findings)) {
        const criticals = findings.filter((f) => f.severity === 'critical');
        await ctx.escalate({
          tier: 2,
          severity: 'high',
          domain: 'dev_maintenance',
          title: `Critical dependency vulnerabilities (${criticals.length})`,
          context: { criticals, date: today } as unknown as Json,
        });
      }

      return { deps: deps.length, findings: findings.length, counts };
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});
