/**
 * US-792: the rule for when CI may set a story's `passes: true`.
 *
 * What this replaces. The engine used to flip on two facts: a commit subject
 * mentioning the story id, and the platform job for that story returning
 * success. Neither says an acceptance criterion was met, and together they
 * were actively wrong:
 *
 *   - US-793 is a Postgres migration. It was flipped `verified:ios-green` on a
 *     PR containing no Swift, because the iOS gate happened to be green.
 *   - US-778 was flipped `verified:web-green` during a run where its own a11y
 *     scan was FAILING. The E2E job carries continue-on-error, so the job
 *     reported success while the thing that would have falsified the story
 *     was red inside it.
 *   - On a PR whose entire content was two YAML config files, the engine
 *     flipped fourteen stories, US-792 itself among them, plus US-806 and
 *     US-807 whose criteria wait on an edge-function redeploy and an App Store
 *     release that have not happened.
 *
 * The replacement. A story is flipped only when it NAMES the checks that
 * prove it and every one of them ran and passed in this run. No declaration,
 * no flip -- which means the engine flips nothing until stories opt in, and
 * that is the intended state. A backlog that says "unverified" is useful; one
 * that says "done" because an unrelated job was green is worse than no
 * backlog.
 *
 * Declaring evidence on a story:
 *
 *   {
 *     "id": "US-123",
 *     "verifiedBy": { "checks": ["Web gate (strict) / Unit tests", "Migration Test"] }
 *   }
 *
 * Names are matched against this run's jobs and steps, addressable as the job
 * name ("Migration Test") or "Job / Step" ("Web gate (strict) / Unit tests").
 * Naming a STEP is what defeats continue-on-error masking: the job's
 * conclusion can be success while the step's is failure, and the step is the
 * one that means anything.
 *
 * `"autoVerify": false` holds a story open regardless, for the case where a
 * person has looked and decided it is not done.
 */

/**
 * Stories that require a human or ops sign-off. Kept from the previous engine
 * deliberately: under named evidence these can no longer be flipped by
 * accident anyway, but the list records WHY each one is a person's call, and
 * a future declaration on one of them should have to argue with this list
 * first. It can only ever hold a story false.
 */
export const MANUAL_SIGNOFF = new Set([
  // Prod deploys, on-device Xcode work, owner-gated removals.
  'US-323', 'US-313', 'US-314', 'US-261', 'US-644',
  // Credential rotation, signing material, prod policy reads.
  'US-556', 'US-562', 'US-570', 'US-609', 'US-634', 'US-635', 'US-643',
  // Coolify env changes on the production supabase-auth container.
  'US-700', 'US-701',
  // Roadmap survey 2026-09-03: each closed by a person, not a green job.
  'US-760', 'US-762', 'US-763', 'US-773', 'US-774', 'US-781', 'US-783',
  'US-786', 'US-787', 'US-788',
]);

/** A check counts as evidence only when it actually ran and actually passed. */
const PASSED = 'success';

/**
 * Flatten a GitHub Actions run's jobs into names a story can address.
 *
 * Every job contributes its own name, and every step contributes
 * "Job / Step". Both conclusions are kept side by side on purpose: a job that
 * reports success while a step inside it reports failure is exactly the
 * masking US-792 AC2 is about, and collapsing them would hide it again.
 *
 * @param {{jobs?: Array<{name: string, conclusion: string, steps?: Array<{name: string, conclusion: string}>}>}} run
 * @returns {Map<string, string>} check name -> conclusion
 */
export function collectChecks(run) {
  const checks = new Map();
  for (const job of run?.jobs ?? []) {
    if (!job?.name) continue;
    checks.set(job.name, job.conclusion ?? 'unknown');
    for (const step of job.steps ?? []) {
      if (!step?.name) continue;
      checks.set(`${job.name} / ${step.name}`, step.conclusion ?? 'unknown');
    }
  }
  return checks;
}

/**
 * @typedef {Object} Verdict
 * @property {boolean} flip     whether passes may be set true
 * @property {string}  status   short machine-readable outcome
 * @property {string}  detail   what a reader needs to act on it
 * @property {string} [stamp]   the note appended when flipping
 */

/**
 * Decide whether CI may mark this story passing.
 *
 * @param {Record<string, any>} story
 * @param {{checks: Map<string, string>}} ctx
 * @returns {Verdict}
 */
export function decide(story, ctx) {
  const checks = ctx?.checks ?? new Map();

  if (story.passes === true) {
    return { flip: false, status: 'already-passing', detail: 'already true; not re-evaluated' };
  }

  // An author's explicit hold outranks any amount of green.
  if (story.autoVerify === false) {
    return {
      flip: false,
      status: 'held-by-author',
      detail: 'autoVerify:false — a person has decided this is not done',
    };
  }

  if (MANUAL_SIGNOFF.has(story.id)) {
    return {
      flip: false,
      status: 'manual-signoff-required',
      detail: 'closed by a person, never by a green job',
    };
  }

  const named = story.verifiedBy?.checks;
  if (!Array.isArray(named) || named.length === 0) {
    return {
      flip: false,
      status: 'awaiting-evidence',
      detail:
        'no verifiedBy.checks declared — name the CI checks that prove this story ' +
        'before CI can mark it passing',
    };
  }

  const missing = named.filter((name) => !checks.has(name));
  if (missing.length) {
    return {
      flip: false,
      status: 'evidence-missing',
      detail: `named check(s) did not run in this run: ${missing.join(', ')}`,
    };
  }

  const red = named
    .map((name) => ({ name, conclusion: checks.get(name) }))
    .filter((c) => c.conclusion !== PASSED);
  if (red.length) {
    return {
      flip: false,
      status: 'evidence-red',
      detail: red.map((c) => `${c.name}=${c.conclusion}`).join(', '),
    };
  }

  return {
    flip: true,
    status: 'verified',
    detail: `all ${named.length} named check(s) passed`,
    stamp: `VERIFIED by prd-verify: ${named.join(', ')}`,
  };
}
