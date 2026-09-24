/**
 * Item 22: what the household threw out this month, and roughly what it cost.
 *
 * Built from the ledger: `waste` and `expire` movements are the thrown-out
 * facts, recorded by the pantry's "Threw it out" path (US-672). Nothing here
 * guesses a quantity or a price. A line with no known price says so and adds
 * nothing to the total, so "about $12" is the sum of lines whose price is
 * actually known, and the sheet shows how many lines it could not cost.
 *
 * WHERE A PRICE COMES FROM, in order:
 *
 *   1. The latest priced purchase movement for the same item. Its price is per
 *      DISPLAY unit, and the movement records both the display quantity and
 *      the canonical delta, so price per canonical unit is
 *      unit_price * display_quantity / delta. A waste movement's delta is in
 *      the same canonical unit, so the cost needs no unit conversion at all.
 *   2. The food's last known price (foods.price_per_unit), per the food's own
 *      unit, used only when the waste was recorded in that unit.
 *
 * Totals are kept per currency. Adding euros to dollars would be a number,
 * not a fact.
 *
 * Pure: no React, no Supabase, no clock (the caller passes `now`).
 */
import type { ItemFit } from "@/lib/kidFit";
import { fitGroup } from "@/lib/kidFit";

export const WASTE_REASONS = ["waste", "expire"] as const;

/** The movement fields the report reads. A subset of an inventory_movements row. */
export interface ReportMovement {
  id: string;
  item_id: string;
  delta: number;
  canonical_unit: string;
  display_quantity: number | null;
  display_unit: string | null;
  reason: string;
  occurred_at: string;
  reversed_by_id?: string | null;
  unit_price?: number | null;
  currency?: string | null;
}

/** The food fields the report reads. */
export interface ReportFood {
  id: string;
  name: string;
  unit?: string | null;
  is_safe?: boolean;
  is_try_bite?: boolean;
  price_per_unit?: number | null;
  currency?: string | null;
}

/** How a thrown-out food relates to the kids: try-bite waste is its own group. */
export type WasteGroup = "trying" | "safe" | "other";

export interface Money {
  amount: number;
  currency: string;
}

export interface WasteLine {
  itemId: string;
  name: string;
  group: WasteGroup;
  /** Thrown-out amounts, one per display unit used ("2 bags", "300 g"). */
  quantities: { amount: number; unit: string }[];
  /** How many times it was thrown out this month. */
  events: number;
  /** Estimated cost per currency; empty when no price is known for any of it. */
  cost: Money[];
  /** True when at least one event could not be costed. */
  partlyUnpriced: boolean;
}

export interface WasteGroupSummary {
  group: WasteGroup;
  lines: WasteLine[];
  totals: Money[];
}

export interface WasteReport {
  lines: WasteLine[];
  groups: WasteGroupSummary[];
  totals: Money[];
  /** Lines with no price at all. */
  unpricedLines: number;
  events: number;
  /** Start of the month the report covers, as an ISO string. */
  since: string;
}

/** Midnight on the first of `now`'s month, in local time. */
export function startOfMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const unitKey = (unit: string | null | undefined) => (unit ?? "").trim().toLowerCase();

function isThrownOut(m: ReportMovement): boolean {
  return (WASTE_REASONS as readonly string[]).includes(m.reason) && !m.reversed_by_id;
}

/** Price per canonical unit, from a priced purchase movement, or null. */
export function pricePerCanonical(m: ReportMovement): Money | null {
  if (m.reason !== "purchase" || m.reversed_by_id) return null;
  const price = m.unit_price;
  const dq = m.display_quantity;
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) return null;
  if (typeof m.currency !== "string" || m.currency === "") return null;
  if (typeof dq !== "number" || !(dq > 0) || !(m.delta > 0)) return null;
  return { amount: (price * dq) / m.delta, currency: m.currency };
}

function addMoney(into: Money[], money: Money): void {
  const hit = into.find((m) => m.currency === money.currency);
  if (hit) hit.amount = round2(hit.amount + money.amount);
  else into.push({ amount: round2(money.amount), currency: money.currency });
}

function groupOf(food: ReportFood | undefined, fit: ItemFit | undefined): WasteGroup {
  if (fit && fit.perKid.length > 0) return fitGroup(fit);
  if (food?.is_try_bite) return "trying";
  if (food?.is_safe) return "safe";
  return "other";
}

const GROUP_ORDER: WasteGroup[] = ["trying", "safe", "other"];

export function buildWasteReport(input: {
  movements: readonly ReportMovement[];
  foods: readonly ReportFood[];
  fitByFoodId?: ReadonlyMap<string, ItemFit>;
  now: Date;
}): WasteReport {
  const since = startOfMonth(input.now);
  const until = new Date(since.getFullYear(), since.getMonth() + 1, 1);
  const foodById = new Map(input.foods.map((f) => [f.id, f]));

  // Latest priced purchase per item, by occurred_at.
  const latestPrice = new Map<string, { at: number; canonicalUnit: string; price: Money }>();
  for (const m of input.movements) {
    const price = pricePerCanonical(m);
    if (!price) continue;
    const at = Date.parse(m.occurred_at);
    const held = latestPrice.get(m.item_id);
    if (!held || at > held.at) latestPrice.set(m.item_id, { at, canonicalUnit: m.canonical_unit, price });
  }

  const seen = new Set<string>();
  const byItem = new Map<string, WasteLine>();
  for (const m of input.movements) {
    if (!isThrownOut(m) || seen.has(m.id)) continue;
    const at = Date.parse(m.occurred_at);
    if (!Number.isFinite(at) || at < since.getTime() || at >= until.getTime()) continue;
    seen.add(m.id);

    const food = foodById.get(m.item_id);
    let line = byItem.get(m.item_id);
    if (!line) {
      line = {
        itemId: m.item_id,
        name: food?.name ?? "",
        group: groupOf(food, input.fitByFoodId?.get(m.item_id)),
        quantities: [],
        events: 0,
        cost: [],
        partlyUnpriced: false,
      };
      byItem.set(m.item_id, line);
    }
    line.events += 1;

    const amount = Math.abs(m.display_quantity ?? 0);
    const unit = m.display_unit ?? food?.unit ?? "";
    if (amount > 0) {
      const q = line.quantities.find((x) => unitKey(x.unit) === unitKey(unit));
      if (q) q.amount = round2(q.amount + amount);
      else line.quantities.push({ amount: round2(amount), unit });
    }

    // 1. A priced purchase in the same canonical unit.
    const purchase = latestPrice.get(m.item_id);
    let cost: Money | null = null;
    if (purchase && purchase.canonicalUnit === m.canonical_unit) {
      cost = { amount: Math.abs(m.delta) * purchase.price.amount, currency: purchase.price.currency };
    } else if (
      // 2. The food's last known price, when the waste is in the food's unit.
      food &&
      typeof food.price_per_unit === "number" &&
      Number.isFinite(food.price_per_unit) &&
      food.price_per_unit >= 0 &&
      typeof food.currency === "string" &&
      food.currency !== "" &&
      amount > 0 &&
      unitKey(unit) === unitKey(food.unit)
    ) {
      cost = { amount: amount * food.price_per_unit, currency: food.currency };
    }
    if (cost) addMoney(line.cost, cost);
    else line.partlyUnpriced = true;
  }

  const lines = [...byItem.values()].sort((a, b) => {
    const ca = a.cost.reduce((s, m) => s + m.amount, 0);
    const cb = b.cost.reduce((s, m) => s + m.amount, 0);
    return cb - ca || b.events - a.events || a.name.localeCompare(b.name);
  });

  const totals: Money[] = [];
  for (const line of lines) for (const c of line.cost) addMoney(totals, c);

  const groups: WasteGroupSummary[] = GROUP_ORDER.map((group) => {
    const groupLines = lines.filter((l) => l.group === group);
    const groupTotals: Money[] = [];
    for (const line of groupLines) for (const c of line.cost) addMoney(groupTotals, c);
    return { group, lines: groupLines, totals: groupTotals };
  }).filter((g) => g.lines.length > 0);

  return {
    lines,
    groups,
    totals,
    unpricedLines: lines.filter((l) => l.cost.length === 0).length,
    events: lines.reduce((s, l) => s + l.events, 0),
    since: since.toISOString(),
  };
}
