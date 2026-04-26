# EatPal iOS — Accessibility Baseline

> Last audit pass: 2026-04-25 (US-246).

This file is the known-good baseline for VoiceOver, Dynamic Type, Reduce
Motion, and contrast on the iOS app. Anyone touching the views below should
re-verify the relevant section before merging.

---

## Audit checklist

| Concern | Convention |
|---|---|
| Icon-only `Button` | Must have `.accessibilityLabel(...)`. Toolbar `+`, chevron navigation, ellipsis menus, etc. |
| Composite cards (avatar + name + badge) | Wrap in `.accessibilityElement(children: .combine)` with a single label + value (e.g. selection state). |
| Decorative graphics | `.accessibilityHidden(true)` so VoiceOver skips them — scan-line, confetti, dividers. |
| `withAnimation` / `.animation(...)` | Gate behind `UIAccessibility.isReduceMotionEnabled` or use the `accessibleWithAnimation` / `accessibleAnimation` helpers in `Utilities/Accessibility.swift`. |
| `repeatForever` animations | **Hard rule:** must be skipped under Reduce Motion. They are the worst offender for vestibular sensitivity. |
| Toasts / banners | Use `ToastManager` (already wires `.accessibilityElement(children: .combine)` + role-aware label). |

---

## Reduce Motion respected

| View | Animation | How it's gated |
|---|---|---|
| `BarcodeScannerView.ScanLineView` | `repeatForever` sweep | Skipped entirely; static centered line shown. Decorative — also `.accessibilityHidden(true)`. |
| `AICoachView.TypingIndicator` | Bouncing dots timer | Timer not started under Reduce Motion. `.accessibilityLabel("EatPal is thinking")` carries the meaning. Timer also invalidated `onDisappear` so it doesn't leak. |
| `BadgeCelebrationSheet` | Spring-scale icon + 30-particle confetti | `if !reduceMotion` gate + still icon fallback. Confetti layer omitted entirely under Reduce Motion. |
| `MealPlanView.WeekNavigationView` | Day-chip switch | `accessibleWithAnimation` helper. |
| `DashboardHomeView.KidSelectorView` | Active-kid switch | `accessibleWithAnimation` helper. |
| `ToastManager` | Toast slide-in | Already gated on `UIAccessibility.isReduceMotionEnabled`. |

Anything else in `Views/` using bare `withAnimation(...)` should be migrated
to `accessibleWithAnimation` (helper in `Utilities/Accessibility.swift`).

---

## Icon-only buttons audited

The following critical-flow toolbars now have explicit `.accessibilityLabel`:

| File | Button | Label |
|---|---|---|
| `Pantry/PantryView.swift` | Toolbar `+` | "Add food" |
| `Grocery/GroceryView.swift` | Toolbar `+` | "Add grocery item" |
| `Grocery/GroceryView.swift` | Toolbar wand-and-stars Menu | "Quick add options" |
| `Grocery/GroceryView.swift` | Shopping mode launcher | "Start shopping mode" + hint |
| `Recipes/RecipesView.swift` | Toolbar `+` | "Add recipe" |
| `Kids/KidsView.swift` | Toolbar `+` | "Add child" |
| `MealPlan/MealPlanView.swift` | Week chevrons | "Previous week" / "Next week" |
| `MealPlan/MealPlanView.swift` | Generate / More menus | Already labeled |
| `Dashboard/DashboardHomeView.swift` | Kid selector tile | Combined label + selection value + hint |

---

## Composite cards normalized

These compound rows are now spoken as a single, descriptive token:

| View | Combined label |
|---|---|
| `DashboardHomeView.KidSelectorView` | `<kidName>` + value `Selected/Not selected` + hint `Switch active kid to <name>` |
| `Progress.StreakCard` | `<streak headline>. <best-ever subtitle>` |
| `Progress.BadgeTile` | `Earned/Locked: <title>` + hint `<description>` |
| `Components.ToastView` | `Error/Success/Notification: <title>` |

---

## Critical flows tested with VoiceOver

The five flows from US-246 each completable end-to-end without sight:

1. **Add food** — Pantry → "Add food" → labelled name field + category picker → Save
2. **Add grocery** — Grocery → "Add grocery item" → labelled name + suggestions chip strip
3. **Plan a meal** — Planner → day chip → meal-slot → food picker (drag avoided; tap-to-select wired)
4. **Log a meal result** — PlanEntryRow result buttons emit confirmation toasts; result is announced
5. **Scan a barcode** — Scanner → camera permission prompt; scan-line decorative; recognised code routed to product sheet

---

## Dynamic Type

App-wide text uses semantic `Font.body` / `.headline` / `.caption` so it
scales automatically under user settings. Two known places force a size:

- **`ShoppingModeView`** — intentionally pinned to `.dynamicTypeSize(.accessibility1)` so the in-store mode is always large, regardless of the user's everyday setting.
- **`BadgeTile`** — `.minimumScaleFactor(0.85)` on the title so 3-column grid stays intact under AX5.

No clipping or overlapping content was observed at AX5 in the audited
flows. If you add a new fixed-width container, run a quick AX5 sweep
before merging — `Form` rows with side-by-side `Label` + custom controls
are the most common regression class.

---

## Color contrast (WCAG AA)

`AppTheme.Colors` mostly delegates to system semantic colors
(`.label`, `.secondaryLabel`, `.systemBackground`, etc.) which Apple
guarantees AA contrast for in both Light and Dark mode. The few
brand-mixed values that warrant a manual check:

| Token | Light | Dark | Notes |
|---|---|---|---|
| `Colors.primary` (.green) on `Colors.background` | ~3.0:1 | ~3.4:1 | OK for large text only — never use for `<body` text. |
| `Colors.primaryDark` on `Colors.background` | ~5.4:1 | ~5.0:1 | AA ✅ — preferred for any small green text. |
| `Colors.warning` (.orange) on `Colors.warningLight` | ~2.6:1 | ~2.7:1 | Warning chips meant as supporting accents — text is also weighted/heavier; pair with an icon for redundancy. |

Replace any `Colors.primary` → `.body` text combos with
`Colors.primaryDark` when you encounter them; this is a known
follow-up.

---

## Known follow-ups

- A couple of older `withAnimation` call sites in `ShoppingModeView`
  (`spring(response: 0.3)` for the undo banner) and the row tap-confirm
  spring don't yet read the Reduce Motion env. Both are short
  (≤ 0.4s) so the impact is minimal — sweep next pass.
- `RecipeDetailView` photo carousel, `OnboardingView` page transitions,
  and `PaywallView` hero animation all use `withAnimation` without
  gating — review with a designer before changing since they're brand
  moments.
- CI snapshot suite for VoiceOver smoke tests is **not yet wired**;
  baseline screenshots were captured manually for this audit pass.

---

## How to extend

When you add a new view:

1. Every `Image(systemName:)` that's the entire label of a `Button` needs
   `.accessibilityLabel(...)` (and ideally `.accessibilityHint`).
2. Use `accessibleAnimation(_:value:)` (View modifier) or
   `accessibleWithAnimation(_:reduceMotion:_:)` (function) instead of
   raw `.animation(...)` / `withAnimation { … }`.
3. If a card has multiple text fragments and one tap target, combine
   them with `.accessibilityElement(children: .combine)` and write a
   single short, descriptive label.
4. If you introduce a `repeatForever` animation, gate it behind
   `@Environment(\.accessibilityReduceMotion)` and provide a still
   fallback. Add a row to the table above.
