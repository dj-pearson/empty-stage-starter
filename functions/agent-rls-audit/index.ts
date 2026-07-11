/**
 * RLS / permission audit agent (US-511).
 *
 * Weekly (dispatcher). Calls the agent_rls_audit RPC (per-table RLS status +
 * policy summaries from pg_catalog), runs the pure analyzer, diffs against last
 * week's snapshot, and escalates any findings — tier-2 by default, tier-3 when a
 * table holding user data has RLS disabled. Every run persists a fresh snapshot
 * so the next audit can highlight new/removed tables and policies.
 *
 * POST /agent-rls-audit  { trigger, agent_id? }
 * Auth: verify_jwt=false; internal AGENT_DISPATCH_SECRET header (dispatcher).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import {
  analyzeRls,
  escalationTier,
  toSnapshot,
  diffSnapshots,
  type TableRls,
  type AuditSnapshot,
} from '../_shared/rls-audit-logic.ts';

const AGENT_NAME = 'rls-audit';

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

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
      const { data: rows, error } = await db.rpc('agent_rls_audit');
      if (error) return { error: `rls audit source unavailable: ${error.message}`, findings: 0 };

      const tables = (rows ?? []) as TableRls[];
      const findings = analyzeRls(tables);
      const current = toSnapshot(tables);

      // Diff against the previous snapshot (the newest existing row; this run's
      // snapshot is inserted afterwards).
      const { data: prevRow } = await db
        .from('agent_rls_snapshots')
        .select('snapshot')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const prev = (prevRow?.snapshot ?? null) as AuditSnapshot | null;
      const diff = diffSnapshots(prev, current);

      const tier = escalationTier(findings);
      if (tier) {
        // Claude writes a terse human summary; the raw findings + diff ride along
        // as structured evidence.
        const summary = await ctx.complete({
          messages: [
            {
              role: 'user',
              content:
                `Write a terse RLS audit summary (GitHub-flavored Markdown) for EatPal engineers.\n` +
                `Findings (${findings.length}):\n${JSON.stringify(findings, null, 2)}\n\n` +
                `New tables since last audit: ${JSON.stringify(diff.newTables)}\n` +
                `New policies since last audit: ${JSON.stringify(diff.newPolicies)}\n\n` +
                `Lead with the most dangerous finding (user data exposed). Reference exact ` +
                `table and policy names. Be concise; do not overstate risk on public reference tables.`,
            },
          ],
          maxTokens: 900,
        });

        await ctx.escalate({
          tier,
          severity: tier === 3 ? 'critical' : 'high',
          domain: 'dev_maintenance',
          title: `RLS/permission audit: ${findings.length} finding(s)`,
          context: {
            date: today,
            findings,
            diff,
            summary: summary.text,
          } as unknown as Json,
        });
      }

      // Persist this run's snapshot for next week's diff.
      await db.from('agent_rls_snapshots').insert({
        snapshot: current as unknown as Json,
        findings: findings as unknown as Json,
      });

      return {
        tables: tables.length,
        findings: findings.length,
        tier,
        new_tables: diff.newTables.length,
        new_policies: diff.newPolicies.length,
      };
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});
