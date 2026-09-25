# iOS: verify StoreKit transactions on the server

The EatPal iOS app writes its own `apple_subscriptions` row today
(`StoreKitService.swift`, `syncSubscriptionToSupabase`), and nothing checks what
it writes. Any signed-in account could post a Professional row with no expiry and
`effective_plan_id` granted it forever. Migration
`20260928000012_apple_subscription_client_caps.sql` caps those writes as a
stopgap: expiry required and at most 400 days out, one of the six product ids,
no re-activating a revoked or expired row, no moving a row between users. The
real fix is the new `verify-app-store-transaction` edge function. The app sends
Apple's signed transaction, and the server verifies the certificate chain and
writes the row itself.

## Endpoint

`POST {SUPABASE_URL}/functions/v1/verify-app-store-transaction`, with the user's
access token as `Authorization: Bearer ...` (supabase-swift's `functions.invoke`
attaches it).

Body: `{ "signedTransaction": "<VerificationResult.jwsRepresentation>" }`

| Status | Meaning | App should |
| --- | --- | --- |
| 200 `{ ok, product_id, expires_at, status }` | Recorded (or the server already held newer state) | Nothing |
| 401 | Not signed in | Sync after sign-in |
| 409 `transaction_owned_by_another_account` | This Apple purchase is linked to a different EatPal account | Tell the user which account holds it; do not retry |
| 422 `unverified_transaction` and similar | Not a valid Apple transaction for this app | Report to Sentry; do not retry |
| 503 | Server not configured or database down | Retry on the next launch or `Transaction.updates` |

Every column comes from the signed payload. The app no longer sends `user_id`,
`product_id`, `status` or `expires_at`.

## Changes in `StoreKitService.swift`

1. **Set `appAccountToken` on purchase.** In `purchase(_:)`, replace
   `product.purchase()` with
   `product.purchase(options: [.appAccountToken(session.user.id)])`, where
   `session` is `try await SupabaseManager.client.auth.session`. Apple copies the
   token into every transaction and server notification for that purchase, so
   the server can attribute a renewal or refund to the right user even when the
   device never syncs. The mapping is fixed: **appAccountToken = the EatPal
   user's `auth.users.id`**.

2. **Send the JWS, not the fields.** `jwsRepresentation` lives on
   `VerificationResult`, not on `Transaction`, so capture it before
   `checkVerified` unwraps the result. Change the helper to take the string:

   ```swift
   private func syncSubscriptionToSupabase(jws: String, transaction: StoreKit.Transaction) async {
       do {
           try await SupabaseManager.client.functions.invoke(
               "verify-app-store-transaction",
               options: FunctionInvokeOptions(body: ["signedTransaction": jws])
           )
       } catch {
           SentryService.capture(error, extras: [
               "context": "storekit_subscription_verify",
               "product_id": transaction.productID,
               "original_transaction_id": String(transaction.originalID)
           ])
       }
   }
   ```

   A non-2xx answer arrives as `FunctionsError.httpError(code:data:)`; branch on
   `code` for the 409 message in the table above. Delete the `SubscriptionPayload` struct and the `.from("apple_subscriptions").upsert(...)` call.

3. **Update the three call sites** to pass `result.jwsRepresentation`
   (`verification.jwsRepresentation` in `purchase`):
   - `purchase(_:)`, the `.success(let verification)` branch
   - `restorePurchases()`, the `currentEntitlements` loop
   - `listenForTransactions()`, the `Transaction.updates` loop

   Keep calling `transaction.finish()` whatever the server answers. Entitlement
   on the device still comes from `currentEntitlements`.

Local Xcode StoreKit testing (a `.storekit` configuration file) signs with a
local certificate, which the server refuses with 422. Test against the Sandbox
environment (TestFlight, or a Sandbox Apple Account), which Apple signs with its
real chain.

## Server configuration

- `APPLE_ROOT_CA_G3` on the edge-functions host: base64 DER of Apple Root CA - G3
  (`AppleRootCA-G3.cer` from https://www.apple.com/certificateauthority/,
  base64-encoded, no PEM header lines). Without it the endpoint answers 503 and
  `app-store-notifications` never creates rows.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, which are already set.
- App Store Server Notifications V2 must point at `app-store-notifications`. When
  Apple notifies about a transaction that has no row yet, that function now
  creates one for the user named by `appAccountToken`, but only if the full
  chain verifies.

## Retiring direct writes

Older builds keep writing directly, under the stopgap caps, until they fall
below the minimum supported version.

1. Ship the release with the changes above. Note its build number.
2. Raise `app_config.min_ios_build` to that build number once enough users are
   on it.
3. Then write a follow-up migration that drops the two client write policies
   from `20260601000002_apple_subscriptions.sql`:
   `"Users insert own apple subscription"` and
   `"Users update own apple subscription"`, declared with
   `-- migration-safety: allow drop-policy (<reason>)`. Keep
   `"Users view own apple subscription"`, since the web app reads the row
   (`src/hooks/usePlanStatus.ts`, `src/lib/checkoutSource.ts`). The
   `guard_apple_subscription_client_write` trigger can go in the same migration.

Don't drop the policies before step 2. Every older build still allowed to run
would lose its server-side sync.
