# What's New in EatPal — v1.1 (Spring 2026)

> Six big upgrades to the Pantry → Recipes → Plan → Grocery loop, focused on
> reducing friction in the parts of weekly meal planning that take the most
> tapping. Drop the relevant section into App Store / TestFlight / blog as
> needed.

---

## App Store-style summary (≤500 chars)

EatPal 1.1 makes weekly meal planning feel half as long.

• **What can I cook?** — match recipes against your pantry instantly
• **Grocery, by recipe** — flip between aisle order and per-meal grouping
• **Real store aisles** — 32 sections that match the way you actually shop
• **One-tap "I made this"** — auto-debits pantry + checks off ingredients
• **Bulk edit** in Pantry, Grocery, and Recipes — one tap to handle 30 items
• **Structured recipes** with proper quantities and units

---

## Headline features

### "What can I cook with what I have?" ✨

Open the **Recipes** tab → tap the menu → **What can I make?** EatPal scans
your recipe collection, scores each one against your pantry and grocery list,
and shows you what you can cook **right now** vs what you're "almost there"
on. Every recipe shows the missing items as chips you can add to the grocery
list with one tap.

You'll also see this surfaced in the **Grocery** tab when your list is empty —
no need to start a list from scratch when dinner might already be in the
pantry.

### Grocery list, by recipe 📖

The Grocery tab has a new view-mode toggle in the header. Switch between:

- **By Aisle** (the default) — items grouped by where you'll find them in
  the store, sorted in walk order
- **By Recipe** — items grouped under the meal that needs them, with a
  "Mon dinner · Wed lunch" subtitle so you know what's covering what

Tap any recipe section header to jump straight into the recipe details
without leaving the Grocery tab. Items shared across multiple recipes get
their own "Shared" group at the top; manual additions stay visible at the
bottom.

### Real grocery-store aisles 🛒

We expanded the 6-bucket food category list into a 32-aisle taxonomy that
mirrors how a US grocery store actually lays out: produce, bakery, bread,
meat & deli, seafood, dairy, eggs, refrigerated, frozen meals/veg/treats,
canned, dry soups, pasta, rice & grains, condiments, baking, breakfast,
snacks, crackers, candy, beverages, beer & wine, Mexican, Asian, European,
household, paper goods, cleaning, personal care, baby, pet, and other.

Existing items are auto-mapped to the closest match; you can refine per item
or in bulk. Shopping Mode now sorts your list by store walk order so you
move front-to-back through the aisles instead of doubling back.

### One-tap "I made this" 🍴

Long-press any planned meal that's linked to a recipe and tap **Made it**.
EatPal will, in one move:

- **Debit your pantry** — every linked ingredient drops by one serving
- **Check off matching grocery items** — anything that recipe sourced from
  your list gets marked bought
- **Log the event** — re-tapping within an hour shows "already logged"
  instead of double-debiting your pantry

The whole loop happens in one server-side transaction, so it's atomic and
the UI updates instantly.

### Bulk edit, everywhere 📋

Tap **Select multiple** in the Pantry, Grocery, or Recipes menu (or use the
existing Pantry select toggle) and a bottom action bar appears. Each list
gets the actions that make sense for it:

- **Pantry** — Mark Safe, Mark Try-Bite, Move to Grocery, Set Category, Delete
- **Grocery** — Mark Bought, Set Aisle, Select All, Delete
- **Recipes** — Add Ingredients to Grocery, Select All, Delete

Every bulk action is a **single network request** — bulk-deleting 30 items
no longer makes 30 round-trips. Bulk-add-recipe-to-grocery dedupes against
your existing list and uses each recipe's structured ingredients (with
quantities + units) when available.

### Structured recipes 🥕

Recipe ingredients are no longer a comma-separated string. Each ingredient
has its own row with a **name**, **quantity**, **unit**, and an optional
link back to a pantry food. Existing recipes auto-migrate the next time you
tap edit — your data stays in place.

The benefits ripple out: serving-scaling shows real measurements, the meal
plan → grocery generator carries quantities through, the "Made it" debit
knows what to subtract, and the cookable-recipes matcher can fuzzy-match
ingredients across recipe + pantry naming variations.

---

## Under the hood

- **Faster**: every bulk operation now batches into one Supabase request via
  `.in('id', ids)` instead of N×1 round-trips. A 30-item bulk delete is now
  a single HTTP call.
- **Recipe origin preserved**: when you generate a grocery list from your
  meal plan, EatPal now keeps a many-to-many link from each grocery item
  back to the recipes + plan entries that contributed to it. That's what
  powers the new "By Recipe" view and the auto-check on "Made it".
- **New telemetry**: `meal_made_logged`, `cookable_match_opened`,
  `cookable_recipe_added_to_plan`, `cookable_missing_added_to_grocery`,
  `grocery_aisle_set` — surfaces where users actually adopt the new flows.
- **Idempotency**: "Made it" stores a reversible payload so a future undo
  feature can roll back debits cleanly. Re-tapping within an hour is a
  no-op instead of a double-charge.

---

## Known limitations & follow-ups

- **"Add to plan"** from the cookable-recipes sheet currently nudges you to
  open Meal Plan and tap a slot. Full deep-link routing arrives with the
  upcoming Universal Inspector update.
- **Smart aisle classifier** — manual aisle assignment for now. The
  upcoming auto-classifier will recognize ~500 common items locally and
  fall back to a server lookup for unknowns. Your manual overrides will
  always win.
- **Apple Watch** integration with the new "By Recipe" view is read-only;
  log-result / start-trip from the wrist is on the roadmap.
- **Multi-kid serving math** — pantry debit currently drops one portion per
  ingredient. A future update will scale by recipe servings × portions
  served when more than one kid eats the same meal.

---

## Migration notes (for anyone reading the changelog from a TestFlight build)

If you upgraded mid-shopping-trip, you may notice your list re-grouped under
new aisle headers. We backfilled every existing item to the closest match,
but feel free to refine in bulk via **Select multiple → Aisle**. Nothing is
deleted; only the grouping changes.

Recipes with the old comma-separated "Additional Ingredients" field stay
as-is until you tap edit. On first save, EatPal converts the legacy line
into structured rows you can adjust.

---

**Last updated**: 2026-05-01
