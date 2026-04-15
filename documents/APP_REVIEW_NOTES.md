# EatPal — App Review Notes

Paste-ready text for the **App Review Information** section in App Store Connect when submitting version 1.0. Fill the `<<FILL IN>>` placeholders before submitting.

---

## 1. Demo account

App Store Connect → App Review Information → **Sign-In Required** = Yes.

| Field | Value |
|---|---|
| User name | `<<FILL IN — pre-created demo email, e.g. appreview@tryeatpal.com>>` |
| Password | `<<FILL IN>>` |

**Seed this account before submitting** so reviewers see a populated, working app (not an onboarding wizard). Minimum seed data:
- 2 kid profiles with names like `Emma` (picky, dairy allergy) and `Liam` (adventurous eater)
- 5–10 safe foods per kid
- A completed week of meal plans
- 1 active subscription so paywall-gated features are inspectable without purchasing (tier: `Pro`)

> Alternative: if you prefer reviewers test the purchase flow themselves, remove the seeded subscription and note it in §3 below. Sandbox purchases don't charge real money.

---

## 2. App Review Information → **Notes** (paste the block below)

```
EatPal is a meal-planning and nutrition app for parents of picky eaters and children with feeding challenges (including autism spectrum, sensory processing differences, and ARFID). The app is not a medical device and makes no diagnostic or treatment claims.

──────────── HOW TO TEST ────────────

1. Sign in with the demo credentials provided above. The demo account has two kid profiles and a week of pre-populated meal plans so the app shows real content immediately.

2. CORE FLOW:
   • Tap the "Meal Plan" tab to see the weekly plan for the active kid.
   • Tap any meal slot to add a food or recipe.
   • Tap "Grocery" tab to see the auto-generated list grouped by aisle.
   • Tap the kid-switcher at top to view a different child's plan.

3. AI MEAL COACH (requires Pro tier — demo account has this):
   • Tap "AI Coach" tab.
   • Ask: "What are some lunch ideas Emma might try?"
   • The coach responds using Emma's stored safe-food list.
   • The coach is prompt-constrained to nutrition topics only.

4. BARCODE SCANNER (requires Pro tier, requires camera permission):
   • In the "Pantry" tab, tap the scanner icon.
   • iOS prompts for camera permission (purpose string in Info.plist).
   • Any barcode will work — the app queries the Open Food Facts database and falls back to a manual entry form if the product isn't found.

5. HOME-SCREEN WIDGET:
   • Long-press any home-screen empty area → "+" → search "EatPal" → Add small or medium widget.
   • Widget reads from a shared App Group and shows today's meals.

──────────── SUBSCRIPTIONS ────────────

Six auto-renewable products in one subscription group (EatPal Subscriptions):
  • Pro Monthly — com.eatpal.app.pro.monthly — $14.99/mo
  • Pro Yearly — com.eatpal.app.pro.yearly — $143.90/yr
  • Family Plus Monthly — com.eatpal.app.familyplus.monthly — $24.99/mo
  • Family Plus Yearly — com.eatpal.app.familyplus.yearly — $239.90/yr
  • Professional Monthly — com.eatpal.app.professional.monthly — $99/mo
  • Professional Yearly — com.eatpal.app.professional.yearly — $950/yr

All paid tiers include a 7-day free trial for new subscribers. A free tier (no purchase required) gives one kid profile and manual planning.

Sandbox purchase path: tap any "Pro required" feature (e.g. AI Coach, Barcode Scanner) → the paywall appears → tap any tier → confirm with sandbox Apple ID → full entitlement flows through StoreKit 2 Transaction updates and is verified server-side via Supabase.

──────────── THIRD-PARTY SERVICES ────────────

• Supabase — backend: auth, database, realtime sync, edge functions. Our own instance.
• Open Food Facts — public nutrition database (barcode lookups). Read-only; no data sent.
• Instacart API (Family Plus+) — grocery delivery handoff. Only triggered when user taps "Order Ingredients"; requires OAuth consent on Instacart's side.
• OpenAI — powers the AI coach. Requests are server-side through our Supabase edge function (NOT direct client-to-OpenAI); no PII is sent — we strip names and replace with tokens before the LLM sees the prompt.

──────────── PRIVACY & DATA ────────────

• No advertising identifiers.
• No third-party analytics SDKs that track users.
• Sentry is used for crash reporting only (no PII).
• All kid data (names, allergies, meal history) is scoped per-parent-account with Supabase Row Level Security.
• Privacy policy: https://tryeatpal.com/privacy
• Data collection disclosures match the App Privacy questionnaire.

──────────── AGE RATING ────────────

4+. No user-generated content is shared publicly. No in-app social feed. No web browser. The AI coach is constrained via system prompt to nutrition topics only and has safety rails against non-food-related requests.

──────────── MEDICAL DISCLAIMER ────────────

EatPal provides meal planning and nutrition tracking tools. It is NOT a medical device, NOT a diagnostic tool, and NOT a replacement for professional feeding therapy. The Professional tier is designed for licensed feeding therapists, pediatric dietitians, and SLPs who want to manage multiple client families — the app's tools supplement, not replace, their clinical judgment. This disclaimer is shown in-app on first launch and in the Settings screen.

──────────── CONTACT ────────────

Technical questions during review: <<FILL IN — dev contact email>>
Response SLA: <4 hours on weekdays, <12 hours on weekends.
Phone: <<FILL IN — review team phone number>>
```

---

## 3. Per-IAP review notes

Each of the six IAPs has its own "Review Notes" field. Paste this same block into each one (it's short so repetition is fine):

```
Subscription grants access to tier-gated features.

TO TEST: Sign in with the demo account provided in the app review notes. Tap any feature marked "Pro required" (e.g. AI Coach tab, Barcode Scanner in Pantry). The paywall sheet appears and lists this product. Tap the tier, confirm with a sandbox Apple ID. Full entitlement is granted immediately and the app closes the paywall.

To test restore: after purchase, delete and reinstall the app, sign in, tap "Restore Purchases" on the paywall. Tier is re-granted from the StoreKit 2 transaction history.
```

**Review screenshot per product**: 1024×1024 PNG of the paywall sheet with the specific product highlighted. Easiest way — run the app in a simulator or on device, open the paywall, take a screenshot, crop to 1024×1024.

---

## 4. Pre-emptive answers to common reviewer questions

If rejection happens, it's usually one of these. Address all of them in §2 notes above — but here's the running list in case a reviewer asks directly:

### "Does the AI coach generate medical advice?"
No. System prompt constrains the model to meal ideas, food introduction strategies, and nutrition basics. Explicit refusal for medical/clinical questions ("I'm not a doctor — please check with your pediatrician"). Example prompts in the app's prompt library show this behavior.

### "Why does the app request camera permission?"
Only for the barcode scanner feature (Pro tier and up). Permission is requested lazily when the user taps the scanner icon, not on launch. Purpose string: `EatPal needs camera access to scan food barcodes.`

### "Why does the app request photo library access?"
Optional feature for attaching kid profile photos and meal photos. Requested lazily on tap. Never on launch.

### "Is data shared with third parties?"
Only:
- Supabase (our backend, user's own account)
- Open Food Facts (barcode lookup — no PII sent, just the EAN/UPC string)
- Instacart (only when user explicitly initiates an ingredient order, OAuth consent required)
- OpenAI via our edge function (no PII — names are tokenized before the prompt)

Full disclosure matches the App Privacy questionnaire and the privacy policy at tryeatpal.com/privacy.

### "What happens if a user doesn't subscribe?"
The app is fully functional for one kid profile with manual meal planning and a basic grocery list. No nag modals. Paywall only appears when the user taps a gated feature.

### "How are Instacart grocery orders handled?"
We deep-link into Instacart's Connect API with a prefilled shopping list. User authenticates on Instacart's domain. No payment ever flows through our app. No commission kickback that would require separate disclosure.

### "Is the app COPPA compliant?"
EatPal is used BY parents ABOUT their children. Children are not users of the app. No account is created for a child. Kid profiles are data owned by the parent's account. The app does not collect data directly from children. COPPA therefore does not apply in the data-collection sense, but we still apply strict data-minimization to kid profile fields.

### "Why isn't there an Apple Sign-In option?"
There is. In addition to email/password, the sign-in screen offers Sign in with Apple (per Apple's guideline that any app supporting third-party social sign-in must also offer Apple). For the demo account, use the provided email/password to skip the Apple ID prompt.

---

## 5. Before you hit Submit

Run through this list — each item below has been the cause of a real first-submission rejection for similar apps:

- [ ] Demo account exists, is signed in, and has seeded data (not a blank onboarding screen).
- [ ] Demo account email domain is real (`tryeatpal.com`), not `@example.com` — Apple sometimes rejects obviously fake domains.
- [ ] All six IAPs are in `Ready to Submit` state with display names, descriptions, and 1024×1024 review screenshots.
- [ ] Paywall screen shows price, renewal period, cancel instructions, and links to privacy policy + terms of service. (PaywallView.swift already does this — verify once live.)
- [ ] The medical disclaimer copy is visible inside the app (Settings screen and first-launch).
- [ ] Privacy policy URL loads and matches declared data collection.
- [ ] Support URL loads and has a working contact form or email link.
- [ ] Camera and photo library permission strings are specific (not the Xcode defaults).
- [ ] AI coach test conversations for: "what should my kid eat?" (ok), "my child has a fever, what should I do?" (refuses, redirects to pediatrician).
- [ ] TestFlight build tested end-to-end on a real device (not just simulator).

---

**Last updated**: 2026-04-15
