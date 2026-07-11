/**
 * Unit tests for CI triage logic (US-508).
 * Run with: `deno test functions/_shared/ci-triage-logic_test.ts`
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  parseWorkflowRun,
  classificationToAction,
  failureFingerprint,
  logExcerpt,
  type CiClassification,
} from './ci-triage-logic.ts';

Deno.test('parseWorkflowRun: extracts repo/run/pr/conclusion', () => {
  const info = parseWorkflowRun({
    repository: { full_name: 'dj/eatpal' },
    workflow_run: { id: 123, conclusion: 'failure', name: 'CI', head_branch: 'feat/x', pull_requests: [{ number: 42 }] },
  });
  assertEquals(info, { repo: 'dj/eatpal', runId: 123, conclusion: 'failure', workflow: 'CI', prNumber: 42, headBranch: 'feat/x' });
});

Deno.test('parseWorkflowRun: tolerates missing fields', () => {
  const info = parseWorkflowRun({ workflow_run: {} });
  assertEquals(info.repo, null);
  assertEquals(info.prNumber, null);
  assertEquals(info.conclusion, null);
});

Deno.test('classificationToAction: flake records, real drafts', () => {
  const base: CiClassification = { is_flake: false, failing_step: 's', likely_cause: 'c', suggested_fix: 'f', confidence: 'high' };
  assertEquals(classificationToAction(base), 'draft');
  assertEquals(classificationToAction({ ...base, is_flake: true }), 'record');
});

Deno.test('failureFingerprint: stable, case/space-insensitive', () => {
  assertEquals(
    failureFingerprint({ workflow: 'CI', prNumber: 42, failingStep: 'Run  tests' }),
    'ci|42|run tests',
  );
  assertEquals(
    failureFingerprint({ workflow: 'CI', prNumber: 42, failingStep: 'run tests' }),
    failureFingerprint({ workflow: 'ci', prNumber: 42, failingStep: 'Run tests' }),
  );
});

Deno.test('logExcerpt: returns tail when over the cap', () => {
  assertEquals(logExcerpt('short'), 'short');
  const big = 'x'.repeat(10000);
  const ex = logExcerpt(big, 6000);
  assertEquals(ex.startsWith('…(truncated)…'), true);
  assertEquals(ex.length < 6100, true);
});
