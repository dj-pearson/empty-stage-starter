# PRD: EatPal Agentic OS

## Introduction

The Agentic OS is an autonomous multi-agent operations layer for EatPal that handles everyday business tasks — customer service, user nurture, prospecting/marketing content, and (in later phases) dev/maintenance and security monitoring — without a human in the loop for tier-1 work. Anything risky, novel, or outward-facing is drafted and queued for one-click human approval (tier 2), and urgent/sensitive items escalate immediately (tier 3).

**Runtime decision:** Supabase-native. Agents run as Edge Functions invoked by pg_cron (and event triggers), backed by a new `agent_*` table family with RLS, calling the Claude API. The human control surface is an "Agent Command Center" inside the existing web app's admin area, plus Resend email digests. No new infrastructure.

**Autonomy decision:** Draft-first. Agents act freely on internal state (classification, scoring, analysis, internal queues). Every externally visible action (support reply, marketing email, social post, GitHub issue) goes through the approval queue. Per-agent `autonomy_policy` flags allow loosening later (e.g. auto-send templated onboarding emails) without code changes.

## Goals

- Tier-1 automation: ≥80% of routine tasks (support triage, lifecycle emails, content drafting) require zero human effort beyond one-click approval.
- Single pane of glass: every agent, run, cost, draft, and escalation is visible and controllable from the admin dashboard.
- Safety by construction: agents cannot side-effect externally except through the approval/execution engine; hard per-agent daily cost caps; global kill switch; immutable audit log.
- Extensible: adding a new agent = one row in `agent_definitions` + one handler module, not a new service.
- Phase 1 ships customer service + growth (nurture + prospecting). Phase 2 adds dev/maintenance, security/ops, and business reporting on the same platform.

## Tier Model

| Tier | Meaning | Handling |
|------|---------|----------|
| 1 | Routine, reversible, internal or pre-approved | Agent executes autonomously; logged to audit |
| 2 | Outward-facing, novel, or judgment calls | Agent drafts → approval queue → human approve/edit/reject; daily email digest |
| 3 | Urgent/sensitive: security, data loss, legal, refunds, angry churning customer | Immediate escalation: admin dashboard + instant email; agent takes no action |

## Architecture Overview

```
pg_cron ──▶ agent-dispatcher (edge fn) ──▶ agent handlers (edge fns)
                                              │  uses _shared/agent-runtime.ts
                                              │  (Claude API, tools, cost, retry)
                                              ▼
   agent_definitions  agent_runs  agent_approvals  agent_escalations  agent_audit_log
   agent_knowledge (pgvector RAG)   agent_events (lifecycle)   support_tickets
                                              ▲
Admin Command Center (web app) ── approve/reject/edit ──▶ approval-executor (edge fn)
                                                            └─▶ Resend / webhooks / GitHub
```

## User Stories

Stories are grouped in build order. Each is sized for one focused session. IDs continue from the existing prd.json (US-475+).

### Phase 0 — Platform Foundation

**US-475: Core agent schema — definitions and runs.** Migration creating `agent_definitions` (name, domain, description, system_prompt, model, schedule_cron, autonomy_policy jsonb, daily_cost_cap_usd, enabled) and `agent_runs` (agent_id, trigger, status, input/output jsonb, tokens_in/out, cost_usd, error, started/finished_at). RLS admin-only. Regenerate types.

**US-476: Approval, escalation, and audit schema.** Migration creating `agent_approvals` (run_id, action_type, payload jsonb, status draft/approved/rejected/executed/expired, reviewed_by, expires_at), `agent_escalations` (tier, severity, domain, title, context jsonb, status, assigned_to, resolved_at), `agent_audit_log` (append-only; revoke UPDATE/DELETE). RLS admin-only.

**US-477: Shared agent runtime.** `functions/_shared/agent-runtime.ts`: Claude API client (model per agent_definition), agentic tool-use loop, structured-output helper (Zod), retry w/ backoff, and automatic `agent_runs` bookkeeping incl. token/cost accounting.

**US-478: Dispatcher + pg_cron.** `agent-dispatcher` edge function reads enabled `agent_definitions` whose schedule is due, checks kill switch + cost caps, invokes handlers, records skips. pg_cron every 5 min.

**US-479: Draft-first enforcement.** Runtime helpers `requestApproval()` and `escalate()` — the only paths to external effects. Runtime exposes no direct email/webhook capability to handlers; policy checked against `autonomy_policy` (an allowlisted action type may auto-execute).

**US-480: Budget guardrails + kill switch.** Per-agent daily spend enforced pre-run and mid-loop; `agent_system_settings` row for global pause; tripped caps create a tier-2 escalation.

**US-481: Knowledge base with pgvector.** `agent_knowledge` table (source, title, content, embedding vector) + `agent-knowledge-ingest` edge function (chunk, embed, upsert) + `match_agent_knowledge()` RPC. Seed with FAQ/help content.

**US-482: Approval execution engine.** `approval-executor` edge function: on approve, executes payload by action_type (send_email via Resend, social_webhook, github_issue), marks executed, writes audit; idempotent; expiry sweep.

### Phase 0.5 — Admin Command Center

**US-483: Command Center shell + agent registry.** `/admin/agents` page: agent cards w/ enable toggles, last run, today's spend vs cap, global kill switch. Lazy route, ProtectedRoute + admin gate.

**US-484: Approval queue UI.** List pending drafts w/ preview per action_type, inline edit-before-approve, approve/reject with reason, bulk approve for same-type templated items.

**US-485: Escalation queue UI.** Tier/severity-sorted queue, context viewer, assign/resolve with notes, tier-3 highlighted.

**US-486: Runs + cost dashboard.** Run history with filters, per-run detail (input/output/error), daily cost by agent chart, cap utilization.

**US-487: Audit log viewer.** Filterable append-only audit trail (who/what/when incl. human approvals), CSV export.

**US-488: Email digests.** `agent-digest` edge fn + cron: instant email on tier-3 escalation; daily digest of tier-2 items + pending approvals + spend summary via Resend to admin list.

### Phase 1A — Customer Service

**US-489: Support ticket intake.** `support_tickets` + `support_messages` tables (RLS: users own, admins all), contact-form wiring, `support-intake` edge function, statuses new→triaged→awaiting_reply→resolved.

**US-490: Triage agent.** Classifies new tickets (category, sentiment, priority, suggested tier), writes triage to ticket, tier-1 logs only; refund/legal/security/angry → escalation per rules.

**US-491: RAG answer agent.** Drafts replies for how-to/known-issue tickets using `match_agent_knowledge()` + ticket thread; cites sources; low-confidence → tier-2 escalation instead of a draft; drafts → approval queue.

**US-492: Escalation rules engine.** Declarative rules (jsonb in agent_definitions or table): billing/refund→tier2, legal/data-deletion/security→tier3, sentiment threshold→tier2, SLA breach (no reply 24h)→tier2. Unit-tested pure function.

**US-493: Bug-to-GitHub agent.** Bug-category tickets get a structured GitHub issue draft (repro, device, severity, linked ticket) → approval queue → executor files it via GitHub API and links back.

**US-494: Reply lifecycle.** Approved replies sent via Resend with ticket threading (reply-to token), ticket status transitions, user reply reopens ticket and re-enters triage.

**US-495: CSAT follow-up agent.** 24h after resolve, sends 1–5 rating email (templated → eligible for auto-send policy); score stored; ≤2 → tier-2 escalation.

### Phase 1B — Growth: Nurture

**US-496: Lifecycle event detection.** `agent_events` table + detection job: signup, first_kid_added, first_plan_created, first_grocery_list, inactive_7d/14d/30d, subscription_started/canceled. Idempotent (no duplicate events).

**US-497: Churn-risk scoring agent.** Weekly score per active household from activity signals; writes score + reasons; high-risk crossings → tier-2 escalation with suggested action.

**US-498: Nurture sequence engine.** `nurture_sequences` + `nurture_enrollments` tables: event-triggered enrollment, step delays, exit conditions, global suppression (unsubscribed, active ticket, recently emailed). Unsubscribe link honored everywhere.

**US-499: Onboarding sequence agent.** 4-step onboarding sequence (welcome → add-a-kid nudge → first-plan nudge → week-1 recap), personalized by actual usage; drafts → approval queue; templated steps flagged for future auto-send.

**US-500: Win-back agent.** inactive_14d/30d triggers personalized re-engagement drafts referencing the household's own data (kids' safe foods, past plans); caps frequency; → approval queue.

**US-501: Weekly digest email.** "Your week in EatPal" per opted-in household (plans made, new foods tried, streaks) — templated render, agent writes only the 1-2 sentence encouragement; → approval queue as bulk-approvable batch.

### Phase 1C — Growth: Prospecting & Content

**US-502: Content calendar agent.** Weekly plan of blog + social topics from seed keyword list + existing post inventory (no duplicates); writes `content_calendar` rows as tier-2 drafts (approve topics before generation).

**US-503: Blog pipeline integration.** Approved calendar topics flow through existing `generate-blog-content` + image pipeline; full draft (post + hero image) → approval queue; publish on approve.

**US-504: Social post agent.** Drafts Instagram/Pinterest posts (caption + image via existing pipeline + webhooks) from calendar topics and published blogs; → approval queue; executor posts via existing webhooks.

**US-505: SEO audit agent.** Weekly crawl of own sitemap: missing/duplicate meta, broken links, missing JSON-LD on recipe/blog pages; report as tier-2 escalation with per-page fixes.

### Phase 2A — Dev & Maintenance (later)

**US-506: Sentry triage agent.** Sentry webhook → dedupe against known issues → severity/user-impact assessment → GitHub issue draft (tier 2) or tier-3 escalation for crash spikes.

**US-507: Dependency update agent.** Weekly `npm audit` + outdated report; groups safe minor/patch bumps; drafts a GitHub issue (or PR description) with risk notes → approval queue.

**US-508: CI failure triage agent.** GitHub Actions failure webhook → classify (flake vs real, which commit) → comment draft on the PR or tier-2 escalation with suggested fix.

**US-509: Migration safety checker.** Lints migration SQL in PRs against CLAUDE.md backward-compat rules (DROP/RENAME/NOT NULL/type changes); violations → PR comment draft + tier-2 escalation.

### Phase 2B — Security, Ops & Business (later)

**US-510: Auth anomaly agent.** Periodic scan of auth logs: credential-stuffing patterns, impossible travel, mass signup bursts → tier-3 escalation with evidence (detection only, no auto-blocking).

**US-511: RLS audit agent.** Weekly: tables w/o RLS, permissive policies, new tables since last audit vs migration files → tier-2 report.

**US-512: Health + cost anomaly agent.** Extends `system_health`: error-rate/latency baselines, Supabase + Claude spend anomalies → tier-2 (tier-3 if sustained outage signal).

**US-513: Weekly business report agent.** Monday KPI email: signups, activation, retention, MRR (from user_subscriptions), support volume/CSAT, content output, agent costs; narrative summary + week-over-week deltas.

### Phase 3 — Learning Loop (later)

**US-514: Feedback loop.** Every approve/reject/edit is scored feedback on `agent_runs`; weekly self-eval report per agent (approval rate, edit distance, rejection reasons) → tier-2 report suggesting prompt changes.

**US-515: Prompt versioning + config UI.** Version history for `agent_definitions.system_prompt` w/ rollback; admin UI to edit prompt/schedule/policy/caps; changes audited.

## Functional Requirements

- FR-1: All agent state lives in `agent_*` tables with admin-only RLS; audit log is append-only.
- FR-2: The only external-effect paths are `requestApproval()` (→ human) and policy-allowlisted auto-execution; both go through `approval-executor` and are audited.
- FR-3: Dispatcher must check global kill switch and per-agent daily cost cap before every run; runtime re-checks cost mid-loop.
- FR-4: Every Claude API call records tokens and cost to `agent_runs`.
- FR-5: Tier-3 escalations trigger an instant email; tier-2 items appear in the daily digest and dashboard.
- FR-6: All outbound user email honors unsubscribe/suppression and includes an unsubscribe link.
- FR-7: All migrations are additive-only per CLAUDE.md backward-compat rules (new tables only — safe).
- FR-8: New UI copy goes through i18next keys per US-347 conventions.

## Non-Goals (Out of Scope)

- No autonomous sending in v1 — everything outward-facing is draft-first until per-agent policies are explicitly loosened.
- No auto-merge of code or auto-deploys; dev agents draft issues/comments only.
- No auto-blocking of users/IPs by the security agent (detect + escalate only).
- No paid-ads management or CRM integration.
- No mobile admin UI — Command Center is web-only.
- No multi-language outbound content (en only, matching current i18n state).

## Technical Considerations

- Claude models: `claude-haiku-4-5-20251001` for high-volume classification (triage, scoring); `claude-sonnet-5` for drafting (replies, emails, content). Configurable per agent row.
- Embeddings for `agent_knowledge` via an embedding model behind the ingest function; pgvector `match_agent_knowledge()` RPC follows existing Supabase RPC conventions.
- Resend is already integrated (`RESEND_API_KEY`); social webhooks exist from the image-gen pipeline work.
- `ANTHROPIC_API_KEY` stored as a Supabase Edge Function secret — never in the client or repo.
- Admin gating: reuse the existing admin role check used by `admin_alerts`/admin pages.
- Ralph branch: `ralph/agentic-os`, cut from `develop` per branching rules.

## Success Metrics

- ≥80% of support tickets receive an agent-drafted reply within 15 minutes of intake.
- Median human effort per tier-2 item < 60 seconds (approve or light edit).
- Draft approval rate ≥70% within 4 weeks (feedback loop target).
- 100% of external agent actions traceable in the audit log.
- Agent platform cost stays under configured caps with zero uncapped runs.

## Open Questions

- Inbound support email (vs. contact form only) — does Resend inbound routing get set up in Phase 1 or later?
- Which mailbox/admin list receives digests and tier-3 alerts?
- Seed keyword list for the content calendar agent — provided by user or derived from existing blog analytics?
- Should CSAT and weekly digest emails be the first candidates for the auto-send policy once approval rates prove out?
