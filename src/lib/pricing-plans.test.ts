import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { PRICING_PLANS, PRICE_RANGE, priceLabel, priceString } from "./pricing-plans";

/**
 * The prices in this repo disagreed with Stripe and with each other, in eleven places.
 *
 * Stripe charges $14.99 for Pro and $24.99 for Family Plus. The homepage pricing cards,
 * their trial-renewal disclosure, the pricing page copy, the FAQ, seo-config, the
 * SoftwareApplication offer, llms.txt and llms-full.txt all said $9.99 and $19.99. The
 * marketing site advertised roughly a third under what checkout charges, the structured
 * data handed Google the wrong number, and the file written specifically for AI crawlers
 * told them the wrong number too.
 *
 * Nothing caught it because nothing was looking. This test looks.
 */

const REPO = join(__dirname, "..", "..");
const SRC = join(REPO, "src");

/** Prices that were wrong, and must not reappear as literals in shipped copy. */
const STALE = ["9.99", "19.99"];

/**
 * Files allowed to contain a stale-looking number.
 *
 * pricing-plans.ts and this test both quote the old values while explaining them.
 * SubscriptionManagement.tsx uses "9.99" as an input placeholder in the admin UI, which
 * is a hint about the format rather than a price claim, and admin screens are noindex
 * and behind auth.
 */
const ALLOWED = new Set([
  join("lib", "pricing-plans.ts"),
  join("lib", "pricing-plans.test.ts"),
  join("components", "admin", "SubscriptionManagement.tsx"),
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "ui") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.(tsx?|json)$/.test(entry)) continue;
    // Test fixtures may use any number: trialDisclosure.test.ts passes 9.99 to check
    // formatting, which is not a price claim.
    if (/\.test\.tsx?$/.test(entry)) continue;
    if (entry === "types.ts" && full.includes("integrations")) continue;
    out.push(full);
  }
  return out;
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

describe("pricing", () => {
  it("matches what Stripe charges", () => {
    // Every scripts/stripe-ids-*.json export agrees on these.
    expect(PRICING_PLANS.pro.monthly).toBe(14.99);
    expect(PRICING_PLANS.pro.yearly).toBe(143.9);
    expect(PRICING_PLANS.familyPlus.monthly).toBe(24.99);
    expect(PRICING_PLANS.familyPlus.yearly).toBe(239.9);
    expect(PRICING_PLANS.professional.monthly).toBe(99);
    expect(PRICING_PLANS.free.monthly).toBe(0);
  });

  it("formats prices the way schema.org and the UI expect", () => {
    expect(priceString("pro")).toBe("14.99");
    expect(priceLabel("pro")).toBe("$14.99");
    expect(priceLabel("free")).toBe("Free");
    expect(PRICE_RANGE).toBe("Free - $99.00/month");
  });

  it.each(STALE)("no shipped source file states the stale price %s", (stale) => {
    const hits: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file);
      if (ALLOWED.has(rel)) continue;
      const body = withoutComments(readFileSync(file, "utf8"));
      // Not a substring match: "T23:59:59.999Z" contains "9.99" and is a timestamp,
      // not a price. The number has to stand on its own.
      const price = new RegExp(String.raw`(?<![\d.])` + stale.replace(".", String.raw`\.`) + String.raw`(?![\d])`);
      for (const [index, line] of body.split("\n").entries()) {
        if (price.test(line)) hits.push(`${rel}:${index + 1}  ${line.trim().slice(0, 110)}`);
      }
    }
    expect(
      hits,
      `$${stale} is not what Stripe charges. Import from src/lib/pricing-plans.ts ` +
        `instead of writing a price literal.\n\n${hits.join("\n")}`,
    ).toEqual([]);
  });

  it.each(["llms.txt", "llms-full.txt"])(
    "public/%s quotes the price Stripe actually charges",
    (name) => {
      // These files exist to be read by AI crawlers, so a wrong price here is repeated
      // by an assistant as fact. No test covered them before.
      const text = readFileSync(join(REPO, "public", name), "utf8");
      for (const stale of STALE) {
        expect(text, `public/${name} still says $${stale}`).not.toContain(`$${stale}`);
      }
      expect(text).toContain(`$${PRICING_PLANS.pro.monthly}`);
      expect(text).toContain(`$${PRICING_PLANS.familyPlus.monthly}`);
    },
  );
});
