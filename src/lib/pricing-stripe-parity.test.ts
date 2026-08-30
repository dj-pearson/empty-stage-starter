import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PRICING_PLANS } from "./pricing-plans";

/**
 * The price a user is shown and the price Stripe charges them, pinned to each other.
 *
 * src/lib/pricing-plans.ts fixed the copy: eleven places stated a price, they disagreed,
 * and the marketing site advertised roughly a third under what checkout charges. Its
 * docblock then says the part that fix could not reach:
 *
 *   "The subscription_plans table in Supabase drives the interactive cards on /pricing
 *    and is NOT covered by any of this. It has to be checked separately, and it is the
 *    one place a wrong price becomes a wrong charge."
 *
 * This is that separate check, as far as the repo can take it. The hazard is specific.
 * Pricing.tsx renders `plan.price_monthly`, a decimal column. create-checkout ignores
 * that column entirely and charges whatever `stripe_price_id_monthly` resolves to in
 * Stripe (see supabase/functions/create-checkout/index.ts, "the price comes from this
 * row, never from the caller"). Those are two independent columns in one row, and
 * nothing made them agree. A row where the decimal says 14.99 and the price ID points at
 * the old 9.99 Stripe price shows one number and bills another, and both halves look
 * fine in isolation.
 *
 * Four statements of the same price exist in this repo. This ties all four together:
 *
 *   1. Stripe itself, via the live export in scripts/stripe-ids-*.json (Amount, cents)
 *   2. The price IDs written to the table by scripts/update-stripe-ids-*.sql
 *   3. The price_monthly / price_yearly seeded by the subscription_plans migration
 *   4. PRICING_PLANS, which every piece of marketing copy now reads from
 *
 * What this canNOT check, and what still needs a human with credentials:
 *
 *   - Whether the live subscription_plans table still matches its migrations. Someone
 *     may have edited a price through the admin UI, and the anon key available here
 *     gets a 401 from api.tryeatpal.com.
 *   - Whether the Stripe prices those IDs point at still cost what the export said in
 *     December. Stripe prices are immutable once created, so this is unlikely, but
 *     "unlikely" is not "checked".
 *
 * Run the SELECT at the bottom of scripts/update-stripe-ids-20251230-115613.sql against
 * production to close both.
 */

const REPO = path.resolve(__dirname, "..", "..");
const SCRIPTS = path.join(REPO, "scripts");

interface StripePrice {
  Amount: number;
  PlanName: string;
  Interval: "monthly" | "yearly";
  PriceId: string;
}

interface StripeExport {
  mode: string;
  prices: StripePrice[];
}

/**
 * The authoritative export, derived rather than asserted: the live-mode export that
 * actually carries prices. Seven of these files exist. Five are test mode and one live
 * one is a SELECT-only verification run, so picking by hand would be a guess that ages
 * badly.
 */
function liveExportWithPrices(): { file: string; data: StripeExport } {
  const candidates = readdirSync(SCRIPTS)
    .filter((f) => /^stripe-ids-.*\.json$/.test(f))
    .sort()
    .map((f) => ({
      file: f,
      data: JSON.parse(readFileSync(path.join(SCRIPTS, f), "utf8")) as StripeExport,
    }))
    .filter((e) => e.data.mode === "live" && e.data.prices.length > 0);

  expect(
    candidates,
    "expected exactly one live-mode Stripe export carrying prices under scripts/",
  ).toHaveLength(1);
  return candidates[0];
}

/** The paid plans, as {PRICING_PLANS key} -> {name used in Stripe, SQL and the table}. */
const PAID_PLANS = [
  ["pro", "Pro"],
  ["familyPlus", "Family Plus"],
  ["professional", "Professional"],
] as const;

describe("the displayed price and the charged price agree", () => {
  const { file, data } = liveExportWithPrices();
  const stripeSql = readFileSync(
    path.join(SCRIPTS, file.replace(/^stripe-ids-(.*)\.json$/, "update-stripe-ids-$1.sql")),
    "utf8",
  );

  describe.each(PAID_PLANS)("%s", (key, planName) => {
    const priceFor = (interval: "monthly" | "yearly") => {
      const match = data.prices.find(
        (p) => p.PlanName === planName && p.Interval === interval,
      );
      expect(match, `${file} has no ${interval} price for ${planName}`).toBeDefined();
      return match!;
    };

    it("charges in Stripe what PRICING_PLANS advertises, monthly", () => {
      // Stripe amounts are integer cents. Compare in cents so 14.99 does not turn into
      // 14.989999999999998 and pass or fail on floating point rather than on price.
      expect(priceFor("monthly").Amount).toBe(Math.round(PRICING_PLANS[key].monthly * 100));
    });

    it("charges in Stripe what PRICING_PLANS advertises, yearly", () => {
      const yearly = PRICING_PLANS[key].yearly;
      expect(yearly, `${key} has no yearly price in PRICING_PLANS`).not.toBeNull();
      expect(priceFor("yearly").Amount).toBe(Math.round(yearly! * 100));
    });

    it("points the table's price ID columns at those exact Stripe prices", () => {
      // The UPDATE that writes stripe_price_id_monthly/_yearly for this plan. If it ever
      // points at a price ID whose amount is not the advertised one, /pricing shows one
      // number and checkout bills another.
      const block = stripeSql.match(
        new RegExp(`UPDATE subscription_plans SET([\\s\\S]*?)WHERE name = '${planName}';`),
      );
      expect(block, `${file} has no UPDATE for ${planName}`).not.toBeNull();

      expect(block![1]).toContain(priceFor("monthly").PriceId);
      expect(block![1]).toContain(priceFor("yearly").PriceId);
    });

    it("never carries a test-mode price ID into the production script", () => {
      const testIds = readdirSync(SCRIPTS)
        .filter((f) => /^stripe-ids-.*\.json$/.test(f))
        .map((f) => JSON.parse(readFileSync(path.join(SCRIPTS, f), "utf8")) as StripeExport)
        .filter((e) => e.mode === "test")
        .flatMap((e) => e.prices.map((p) => p.PriceId));

      // Five test-mode scripts sit beside the production one with near-identical names.
      // create-checkout retrieves the price from Stripe before charging, so a test ID in
      // production breaks checkout rather than mischarging, but that is still an outage.
      for (const id of testIds) {
        expect(stripeSql, `production script contains test-mode price ${id}`).not.toContain(id);
      }
    });
  });
});

describe("the seeded table matches the advertised price", () => {
  /** The most recent migration that seeds subscription_plans rows. */
  function latestSeedingMigration(): { file: string; sql: string } {
    const dir = path.join(REPO, "supabase", "migrations");
    const seeders = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => ({ file: f, sql: readFileSync(path.join(dir, f), "utf8") }))
      .filter((m) => /INSERT INTO subscription_plans/.test(m.sql));

    expect(seeders.length, "no migration seeds subscription_plans").toBeGreaterThan(0);
    return seeders[seeders.length - 1];
  }

  const { file, sql } = latestSeedingMigration();
  const seeded = new Map(
    [...sql.matchAll(/\(\s*'(Free|Pro|Family Plus|Professional)',\s*([\d.]+),\s*([\d.]+),/g)].map(
      (m) => [m[1], { monthly: Number(m[2]), yearly: Number(m[3]) }],
    ),
  );

  it("parses a row for every plan", () => {
    expect([...seeded.keys()].sort()).toEqual(
      ["Family Plus", "Free", "Pro", "Professional"],
    );
  });

  it.each(PAID_PLANS)("%s is seeded at the advertised price", (key, planName) => {
    const row = seeded.get(planName)!;
    expect(
      Math.round(row.monthly * 100),
      `${file} seeds ${planName} at ${row.monthly}, PRICING_PLANS says ${PRICING_PLANS[key].monthly}`,
    ).toBe(Math.round(PRICING_PLANS[key].monthly * 100));
    expect(Math.round(row.yearly * 100)).toBe(Math.round(PRICING_PLANS[key].yearly! * 100));
  });

  it("seeds Free at zero", () => {
    expect(seeded.get("Free")).toEqual({ monthly: 0, yearly: 0 });
  });

  it("is not silently overridden by a later migration", () => {
    // The check above is only worth anything if this really is the last word on prices.
    // 20251008141000 seeded Pro at 9.99 and Family at 19.99, and 20251008202537 deleted
    // every row and reinserted at the Stripe prices the same day. A third one doing that
    // again would make this whole file describe history rather than production.
    const dir = path.join(REPO, "supabase", "migrations");
    const later = readdirSync(dir)
      .filter((f) => f.endsWith(".sql") && f > file)
      .filter((f) => {
        const sqlText = readFileSync(path.join(dir, f), "utf8");
        return (
          /INSERT INTO subscription_plans/i.test(sqlText) ||
          /UPDATE\s+subscription_plans[\s\S]{0,400}?price_(monthly|yearly)\s*=/i.test(sqlText)
        );
      });
    expect(
      later,
      "a migration after the seed writes plan prices; fold it into the check above",
    ).toEqual([]);
  });
});
