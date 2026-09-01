# US-700: point GoTrue at the auth email templates

**Status: operator action required. Nothing in this repo can apply it.**

## The fault

Every auth flow here asks the user for a 6-digit code: signup
(`src/pages/Auth.tsx:296`) and password reset (`src/pages/ResetPassword.tsx:70`,
`app/(auth)/reset-password.tsx:58`). The only thing that puts a code in an email
is the `{{ .Token }}` placeholder in the matching template.

GoTrue renders a custom template only when its `MAILER_TEMPLATES_*` variables
point at one. On this deployment they are all empty, so GoTrue sends its stock
link-only emails and the code every client demands exists nowhere. Resend sends
the same link-only mail again.

Measured on 2026-09-01 against 200 accounts: 18 sat unconfirmed and 35 never
reached a session at all, at a steady 4 to 8 per month.

This is not survivable by falling back to the link. `GOTRUE_SITE_URL` is set by
Coolify to `${SERVICE_URL_SUPABASEKONG}` and cannot be changed, so a link that
falls back to it lands on the Kong gateway and answers `401 application/json`.
The token template is the only delivery shape that works.

## The trap: the key Coolify needs is NOT the one the container shows

This has now silently failed twice. `docker-compose.yml:475` reads:

```yaml
GOTRUE_MAILER_TEMPLATES_CONFIRMATION: '${MAILER_TEMPLATES_CONFIRMATION}'
```

The variable **inside the container** is `GOTRUE_`-prefixed. The key **Coolify
must hold** is not. Setting `GOTRUE_MAILER_TEMPLATES_CONFIRMATION` in Coolify
writes a key the compose never reads; the container keeps its empty value and
nothing anywhere reports an error.

The service `.env` currently carries a whole dead block from an earlier attempt
(lines 112-118), pointing at `/templates/*.html` paths that are not mounted into
the container either. Ignore it. Only the unprefixed keys below do anything.

## The change

Service: `ig8ow4o4okkogowggkog4cww` (EatPal's Supabase stack on
`209.145.59.219`). There are several Supabase stacks on that host; confirm the
one whose `public` schema has a `kids` table before touching anything.

Set these keys in Coolify, **without the `GOTRUE_` prefix**:

| Coolify key                     | Value                                                       |
| ------------------------------- | ----------------------------------------------------------- |
| `MAILER_TEMPLATES_CONFIRMATION` | `https://tryeatpal.com/email-templates/confirmation.html`   |
| `MAILER_TEMPLATES_RECOVERY`     | `https://tryeatpal.com/email-templates/recovery.html`       |
| `MAILER_TEMPLATES_MAGIC_LINK`   | `https://tryeatpal.com/email-templates/magic_link.html`     |
| `MAILER_TEMPLATES_EMAIL_CHANGE` | `https://tryeatpal.com/email-templates/email_change.html`   |
| `MAILER_TEMPLATES_INVITE`       | `https://tryeatpal.com/email-templates/invite.html`         |

All five URLs are already live and already serve `{{ .Token }}`; they are
`public/email-templates/*.html` in this repo, deployed with the site. They
308-redirect to their extensionless path, which GoTrue follows. The auth
container has outbound network access and fetches them successfully (verified
2026-09-01 with `wget` from inside the container).

## Applying it

It took four attempts to land this. Each failure looked like success in the
dashboard, so work top-down and verify on the container at step 3, never on the
UI.

1. Coolify, the Supabase service, Environment Variables. **These keys already
   exist in the list with empty values.** Scroll to them and edit each row in
   place. Do NOT use "Add environment variable": adding a key that already
   exists collides and silently does nothing, which is how the second attempt
   was lost with no error shown.
2. **Redeploy, do not just restart.** A restart reuses the container's existing
   environment; the new values only reach it on a recreate.
3. Verify the container actually received them:
   ```
   docker inspect supabase-auth-ig8ow4o4okkogowggkog4cww \
     --format '{{range .Config.Env}}{{println .}}{{end}}' \
     | grep MAILER_TEMPLATES
   ```
   Every `GOTRUE_MAILER_TEMPLATES_*` line must now carry a URL, and each must
   point at its OWN template. Check the filenames, not just that a URL is
   present: the third attempt set confirmation to recovery.html, which would
   have mailed new signups a body headed "Password Reset". If the lines are
   still empty, the value went into a prefixed key again, or the save collided
   with an existing row.
4. Sign up with a throwaway address. The email must show a 6-digit code in the
   green dashed box, not a "Confirm your mail" link.
5. Request a password reset for the same address and confirm the same.
6. Delete the throwaway account.

## Do not

- Do not set `ENABLE_EMAIL_AUTOCONFIRM=true` as a shortcut. It would confirm
  every address without checking it and would let anyone register an address
  they do not own.
- Do not try to fix this by repointing `GOTRUE_SITE_URL`. Coolify owns it and
  it cannot be changed. See US-701.
- Do not set the `GOTRUE_`-prefixed keys in Coolify. That is the trap above.

## Keeping it fixed

`scripts/ci/check-auth-email-templates.mjs` runs in the `quality` job of
`.github/workflows/ci.yml`. It asserts all five templates still render
`{{ .Token }}` in both copies, and when the repo variable
`AUTH_TEMPLATE_BASE_URL` is set (to `https://tryeatpal.com/email-templates`) it
also fetches each hosted template and fails if one has lost the placeholder.
Unset, it exits 0, so forks and secretless PR runs pass.

`src/lib/authEmailTemplates.test.ts` covers the same assertions in the normal
vitest suite, so `npm run test:run` catches a regression before CI.

Neither can see the production environment. If the variables are unset again,
the first signal will be users failing to confirm or reset. Step 3 above is the
check that tells you in one command.
