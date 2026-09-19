# Auth flows verify emailed codes, not links (US-701)

**Status: complete. US-791 closed the last open item; see "The Expo client verifies a code too" below.**

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

## The Expo client verifies a code too (US-791, resolved 2026-09-18)

`app/(auth)/signup.tsx` used to call `signUp` and then render "We've sent a
confirmation link to {email}", with nothing behind it. Under the constraint at
the top of this document that link answers 401, so the screen created an account
and left no way to verify it.

**The decision: the screen gained a code entry; the Expo tree was not deleted.**
Retiring it in favour of `ios/EatPal` is still the direction, but nothing in the
repo has carried that out -- `eas.json` still defines `preview` and `production`
profiles, `package.json` still exposes `eas:build:ios:*`, and `babel.config.js`
still resolves the app tree -- so the tree is buildable today and a dead-end
signup in it is a live defect. Deleting it is an owner's call and a separate
story; adding the six-digit entry is not, and it costs one screen.

The flow now mirrors `app/(auth)/reset-password.tsx` and the web client:

| Step | Call | Notes |
| --- | --- | --- |
| Create the account | `supabase.auth.signUp` | No `emailRedirectTo`; the mail's link is unusable here and the code is what the screen asks for. |
| Verify | `verifyOtp({ email, token, type: 'signup' })` | Same type the web client uses at `src/pages/Auth.tsx:327`. |
| Resend | `supabase.auth.resend({ type: 'signup', email })` | "Send me a new code", same affordance as the reset screen. |
| Failure copy | `classifyOtpError` + `otpFailureFallbackMessage` | The Expo tree never mounts `<I18nextProvider>`, so it cannot call `t()`. The fallback returns the literal en.json strings, and a test asserts each one equals the value `otpFailureMessageKey` points at, so the two clients cannot end up wording the same GoTrue failure differently. |

On success the user is already signed in -- `verifyOtp` returns a session -- so
the screen goes to `/(tabs)/` rather than back to login with a password they
just chose.

Held by `src/lib/expoSignupVerification.test.ts`, which scans the screen as
source (vitest's include is `src/**`, and the react-native tree is not in it).
All seven of its cases fail against the version this replaced.

The Swift client in `ios/EatPal/` has the same gap and it is US-703's, not this
one's.
