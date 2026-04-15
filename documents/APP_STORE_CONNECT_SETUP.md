# EatPal — App Store Connect Setup Guide

Single source of truth for everything you configure inside App Store Connect: ASO metadata, subscription products, review-time info, and follow-on code changes.

**Bundle ID**: `com.eatpal.app`
**Widget Bundle ID**: `com.eatpal.app.widget`
**Team**: Pearson Media LLC
**Category**: Health & Fitness (Primary) · Food & Drink (Secondary)

---

## 1. App Store Listing (ASO)

### 1.1 Core metadata (`App Store` tab → `iOS App` → language: English U.S.)

| Field | Limit | Value |
|---|---|---|
| **App Name** | 30 chars | `EatPal: Picky Eater Meal Plans` |
| **Subtitle** | 30 chars | `Kid nutrition & meal planner` |
| **Promotional Text** | 170 chars | `New: AI coach learns your kid's safe foods and suggests picky-eater-friendly meals. Generate grocery lists instantly. Try 7 days free.` |
| **Keywords** | 100 chars | `picky eater,meal planner,kids nutrition,toddler food,family meals,grocery list,feeding therapy,baby food` |

**Keyword notes:**
- No spaces after commas (wastes characters).
- No competitor/brand terms (Yummly, Mealime, etc.) — Apple rejects those.
- Don't repeat words already in `App Name` or `Subtitle` (they're indexed automatically).
- `100 / 100` chars used in the value above — tight by design.

**Promotional Text** can be edited without a new app review, so use it for time-sensitive messaging (launch offers, seasonal pushes).

### 1.2 Description (4000 char limit)

```
Meal planning built for the parent of a picky eater.

EatPal turns the daily "what will they actually eat?" question into a 5-minute routine. Track each kid's safe foods, plan the week, auto-generate the grocery list, and lean on an AI coach that knows which foods your child will actually touch.

— WHY PARENTS PICK EATPAL —
• Built around real picky-eating science — food chaining, safe-food libraries, tiny-bite progressions.
• Every kid has a separate profile. Track allergies, textures they tolerate, and foods they're warming up to.
• Meal plans that respect your kid's "yes list" instead of fighting it.
• Grocery lists generated from the week's plan, organized by aisle, with a one-tap share to your partner.

— CORE FEATURES —
• Weekly meal planner for breakfast, lunch, dinner, and snacks
• Per-kid profiles with safe foods, allergens, and preferences
• Barcode scanner to log packaged foods in seconds
• Smart grocery lists grouped by grocery-store aisle
• Nutrition summaries (calories, protein, iron, fiber, calcium) per kid per day
• Recipe library with kid-friendly tags and scaling
• Home-screen widget showing today's meals at a glance
• Offline-first — the plan survives a weak signal at the store

— FOR PICKY EATERS —
• Food chaining tools walk you from a food your kid likes to a new target food in small steps
• Try-bite tracker celebrates tiny wins (a lick, a sniff, a single bite)
• Sensory-friendly meal ideas filtered by texture and color
• Safe-food discovery — never get stuck at "what will they eat tonight?"

— AI MEAL COACH (Pro and up) —
• Suggests meals built from YOUR kid's actual safe-food list
• Answers nutrition questions in plain English
• Adapts as your kid's preferences grow

— FOR GROWING FAMILIES (Family Plus) —
• Unlimited kid profiles
• Shared household plan — two parents, one grocery list
• Grocery delivery integration (Instacart)
• Meal voting so kids get a say in dinner
• Weekly nutrition reports emailed every Sunday

— FOR FEEDING PROFESSIONALS (Professional) —
• Manage multiple client families from one dashboard
• Exportable nutrition reports for SLPs, OTs, and pediatric dietitians
• Food-chaining case templates
• Bulk client onboarding

— SUBSCRIPTIONS —
Free forever: 1 kid, manual meal planning, basic grocery list.
Pro ($14.99/mo or $143.90/yr): Up to 3 kids, AI coach, barcode scanner, smart grocery lists.
Family Plus ($24.99/mo or $239.90/yr): Unlimited kids, grocery delivery, meal voting, weekly reports.
Professional ($99/mo or $950/yr): Multi-family client management, exportable reports, case templates.

A 7-day free trial is available on all paid tiers. Subscriptions auto-renew; cancel anytime in App Store settings.

— PRIVACY FIRST —
Your meal plans, kids' names, and nutrition data stay in your account. We don't sell data. Read our policy at tryeatpal.com/privacy.

Questions or feedback? support@tryeatpal.com — we reply in under 24 hours.
```

### 1.3 What's New (per-version release notes)

Template for the first submission:

```
Welcome to EatPal 1.0!

This is our public launch. Core features:
• Per-kid meal planning with picky-eater tools
• AI meal coach that learns your family's safe foods
• Barcode scanner and smart grocery lists
• Home-screen widget showing today's meals

Questions? support@tryeatpal.com
```

### 1.4 URLs & contacts

| Field | Value |
|---|---|
| Support URL | `https://tryeatpal.com/support` |
| Marketing URL | `https://tryeatpal.com` |
| Privacy Policy URL | `https://tryeatpal.com/privacy` |

### 1.5 Assets

| Asset | Required size | Notes |
|---|---|---|
| App Icon | 1024×1024 PNG, no alpha | Lives at `ios/EatPal/EatPal/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png` |
| iPhone 6.9" screenshots | 1290×2796 | 3–10 screens |
| iPhone 6.5" screenshots | 1242×2688 or 1284×2778 | Reused by older devices |
| iPad 13" screenshots | 2064×2752 | Required if iPad is supported |
| App Preview video (optional) | 15–30s, 1080p | Increases conversion ~15–20% |

**Screenshot copywriting tip**: first screenshot is the one that sells. Lead with a benefit line overlayed on the UI, not a raw screen dump. Suggested order:

1. "Meal plans your picky eater will actually eat"
2. "AI coach learns what your kid will touch"
3. "Grocery list, auto-generated, grouped by aisle"
4. "Every kid. Their own plan."
5. "Track wins: every bite counts"

### 1.6 Age rating

Target **4+**. Answer "No" to all questionnaire items — no user-generated content shared publicly, no violence, no web browsing. The AI coach is prompt-constrained to nutrition topics.

### 1.7 App Privacy (data collection disclosures)

In App Store Connect → App Privacy, declare:

| Data Type | Linked to User | Tracking | Purpose |
|---|---|---|---|
| Email address | Yes | No | App Functionality, Account |
| Name (kid profile names) | Yes | No | App Functionality |
| Health & Fitness (allergens, dietary restrictions) | Yes | No | App Functionality |
| Purchases (subscription status) | Yes | No | App Functionality |
| Crash Data | No | No | Analytics (Sentry) |
| Performance Data | No | No | Analytics |

If you add analytics SDKs (Amplitude, Mixpanel, etc.) later, re-declare.

---

## 2. In-App Purchases (Auto-Renewable Subscriptions)

### 2.1 Subscription Group

Create **one** Subscription Group in App Store Connect so users can upgrade/downgrade between tiers without losing trial eligibility or proration.

| Field | Value |
|---|---|
| Reference Name | `EatPal Subscriptions` |
| Group Display Name (localized) | `EatPal Plans` |

All six subscription products below belong to this group.

### 2.2 Product IDs — canonical list

> **These are the correct Product IDs. Replace the old `com.eatpal.app.basic.*` / `com.eatpal.app.premium.*` IDs everywhere in code and in App Store Connect.**

| Product ID | Reference Name | Tier | Duration | Price (USD) |
|---|---|---|---|---|
| `com.eatpal.app.pro.monthly` | EatPal Pro Monthly | Pro | 1 month | **$14.99** |
| `com.eatpal.app.pro.yearly` | EatPal Pro Yearly | Pro | 1 year | **$143.90** |
| `com.eatpal.app.familyplus.monthly` | EatPal Family Plus Monthly | Family Plus | 1 month | **$24.99** |
| `com.eatpal.app.familyplus.yearly` | EatPal Family Plus Yearly | Family Plus | 1 year | **$239.90** |
| `com.eatpal.app.professional.monthly` | EatPal Professional Monthly | Professional | 1 month | **$99.00** |
| `com.eatpal.app.professional.yearly` | EatPal Professional Yearly | Professional | 1 year | **$950.00** |

**Yearly savings** (surfaced in the paywall UI):
- Pro: save $35.98 (~20%) vs 12× monthly
- Family Plus: save $59.98 (~20%) vs 12× monthly
- Professional: save $238 (~20%) vs 12× monthly

### 2.3 Free tier

The free tier is **not** an IAP — it's simply the default state when no `purchasedProductIDs` match. Don't create a Product ID for it. Gating happens in code (`StoreKitService.currentTier == .free`).

### 2.4 Per-product metadata (App Store Connect → IAP → each product)

For each of the six products above, fill in:

#### Pro — Monthly
- **Reference Name** (internal): `EatPal Pro Monthly`
- **Display Name** (shown on sheet): `Pro`
- **Description** (shown on sheet, 45 char recommended):
  `Up to 3 kids, AI coach, barcode scanner`
- **Price**: $14.99 USD — Apple auto-translates to other storefronts
- **Review Screenshot** (1024×1024 PNG): screenshot of the in-app paywall showing this plan highlighted

#### Pro — Yearly
- **Reference Name**: `EatPal Pro Yearly`
- **Display Name**: `Pro (Yearly)`
- **Description**: `Up to 3 kids, AI coach — save 20%`
- **Price**: $143.90 USD

#### Family Plus — Monthly
- **Reference Name**: `EatPal Family Plus Monthly`
- **Display Name**: `Family Plus`
- **Description**: `Unlimited kids, grocery delivery, voting`
- **Price**: $24.99 USD

#### Family Plus — Yearly
- **Reference Name**: `EatPal Family Plus Yearly`
- **Display Name**: `Family Plus (Yearly)`
- **Description**: `Unlimited kids + delivery — save 20%`
- **Price**: $239.90 USD

#### Professional — Monthly
- **Reference Name**: `EatPal Professional Monthly`
- **Display Name**: `Professional`
- **Description**: `Client management for feeding pros`
- **Price**: $99.00 USD

#### Professional — Yearly
- **Reference Name**: `EatPal Professional Yearly`
- **Display Name**: `Professional (Yearly)`
- **Description**: `Feeding-pro tools — save 20%`
- **Price**: $950.00 USD

### 2.5 Introductory offer (free trial)

Recommended: **7-day free trial on all six products** (no proration complexity since they're all in one group).

Configure per product:
- Type: `Free Trial`
- Duration: `1 week`
- Eligibility: `New Subscribers`

You only get one intro-offer-eligibility-use per Apple ID per subscription group, so a user who trials Pro can't re-trial Family Plus. That's fine — the upgrade path is direct anyway.

### 2.6 Subscription Group ordering (determines upgrade/downgrade mechanics)

Inside the group, rank products by tier value. App Store Connect uses this ranking to decide what's an "upgrade" (immediate, prorated) vs. "downgrade" (at next renewal) vs. "crossgrade" (same level).

Recommended order (highest value first):
1. `com.eatpal.app.professional.yearly` — Level 1
2. `com.eatpal.app.professional.monthly` — Level 1
3. `com.eatpal.app.familyplus.yearly` — Level 2
4. `com.eatpal.app.familyplus.monthly` — Level 2
5. `com.eatpal.app.pro.yearly` — Level 3
6. `com.eatpal.app.pro.monthly` — Level 3

(Same-tier monthly/yearly should share a level so switching between them is a crossgrade.)

### 2.7 Review info for IAPs

Apple reviews each IAP alongside the first app submission. For each product:

- **Review Notes**: `Subscription grants access to gated features. Test account credentials provided in app review notes. Sandbox purchase can be validated by tapping any "Pro required" feature in the app — the paywall appears and offers this product.`
- **Review Screenshot**: 1024×1024 PNG of the paywall with the product visible.

---

## 3. Tier Feature Matrix

What's gated where. This is the source of truth — code, paywall, and marketing must reflect this.

| Feature | Free | Pro | Family Plus | Professional |
|---|---|---|---|---|
| Kid profiles | 1 | 3 | Unlimited | Unlimited |
| Household members | 1 | 1 | 2 | Unlimited |
| Weekly meal plan | ✓ | ✓ | ✓ | ✓ |
| Manual food entry | ✓ | ✓ | ✓ | ✓ |
| Basic grocery list | ✓ | ✓ | ✓ | ✓ |
| Barcode scanner | — | ✓ | ✓ | ✓ |
| Smart grocery lists (aisle-grouped) | — | ✓ | ✓ | ✓ |
| AI meal coach | — | ✓ | ✓ | ✓ |
| AI meal suggestions | — | ✓ | ✓ | ✓ |
| Food-chaining tools | — | Basic | Full | Full |
| Meal voting (kids pick) | — | — | ✓ | ✓ |
| Grocery delivery (Instacart) | — | — | ✓ | ✓ |
| Weekly nutrition email reports | — | — | ✓ | ✓ |
| Home-screen widget | ✓ | ✓ | ✓ | ✓ |
| Multi-client management | — | — | — | ✓ |
| Exportable nutrition reports (PDF) | — | — | — | ✓ |
| Case-template library | — | — | — | ✓ |
| Bulk client onboarding | — | — | — | ✓ |
| Priority support (<4hr reply) | — | — | — | ✓ |
| Standard support (<24hr reply) | — | ✓ | ✓ | ✓ |

---

## 4. Code changes required

The current `ios/EatPal/EatPal/Services/StoreKitService.swift` has outdated IDs:
```swift
enum SubscriptionProduct: String, CaseIterable {
    case monthlyBasic = "com.eatpal.app.basic.monthly"    // REMOVE
    case yearlyBasic = "com.eatpal.app.basic.yearly"      // REMOVE
    case monthlyPremium = "com.eatpal.app.premium.monthly" // REMOVE
    case yearlyPremium = "com.eatpal.app.premium.yearly"  // REMOVE
}
```

Replace with:
```swift
enum SubscriptionProduct: String, CaseIterable {
    case monthlyPro           = "com.eatpal.app.pro.monthly"
    case yearlyPro            = "com.eatpal.app.pro.yearly"
    case monthlyFamilyPlus    = "com.eatpal.app.familyplus.monthly"
    case yearlyFamilyPlus     = "com.eatpal.app.familyplus.yearly"
    case monthlyProfessional  = "com.eatpal.app.professional.monthly"
    case yearlyProfessional   = "com.eatpal.app.professional.yearly"

    var tier: SubscriptionTier {
        switch self {
        case .monthlyPro, .yearlyPro: return .pro
        case .monthlyFamilyPlus, .yearlyFamilyPlus: return .familyPlus
        case .monthlyProfessional, .yearlyProfessional: return .professional
        }
    }
}

enum SubscriptionTier: String, Comparable {
    case free
    case pro
    case familyPlus
    case professional

    static func < (lhs: SubscriptionTier, rhs: SubscriptionTier) -> Bool {
        let order: [SubscriptionTier] = [.free, .pro, .familyPlus, .professional]
        return order.firstIndex(of: lhs)! < order.firstIndex(of: rhs)!
    }
}
```

**Also update:**
- `PaywallView.swift` — UI copy, pricing display, and the three tier cards (currently only shows two).
- Supabase `user_subscriptions` table — the `store_product_id` column will start seeing new IDs. Existing rows with old IDs should be migrated (or wiped, if no production users yet).
- `.github/IOS_DEPLOY_SETUP.md` — update the IAP table (currently lists the old four products).
- Any feature-gate checks that reference `.basic` or `.premium` — remap to `.pro` / `.familyPlus` / `.professional`.

---

## 5. Submission checklist

### Before hitting "Submit for Review"
- [ ] App icon present at `Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png` (1024×1024, no alpha)
- [ ] `CFBundleIconName = AppIcon` in `Info.plist`
- [ ] At least 3 screenshots per required device class uploaded
- [ ] All six IAP products created in App Store Connect with correct IDs, prices, display names, descriptions, and review screenshots
- [ ] Subscription Group `EatPal Subscriptions` created and all six products assigned to it
- [ ] Subscription ranking configured (upgrade/downgrade order)
- [ ] 7-day free trial intro offer enabled on all six products
- [ ] App Privacy questionnaire answered accurately
- [ ] Support URL, marketing URL, privacy policy URL live and reachable
- [ ] TestFlight build uploaded and internally tested (at minimum: sign up, subscribe to each tier in sandbox, restore purchases, cancel)
- [ ] Demo account credentials in "App Review Information" (email + password that bypasses onboarding)
- [ ] IAP review screenshots attached to each product
- [ ] Contact info (review team email + phone) filled in
- [ ] Export compliance: answer "No" to encryption question if you only use HTTPS (your `ITSAppUsesNonExemptEncryption = false` in `Info.plist` already handles this)

### Common first-submission rejections to avoid
- **Placeholder content**: Strip any `TODO` or `Lorem ipsum`.
- **Broken auth loop**: Review team must be able to get past login without an invite code.
- **Subscription terms missing from paywall**: The paywall screen must show price, renewal period, and link to terms/privacy policy. Apple rejects paywalls that bury this.
- **Demo account that needs a real credit card**: Seed test data under a demo account so reviewers see a populated app.
- **AI features generating harmful content**: Prompt-constrain the AI coach to nutrition topics only and test edge cases ("what if my kid eats only cookies?").

---

## 6. Post-launch ASO experiments (first 90 days)

Things to test once you have install baseline data:

1. **A/B test app icon** (ASC → App Store → Product Page Optimization). Common winners: illustrated kid/parent faces beat abstract marks by 15–30%.
2. **Alternate subtitles**: `Kid nutrition & meal planner` vs `Picky eater meal planning` vs `Family meal plans, done`.
3. **Keyword rotation** every 2 weeks for the first 3 months; track ranking shifts in ASA reports.
4. **In-App Events** (launch offer, seasonal meal content) — appear in search results and on your product page.
5. **Promotional Text** refresh every 30 days (no review needed).

---

## 7. Revenue quick-reference

Assuming Apple's standard 70/30 split (85/15 after year 1 for retained subscribers):

| Tier | Monthly net (yr 1) | Yearly net (yr 1) | Monthly net (yr 2+) | Yearly net (yr 2+) |
|---|---|---|---|---|
| Pro | $10.49 | $100.73 | $12.74 | $122.32 |
| Family Plus | $17.49 | $167.93 | $21.24 | $203.92 |
| Professional | $69.30 | $665.00 | $84.15 | $807.50 |

If you hit **$5,000 MRR** before 30% of revenue, you qualify for the Apple Small Business Program's flat 15% rate — apply at developer.apple.com/app-store/small-business-program. Apply early; it's first-run-of-calendar-year eligibility.

---

**Last updated**: 2026-04-15
**Owner**: dj-pearson / Pearson Media LLC
