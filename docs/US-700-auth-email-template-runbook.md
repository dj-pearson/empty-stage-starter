# US-700: point GoTrue at the confirmation email template

**Status: operator action required. Nothing in this repo can apply it.**

## The fault

`src/pages/Auth.tsx:294` sends every new web signup to an OTP screen, and
`:296` tells them "We've sent a 6-digit verification code to your email."

The only thing that puts a code in that email is the `{{ .Token }}` placeholder
in `supabase/templates/confirmation.html`. GoTrue renders a custom template only
when `GOTRUE_MAILER_TEMPLATES_CONFIRMATION` points at one. On the production
container that variable is **empty**, so GoTrue falls back to its stock
link-only email. There is no code in it. Tapping Resend sends the same
link-only email again.

Measured on 2026-09-01 against 200 accounts: 18 sat unconfirmed and 35 never
reached a session at all, at a steady 4 to 8 per month.

Both template files in this repo are correct. The client code is correct. The
entire bug is one unset environment variable, which is why no test caught it.

## The change

Container: `supabase-auth-ig8ow4o4okkogowggkog4cww` (EatPal's Supabase stack on
`209.145.59.219`, managed by Coolify). Note there is a second Supabase stack on
that host belonging to a different project. Confirm you are on the one whose
`public` schema has a `kids` table before touching anything.

| Variable                               | Now     | Set to                                                  |
| -------------------------------------- | ------- | ------------------------------------------------------- |
| `GOTRUE_MAILER_TEMPLATES_CONFIRMATION` | (empty) | `https://tryeatpal.com/email-templates/confirmation.html` |
| `MAILER_TEMPLATES_CONFIRMATION`        | (empty) | same value                                              |

Both names are present on the container and GoTrue reads the `GOTRUE_`-prefixed
one; set both so a future image that drops the prefix does not silently revert
to the stock template.

The URL is already live and already serves a body containing `{{ .Token }}`
(it 308-redirects to the extensionless path, which GoTrue follows). It is
`public/email-templates/confirmation.html` in this repo, deployed with the site,
so it does not need to be uploaded anywhere separately.

## Applying it

1. Coolify dashboard, the Supabase service, Environment Variables.
2. Set both variables above.
3. Restart the auth container.
4. Verify: `GET https://api.tryeatpal.com/auth/v1/settings` with the anon key
   still reports `"mailer_autoconfirm": false` (unchanged, this is correct).
5. Sign up with a throwaway address and confirm the received email shows a
   6-digit code in the green dashed box, not a "Confirm your mail" link.
6. Delete the throwaway account.

## Do not

- Do not set `ENABLE_EMAIL_AUTOCONFIRM=true` as a shortcut. It would confirm
  every address without checking it and would let anyone register an address
  they do not own.
- Do not change `GOTRUE_SITE_URL` here. It is also wrong, but it is a separate
  fault with a separate blast radius: see US-701.

## Keeping it fixed

`scripts/ci/check-auth-email-templates.mjs` runs in the `quality` job of
`.github/workflows/ci.yml`. It always asserts both template copies still render
`{{ .Token }}`, and when `AUTH_CONFIRMATION_TEMPLATE_URL` is set as a repo
variable it also fetches that URL and fails if the served body has lost the
placeholder. Unset, it exits 0 with "no target configured", so it is safe on
forks and in PR runs without secrets.

`src/lib/authEmailTemplates.test.ts` covers the same placeholder assertion in
the normal vitest suite, so a local `npm run test:run` catches it before CI.

Neither can see the production environment variable. If it is unset again, the
first signal will be users failing to confirm. The check above narrows the
search to the container.
