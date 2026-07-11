/**
 * Unit tests for the agent digest logic (US-488).
 *
 * Run with: `deno test functions/_shared/agent-digest-logic_test.ts`
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  escapeHtml,
  yesterdayUtcWindow,
  groupApprovalsByActionType,
  dailyHasContent,
  buildInstantEmail,
  buildDailyDigest,
} from './agent-digest-logic.ts';

Deno.test('yesterdayUtcWindow: spans the full prior UTC day', () => {
  const w = yesterdayUtcWindow(new Date('2026-07-10T09:30:00Z'));
  assertEquals(w.start, '2026-07-09T00:00:00.000Z');
  assertEquals(w.end, '2026-07-10T00:00:00.000Z');
});

Deno.test('groupApprovalsByActionType: counts per type', () => {
  const g = groupApprovalsByActionType([
    { action_type: 'send_email' },
    { action_type: 'send_email' },
    { action_type: 'github_issue' },
  ]);
  assertEquals(g, { send_email: 2, github_issue: 1 });
});

Deno.test('dailyHasContent: true when any actionable bucket is non-empty', () => {
  assert(dailyHasContent({ openTier2: 1, pendingApprovalsByType: {}, yesterdaySpendUsd: 0, failedRunsCount: 0 }));
  assert(dailyHasContent({ openTier2: 0, pendingApprovalsByType: { send_email: 2 }, yesterdaySpendUsd: 0, failedRunsCount: 0 }));
  assert(dailyHasContent({ openTier2: 0, pendingApprovalsByType: {}, yesterdaySpendUsd: 0, failedRunsCount: 3 }));
});

Deno.test('dailyHasContent: false when only spend is non-zero (nothing to action)', () => {
  assertEquals(
    dailyHasContent({ openTier2: 0, pendingApprovalsByType: {}, yesterdaySpendUsd: 4.2, failedRunsCount: 0 }),
    false,
  );
  assertEquals(
    dailyHasContent({ openTier2: 0, pendingApprovalsByType: {}, yesterdaySpendUsd: 0, failedRunsCount: 0 }),
    false,
  );
});

Deno.test('escapeHtml: neutralizes markup', () => {
  assertEquals(escapeHtml('<b>"x"</b> & y'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; y');
});

Deno.test('buildInstantEmail: includes title, fields, escalations deep link', () => {
  const { subject, html } = buildInstantEmail(
    { title: 'Credential stuffing', severity: 'critical', domain: 'security', tier: 3 },
    'https://tryeatpal.com/',
  );
  assert(subject.includes('Tier-3'));
  assert(subject.includes('Credential stuffing'));
  assert(html.includes('critical'));
  assert(html.includes('security'));
  assert(html.includes('https://tryeatpal.com/admin/agents?tab=escalations'));
});

Deno.test('buildInstantEmail: escapes an XSS-y title', () => {
  const { html } = buildInstantEmail(
    { title: '<script>alert(1)</script>', severity: 'high', domain: null, tier: 3 },
    'https://tryeatpal.com',
  );
  assert(!html.includes('<script>'));
  assert(html.includes('&lt;script&gt;'));
});

Deno.test('buildDailyDigest: renders each section + command center link', () => {
  const { subject, html } = buildDailyDigest(
    {
      openTier2: 2,
      pendingApprovalsByType: { send_email: 3, github_issue: 1 },
      yesterdaySpendUsd: 1.5,
      failedRunsCount: 4,
    },
    'https://tryeatpal.com',
  );
  assert(subject.includes('daily digest'));
  assert(html.includes('send_email'));
  assert(html.includes('$1.50'));
  assert(html.includes('https://tryeatpal.com/admin/agents'));
});
