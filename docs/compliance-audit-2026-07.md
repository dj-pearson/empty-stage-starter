# EatPal — Compliance Audit (Legal Pages · ADA/WCAG · GDPR/US Privacy)

**Date:** 2026-07-23
**Scope:** `tryeatpal.com` web app + Supabase edge functions/migrations. iOS is live in the App Store; the DB is shared by shipped iOS builds.
**Product note:** EatPal stores data *about children* (kids' names, dates of birth, ages, allergens), so COPPA and GDPR‑for‑children exposure is a first‑class concern.
**Method:** Static audit of the codebase (three parallel reviews: legal coverage, privacy implementation, accessibility). Key findings spot‑verified against source. No runtime/pen testing; no code was changed by this audit.

> **Not legal advice.** This is an engineering compliance review. Policy/legal wording (Privacy, Terms, CCPA, GDPR, COPPA notices) should be finalized with counsel. Everything below is actionable at the code/product level.

---

## Overall posture

| Area | Verdict | One‑line |
|---|---|---|
| Required legal pages | 🟡 Partial | Privacy/Terms/Accessibility/VPAT/Contact/FAQ exist, routed & linked — but content has material gaps & self‑contradictions. |
| GDPR / EU | 🔴 Not compliant | **No cookie/tracking consent of any kind**; analytics + session‑replay fire unconsented; child PII sent to LLMs undisclosed. |
| CCPA / CPRA (US) | 🟡 Partial | "We do not sell" stated; DSAR self‑service exists; but no CCPA rights section / "Do Not Sell or Share" notice. |
| COPPA / children | 🟡 At risk | Parent‑managed model lowers direct exposure, but no guardian attestation, no child‑data consent record, child PII disclosed to LLM subprocessors. |
| ADA / WCAG 2.1–2.2 AA | 🟡 Partial | Strong a11y foundation, but ~100+ nameless icon buttons, broken toggles, and a **VPAT that overclaims conformance** (legal risk). |

**The single most urgent item:** there is no consent management layer. Google Analytics (`public/ga-loader.js`) and Sentry Session Replay load unconditionally on every visit, with no Consent Mode and no banner. For an EU‑reachable app handling children's data, this is the top legal exposure.

---

## 1. Required legal documents & pages

### Present, routed, and linked
| Document | File | Route | Linked |
|---|---|---|---|
| Privacy Policy | `src/pages/PrivacyPolicy.tsx` | `/privacy` | `Footer.tsx:98` |
| Terms of Service | `src/pages/TermsOfService.tsx` | `/terms` | `Footer.tsx:103` |
| Accessibility Statement | `src/pages/Accessibility.tsx` | `/accessibility` | `Footer.tsx:108` |
| VPAT | `src/pages/VPAT.tsx` | `/accessibility/vpat` | from Accessibility page |
| Contact / FAQ | `Contact.tsx` / `FAQ.tsx` | `/contact` `/faq` | Footer |
| ai‑policy / robots / sitemap | `public/ai-policy.txt`, etc. | static | robots |

### Missing or incomplete
| Document | Status | Severity |
|---|---|---|
| **Cookie Policy + consent banner** | No standalone policy; **no consent banner exists** in `src/` | 🔴 High |
| **CCPA "Do Not Sell or Share" notice** | Missing; no CA rights section, no PI categories | 🔴 High |
| **GDPR‑specific section** (lawful basis, SCCs, DPO/EU rep, right to complain) | Missing (Privacy §9 covers US transfer only) | 🔴 High |
| **Subprocessor list** | Missing — only Stripe is named (see §2) | 🔴 High |
| **COPPA / children's‑privacy notice** (verifiable parental consent, child‑data retention/deletion) | Incomplete (Privacy §4 partial) | 🔴 High |
| **Data‑retention section** in Privacy Policy | Missing entirely | 🟡 Medium |
| **Apple Standard EULA / App Store licensing** | Missing for a live iOS app | 🟡 Medium |
| **DPA** (for any B2B / professional sharing) | Missing | 🟡 Medium |
| **security.txt** (`/.well-known/security.txt`) | Missing (best practice) | 🟢 Low |

### Content gaps in the existing Privacy Policy (`src/pages/PrivacyPolicy.tsx`)
- **Stale date** — "Last Updated: October 28, 2025" (`:40`); predates current AI‑feature data flows.
- **Third parties under‑disclosed** — only **Stripe** named (`:63`). Actually in use and **undisclosed**: **Supabase, Sentry, Google Analytics, Resend, and AI vendors (Anthropic/OpenAI/Gemini)**.
- **No retention section.**
- **No AI‑processing disclosure** — meal/child data is sent to third‑party LLMs.
- **International transfer** minimal (US‑only, no SCC/transfer mechanism).
- **Cookie disclosure** is one generic paragraph (`:144‑149`); no cookie table, no consent.
- Contact is a single support email (`:173`); no postal address / DPO / EU‑UK representative.

### Cross‑document contradictions (consumer‑protection risk)
1. **Refunds** — ToS §4 (`TermsOfService.tsx:97`) "We do not provide refunds for partial months or years," but Pricing advertises a **"30‑Day Money‑Back Guarantee … full refund. No questions asked"** (`Pricing.tsx:1161,1193`). The binding ToS contradicts the marketed promise.
2. **Data deletion** — Privacy §7 and Account Settings grant deletion, but Pricing FAQ says **"Your data is never deleted"** (`Pricing.tsx:1211`). Direct conflict with the stated erasure right.
3. **Age gate vs. audience** — ToS requires users be **18+** (`:74`) with no parent/guardian framing, despite the product being built around children's data.
4. **Governing law** (`TermsOfService.tsx:199`) names "the laws of the United States" with **no state, venue, or dispute clause** — generally unenforceable as written.
5. **Accessibility/VPAT dates are dynamic** — `Accessibility.tsx:53` and `VPAT.tsx:154` render `new Date()`, so a legal attestation always shows "today." A VPAT must carry a fixed report date.

---

## 2. GDPR / CCPA‑CPRA / COPPA — implementation audit

### 🔴 Critical — no consent management
- **Google Analytics loads with zero consent.** `public/ga-loader.js` injects GA `G-H6792J1CQT` on first interaction / after 5s, unconditionally; `index.html:130` includes it with no gate and preconnects to googletagmanager. **No Google Consent Mode** (`ad_storage`/`analytics_storage` = 0 hits).
- **Sentry Session Replay fires unconsented.** `src/lib/sentry.tsx:21‑53` inits in production with `replaysSessionSampleRate: 0.1` — 10% of sessions recorded and sent to a US processor with no consent. *Mitigations present:* `maskAllText`, `blockAllMedia`, `beforeSend` scrubbing (cookies/Authorization/email/phone/password); `sendDefaultPii` left off. Replay itself remains unconsented processing.
- **Law:** GDPR Art. 6 + ePrivacy Art. 5(3); CPRA opt‑out of sharing.

### 🔴 High — children's PII sent to LLMs
- `supabase/functions/ai-coach-chat/index.ts:48` sends child **name + age + allergens**; `ai-meal-plan/index.ts:45` sends **name + age + allergens + favorite foods**; provider resolved in `_shared/ai-service-v2.ts` (Anthropic / OpenAI / Gemini).
- No subprocessor disclosure, no parental‑consent record, no "no‑train / zero‑retention" flag on the requests.

### 🔴 High — erasure is incomplete
- `supabase/functions/delete-account/index.ts` scrubs ~20 user‑scoped tables then deletes the auth user — **but email‑marketing subscriber rows (`email_subscribers`, keyed by email) and `backup_logs` are not in the deletion set**, so the user's email survives "delete everything." (GDPR Art. 17.)

### 🔴 High — marketing consent pre‑granted
- `supabase/migrations/20251110000000_picky_eater_quiz.sql:109` — `accepts_marketing BOOLEAN DEFAULT true`. Consent must be opt‑in, not defaulted on. (GDPR Art. 4(11)/7; PECR/CAN‑SPAM.)

### 🟡 Medium‑High — no consent / terms‑acceptance record
- Signup shows passive text only (`Auth.tsx:939`, "By continuing you agree…") with **no checkbox and no stored acceptance timestamp/version**. No `terms_accepted`/consent column exists. Cannot *demonstrate* consent (GDPR Art. 7(1)).

### 🟡 Medium — no age/guardian gate; no retention schedule
- No "I am the parent/guardian" attestation or age gate at signup despite storing child `date_of_birth`.
- Only `backup_logs` has a `retention_days`; no general retention/auto‑purge for inactive accounts or child data (GDPR Art. 5(1)(e)).

### ✅ Genuinely compliant (keep)
- **Self‑service data export** — `src/pages/dashboard/AccountSettings.tsx:253` downloads structured JSON (portability, Art. 20). *(Minor: omits `quiz_responses`, `meal_voting`.)*
- **Account deletion** — wired end‑to‑end with typed‑email confirmation (`AccountSettings.tsx:359` → `delete-account`).
- **RLS** — enabled and household‑scoped on `kids`, `foods`, and related tables (Art. 32).
- Sentry replay masking + `beforeSend` scrubbing; `sendDefaultPii` off; unsubscribe‑token/`confirmed` on `email_subscribers`.

---

## 3. ADA / WCAG 2.1–2.2 AA — accessibility audit

### Strong foundation already in place (credit)
`AccessibilityContext` (reduced‑motion / contrast / forced‑colors detection + `announce()`), `SkipToContent` (→ `#main-content`), `RouteAnnouncer`, `useReducedMotion` / `useKeyboardNavigation` (focus‑trap + roving tabindex toolkits), `<html lang="en">`, `main` landmarks app‑wide, `OptimizedImage` with **required** `alt`, label‑associated forms (Auth/Contact/ResetPassword), reduced‑motion + high‑contrast CSS, sonner live regions, and an `@axe-core/playwright` suite. No `aria-hidden` on focusable elements. These are done well.

### 🔴 High — ~100+ icon‑only buttons with no accessible name
- **109** `<Button size="icon">`‑style controls outside `ui/` contain only an `aria-hidden` lucide icon with **no `aria-label`** → empty accessible name. Examples: `NotificationBell.tsx:192`, `SocialShare.tsx:61‑67`, `Navigation.tsx:166` (theme toggle), `FoodCard.tsx:88`, `admin/RichTextEditor.tsx:149‑365`, plus ~95 more (heavy in `admin/`). WCAG **4.1.2 / 2.4.4 / 2.5.3**.
- A purpose‑built `AccessibleIconButton` helper already exists in `SkipToContent.tsx` but has **zero adoption** — the fix is largely mechanical.

### 🔴 High — VPAT / Accessibility page overclaim conformance (legal risk)
- `VPAT.tsx` marks nearly every criterion **"Supports"**; several are contradicted by this audit: 4.1.2 (`:55`), 2.5.3 (`:47`), 2.2.2 (`:39`), 2.1.2 (`:36`). An inaccurate VPAT is a material ADA / Section‑508 procurement misrepresentation. Correct the claims to match reality.

### 🟡 Medium
- **Dead toggles** — `AccessibilityWidget.tsx` "Large Text" switch (and `simplifiedUI` / `verboseDescriptions`) are announced as enabled but never applied by `AccessibilityContext` (they change nothing). The separate `fontSize` control does work. WCAG **1.4.4**.
- **Widget dialog doesn't trap/restore focus** — `AccessibilityWidget.tsx:98` is `aria-modal="true"` but only implements Escape; Tab escapes it and focus isn't restored to the trigger. (Radix dialogs elsewhere are fine.) WCAG **2.4.3**.
- **Framer‑motion not reduced‑motion‑gated** — 6 of 16 motion files (`Pantry.tsx`, `PickyEaterQuiz(.Results)`, `BudgetCalculatorResults`, `MealPlanGeneratorResults`, `MealVotingCard`) ignore reduced‑motion; the global CSS media query doesn't stop JS/WAAPI transforms. No app‑root `<MotionConfig reducedMotion="user">`. WCAG **2.3.3 / 2.2.2**.
- **Hardcoded colors** — 679 literal Tailwind color utilities outside `ui/` (violates CLAUDE.md's semantic‑token rule) bypass high‑contrast remapping. Genuine default‑theme low‑contrast is *rare* (mostly white‑on‑saturated, likely passing) — this is a systemic/high‑contrast‑mode issue, not mass default‑mode failure. WCAG **1.4.3**.

### 🟡 Medium — automated a11y coverage is shallow
- `tests/accessibility/a11y.spec.ts` scans **only public pages** (misses authenticated/admin, where nameless buttons cluster), asserts only on `impact === 'critical'` (nameless buttons are "serious" → never fail the build), and navigates to **`/about`, which has no route**. No `eslint-plugin-jsx-a11y`, no Lighthouse CI. So these defects are caught by neither lint nor CI.

---

## Prioritized remediation roadmap

### P0 — Critical (legal exposure, do first)
1. **Consent management layer.** Add a cookie/consent banner; gate `public/ga-loader.js` and Sentry init behind consent; implement Google Consent Mode v2 (default `denied`). Persist consent state.
2. **Correct the VPAT & Accessibility claims** to reflect actual conformance (change overclaimed "Supports" → "Partially Supports" with remarks; pin a fixed report date).
3. **AI data disclosure + guardrails.** Disclose LLM subprocessors; add no‑train/zero‑retention flags to `ai-coach-chat` / `ai-meal-plan`; add parental‑consent framing for child data.

### P1 — High
4. **Fix erasure gap** — add `email_subscribers` + `backup_logs` (email‑keyed) to `delete-account` scrubbing.
5. **Marketing opt‑in** — change `accepts_marketing DEFAULT true` → `false` (additive, backward‑compatible migration) and make the quiz checkbox unchecked.
6. **Icon‑button accessible names** — adopt `AccessibleIconButton` / add `aria-label` across the ~109 controls.
7. **Resolve refund & deletion contradictions** — align ToS, Pricing banner, and FAQ on one truth.
8. **Add missing legal sections** (with counsel): CCPA "Do Not Sell/Share," GDPR section, subprocessor list, retention, COPPA notice, cookie policy; refresh Privacy third‑party list & date.

### P2 — Medium
9. Store terms/privacy acceptance (checkbox + timestamp + version) at signup.
10. Parent/guardian attestation / age gate.
11. Wire or remove dead a11y toggles; add focus‑trap to the widget; add `<MotionConfig reducedMotion="user">`.
12. Harden a11y CI: scan authed pages, fail on `serious`, fix `/about`, add `eslint-plugin-jsx-a11y`.
13. Data‑retention schedule; Apple Standard EULA reference.

### P3 — Low
14. `security.txt`; migrate hardcoded colors to semantic tokens; broaden export to include `quiz_responses`/`meal_voting`.

---

## Backward‑compatibility note (per CLAUDE.md)
Any DB change above must be additive — the schema is shared by shipped iOS builds. The marketing‑default fix (#5) is a new default on an existing column and is safe; adding consent/terms‑acceptance columns is `ADD COLUMN … NULL/DEFAULT`. No drops/renames/tightened constraints are required for this roadmap.

---

## Remediation status (this PR)

Implemented on branch `claude/compliance-audit-docs-accessibility-a780au`:

| # | Item | Status | Notes |
|---|---|---|---|
| P0‑1 | Consent management (banner, GA + Sentry replay gated, Consent Mode v2) | ✅ Done | `CookieConsentBanner`, `lib/consent.ts`, rewritten `ga-loader.js`, Sentry replay gated |
| P0‑2 | Correct VPAT / Accessibility claims + fixed dates | ✅ Done | 5 criteria → "Partially Supports"; dates pinned |
| P0‑3 | AI subprocessor disclosure | ✅ Done (disclosure) | Privacy Policy §5/§6 drafts; no‑train/zero‑retention flag on AI calls still TODO |
| P1‑4 | Erasure gap (email_subscribers, backup_logs) | ✅ Done | `delete-account` scrubs email‑keyed rows |
| P1‑5 | Marketing opt‑in (default false + UI) | ✅ Done | migration + both email‑capture modals |
| P1‑6 | Icon‑button accessible names | ✅ Done | 81 buttons across 35 files |
| P1‑7 | Refund & deletion contradictions | ✅ Done | Terms/FAQ/Pricing reconciled |
| P1‑8 | Missing legal sections (CCPA, GDPR, cookie, subprocessors, retention, COPPA) | ✅ Drafted | **Counsel sign‑off required before ship** |
| P2‑9 | Consent/terms‑acceptance record at signup | ✅ Done | required checkbox → user metadata (accepted, ts, version) |
| P2‑10 | Parent/guardian + 18+ attestation | ✅ Done | same signup checkbox |
| P2‑11 | Dead a11y toggles / widget focus‑trap / `MotionConfig` | ✅ Done | toggles wired, focus trapped+restored, app‑root reduced motion |
| P2‑12 | a11y CI hardening | ✅ Mostly | fixed dead `/about`, scan legal pages, added `eslint-plugin-jsx-a11y` (warnings). Authed‑page scan still needs a login fixture (skipped placeholder) |
| P2‑13 | Retention section + Apple EULA | ✅ Done (docs) | Privacy retention section + Terms Apple EULA reference. Auto‑purge job still TODO |
| P3‑14 | security.txt + broaden export | ✅ Done | `/.well-known/security.txt`; export adds `quiz_responses`/`meal_voting` |

**Still open (intentionally deferred):**
- **AI no‑train/zero‑retention flags** on `ai-coach-chat` / `ai-meal-plan` requests (disclosure done; provider‑side flag not yet set).
- **Retention auto‑purge** background job for inactive accounts (policy documented; no scheduled job yet).
- **Hardcoded‑color → semantic‑token migration** (679 instances) — large mechanical sweep, deferred to avoid a noisy high‑risk diff.
- **Authenticated‑page a11y scanning** — needs a Playwright auth fixture.
- **Legal copy is DRAFT** — all new Privacy/Terms sections require counsel review before shipping; historical `accepts_marketing=true` rows are left as a marketing/legal decision.
