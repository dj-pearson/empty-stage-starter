# Auth flows verify emailed codes, not links (US-701)

**Status: repo-side complete. The one open item is a new story, US-791, named below.**

## The constraint this is built around

Coolify sets `GOTRUE_SITE_URL` to `${SERVICE_URL_SUPABASEKONG}` and does not let
you change it. Every GoTrue email link falls back to `SITE_URL` when the request
carried no `redirectTo` that GoTrue will honour, so the link lands on the Kong
gateway, which answers `401 application/json`. Verified live against
`https://api.tryeatpal.com/`.

That is the reason this project verifies a `{{ .Token }}` from the email rather
than following a link. **Do not propose repointing `SITE_URL` again** — it is
not a setting this deployment owns.

`GOTRUE_URI_ALLOW_LIST` *can* be set, and is
(`documents/OAUTH_CONFIG.md`). A `redirectTo` on that list is honoured; anything
else is silently swapped for `SITE_URL`, with no error on either side. So a
wrong redirect does not fail loudly, it fails exactly like the broken default.

## Flow audit

| Flow | Client entry | Verifies how | Depends on a link? |
| --- | --- | --- | --- |
| Signup | `src/pages/Auth.tsx` `handleSignUp` -> `handleVerifyOtp` | `verifyOtp({ email, token, type: 'signup' })` at `Auth.tsx:327` | No. The mail carries both; only the code is used. |
| Password recovery | `src/pages/ResetPassword.tsx` | `verifyOtp` twice: a `token_hash` arriving on the URL at `:68`, a typed 6-digit code at `:109` | No. The typed code is the path that works when the link cannot. |
| Magic link | `src/pages/AuthCallback.tsx:72` | `verifyOtp({ token_hash, type })` | No. The token arrives from the OAuth proxy edge function on `functions.tryeatpal.com`, which the repo controls; it is not a `SITE_URL` redirect. |
| Email change | none | none | n/a — see below. |
| Invite | none | none | n/a — see below. |

**Two of the five templates back flows no client triggers.**
`src/pages/dashboard/AccountSettings.tsx` calls `updateUser` only for
`display_name` (`:145`) and `password` (`:201`); there is no
`updateUser({ email })` anywhere in `src/`, so nothing sends an email-change
mail. Household invites go through `create_household_invite` and a code the user
copies, not through GoTrue's invite mail. Both templates stay in the repo and
stay gated by `scripts/ci/check-auth-email-templates.mjs`: they cost nothing, and
a flow added later inherits a token-bearing template instead of a link-only one.

## The `emailRedirectTo` guard

One call site passes a redirect: signup, where the confirmation mail carries a
link as well as a code. It now goes through `allowedEmailRedirect`
(`src/lib/authRedirect.ts`), which drops anything that is not https and on the
allow list, and logs why. Two tests hold it in place
(`src/lib/authRedirect.test.ts`):

- the allow list in code must equal the one documented in
  `documents/OAUTH_CONFIG.md`, so the copy cannot drift from its source;
- every `emailRedirectTo` under `src/` must go through the guard, so a second
  call site added later fails the suite rather than production mail.

## Open finding: the Expo client still promises a link

`app/(auth)/signup.tsx:61` calls `signUp` and then renders "We've sent a
confirmation link to {email}. Please verify your email to complete signup."
There is no code entry behind it, so that screen is the dead end this story
exists to remove — it just happens to be in the Expo client rather than the web
one. Filed as **US-791** rather than fixed here: the Swift app in `ios/EatPal/`
is the canonical iOS client and the Expo tree is being retired, so whether that
screen gets a code entry or gets deleted is a scope decision, not a bug fix.

The Swift client has the same gap and it is US-703's, not this one's.
