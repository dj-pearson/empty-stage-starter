/**
 * The care report: one child's feeding work over a date range, for a
 * psychologist, feeding therapist or dietitian.
 *
 * It widens the ladder report (clinicianLadderReport.ts, US-605) with what a
 * clinician asks for first: how often the family logged, what was offered and
 * how it went, which foods are safe now, which were new, and, only when the
 * parent opts in, the notes they wrote at the table.
 *
 * The same object is rendered to a PDF on the device and, when a parent makes
 * a share link, stored as the link's snapshot and rendered by /care/:token.
 * So the type is the privacy boundary for both. It carries one identifier, a
 * first name, and no ids: food ids are resolved to names here and dropped,
 * because a snapshot that leaves the household has no use for a uuid.
 *
 * Pure. Nothing here reads the clock or touches Supabase.
 */
import { z } from 'zod';
import { buildClinicianLadderReport, type ClinicianReportLadderRow } from './clinicianLadderReport';
import { RUNGS } from './exposureLadder';

/** Bumped when the shape changes, so /care/:token can refuse what it cannot read. */
export const CARE_REPORT_VERSION = 1;

/** Notes are cut to this length, and at most MAX_NOTES are kept (newest). */
export const MAX_NOTE_LENGTH = 280;
export const MAX_NOTES = 60;

const ACCEPTED = new Set(['success', 'partial']);

export interface CareReportAttempt {
  foodId: string | null;
  stage: string | null;
  outcome: string | null;
  /** ISO timestamp or 'YYYY-MM-DD'. */
  attemptedAt: string | null;
  preparationMethod: string | null;
  parentNotes?: string | null;
  reactionNotes?: string | null;
}

export interface CareReportInput {
  /** First name only. */
  kidFirstName: string;
  from: string;
  to: string;
  /**
   * Every attempt up to `to`, including those before `from`: "new" means
   * never offered before, and that needs the earlier history.
   */
  attempts: CareReportAttempt[];
  ladderRows: ClinicianReportLadderRow[];
  foodNames: Record<string, string>;
  /** The child's always-eats list, already resolved to names. */
  safeFoodNames: string[];
  includeNotes: boolean;
}

const outcomeCountsSchema = z.object({
  success: z.number(),
  partial: z.number(),
  refused: z.number(),
  tantrum: z.number(),
  total: z.number(),
});

const rungSchema = z.enum(RUNGS);

export const careReportSchema = z.object({
  version: z.literal(CARE_REPORT_VERSION),
  kidFirstName: z.string().max(60),
  from: z.string(),
  to: z.string(),
  summary: z.object({
    daysLogged: z.number(),
    offers: z.number(),
    accepted: z.number(),
    refused: z.number(),
    distress: z.number(),
    foodsOffered: z.number(),
    newFoodsOffered: z.number(),
  }),
  safeFoods: z.array(z.string()),
  newFoods: z.array(
    z.object({ name: z.string(), firstOfferedOn: z.string(), offers: z.number(), accepted: z.number() }),
  ),
  ladder: z.array(
    z.object({
      foodName: z.string(),
      currentRung: rungSchema.nullable(),
      status: z.string().nullable(),
      startRung: rungSchema.nullable(),
      rungHistory: z.array(z.object({ rung: rungSchema, on: z.string() })),
      outcomeCounts: outcomeCountsSchema,
      bestPreps: z.array(z.object({ method: z.string(), attempts: z.number(), acceptanceRate: z.number() })),
    }),
  ),
  notes: z.array(z.object({ on: z.string(), food: z.string(), text: z.string() })),
  includesNotes: z.boolean(),
});

export type CareReport = z.infer<typeof careReportSchema>;
export type CareReportLadderRow = CareReport['ladder'][number];

function dayOf(value: string): string {
  const t = value.indexOf('T');
  return t > 0 ? value.slice(0, t) : value;
}

function clip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_NOTE_LENGTH ? `${flat.slice(0, MAX_NOTE_LENGTH - 3)}...` : flat;
}

export function buildCareReport(input: CareReportInput): CareReport {
  const { kidFirstName, from, to, attempts, ladderRows, foodNames, safeFoodNames, includeNotes } = input;
  const nameOf = (foodId: string) => foodNames[foodId] ?? '';

  const firstOffered = new Map<string, string>();
  for (const a of attempts) {
    if (!a.foodId || !a.attemptedAt) continue;
    const day = dayOf(a.attemptedAt);
    const seen = firstOffered.get(a.foodId);
    if (!seen || day < seen) firstOffered.set(a.foodId, day);
  }

  const inRange = attempts.filter((a) => {
    if (!a.foodId || !a.attemptedAt) return false;
    const day = dayOf(a.attemptedAt);
    return day >= from && day <= to;
  });

  const days = new Set<string>();
  const foods = new Set<string>();
  let accepted = 0;
  let refused = 0;
  let distress = 0;
  const newFoodTally = new Map<string, { offers: number; accepted: number }>();
  for (const a of inRange) {
    const foodId = a.foodId as string;
    days.add(dayOf(a.attemptedAt as string));
    foods.add(foodId);
    const ok = a.outcome !== null && ACCEPTED.has(a.outcome);
    if (ok) accepted += 1;
    if (a.outcome === 'refused') refused += 1;
    if (a.outcome === 'tantrum') distress += 1;
    const first = firstOffered.get(foodId);
    if (first && first >= from && first <= to) {
      const tally = newFoodTally.get(foodId) ?? { offers: 0, accepted: 0 };
      tally.offers += 1;
      if (ok) tally.accepted += 1;
      newFoodTally.set(foodId, tally);
    }
  }

  const newFoods = [...newFoodTally.entries()]
    .map(([foodId, tally]) => ({
      name: nameOf(foodId),
      firstOfferedOn: firstOffered.get(foodId) as string,
      offers: tally.offers,
      accepted: tally.accepted,
    }))
    .filter((f) => f.name)
    .sort((a, b) => (a.firstOfferedOn === b.firstOfferedOn ? a.name.localeCompare(b.name) : a.firstOfferedOn < b.firstOfferedOn ? -1 : 1));

  const ladderReport = buildClinicianLadderReport({
    kidFirstName,
    from,
    to,
    attempts: attempts.map((a) => ({
      foodId: a.foodId,
      stage: a.stage,
      outcome: a.outcome,
      attemptedAt: a.attemptedAt,
      preparationMethod: a.preparationMethod,
    })),
    ladderRows,
    foodNames,
  });
  // Only foods on the ladder belong in the ladder section; plain meal offers
  // are already in the summary and the new-foods list.
  const onLadder = new Set(ladderRows.map((r) => r.foodId));
  const ladder: CareReportLadderRow[] = ladderReport.rows
    .filter((row) => onLadder.has(row.foodId) && nameOf(row.foodId))
    .map((row) => ({
      foodName: nameOf(row.foodId),
      currentRung: row.currentRung,
      status: row.status,
      startRung: row.startRung,
      rungHistory: row.rungHistory,
      outcomeCounts: row.outcomeCounts,
      bestPreps: row.bestPreps,
    }));

  const masteredNames = ladderRows
    .filter((r) => r.status === 'mastered')
    .map((r) => nameOf(r.foodId))
    .filter(Boolean);
  const safeFoods = [...new Set([...safeFoodNames.map((n) => n.trim()).filter(Boolean), ...masteredNames])].sort(
    (a, b) => a.localeCompare(b),
  );

  const notes: CareReport['notes'] = [];
  if (includeNotes) {
    for (const a of inRange) {
      const parts = [a.parentNotes, a.reactionNotes].map((n) => n?.trim()).filter((n): n is string => Boolean(n));
      if (parts.length === 0) continue;
      notes.push({ on: dayOf(a.attemptedAt as string), food: nameOf(a.foodId as string), text: clip(parts.join(' / ')) });
    }
    notes.sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0));
    notes.splice(MAX_NOTES);
  }

  return {
    version: CARE_REPORT_VERSION,
    kidFirstName,
    from,
    to,
    summary: {
      daysLogged: days.size,
      offers: inRange.length,
      accepted,
      refused,
      distress,
      foodsOffered: foods.size,
      newFoodsOffered: newFoodTally.size,
    },
    safeFoods,
    newFoods,
    ladder,
    notes,
    includesNotes: includeNotes,
  };
}

/** A stored snapshot, checked before it is rendered. Null when unreadable. */
export function parseCareReport(value: unknown): CareReport | null {
  const parsed = careReportSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

