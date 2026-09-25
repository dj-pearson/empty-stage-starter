/**
 * The food journal as something to hand over: day labels, the patterns card
 * and the plain-text report a parent pastes into a message to a pediatrician
 * or feeding therapist.
 *
 * Pure apart from the appLocale import, which registers the copy these keys
 * resolve to. `t` is passed in so the page's useTranslation() instance does
 * the translating and tests can pin it.
 */
import '@/i18n/appLocale';
import { addIsoDays } from '@/lib/date-utils';
import { firstName } from '@/lib/firstName';
import { buildResultIndex, type ResultIndex } from '@/lib/kidFit';
import { summarizeJournal, type JournalDay, type JournalItem, type JournalNote } from '@/lib/foodJournal';
import type { AmountEaten, MealSlot, PlanEntry } from '@/types';

export type Translate = (key: string, vars?: Record<string, unknown>) => string;

interface DayFormats {
  full: Intl.DateTimeFormat;
  weekday: Intl.DateTimeFormat;
}

const formatCache = new Map<string, DayFormats>();

function formatsFor(locale: string): DayFormats {
  const cached = formatCache.get(locale);
  if (cached) return cached;
  let formats: DayFormats;
  try {
    formats = {
      full: new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
      weekday: new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }),
    };
  } catch {
    // A malformed locale tag throws RangeError; the label still has to render.
    formats = formatsFor('en');
  }
  formatCache.set(locale, formats);
  return formats;
}

/** A 'YYYY-MM-DD' key as UTC midnight, formatted in UTC so it never shifts a day. */
function dateOf(isoDate: string): Date {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

/**
 * "Today" / "Yesterday" with the full date under it, or a short weekday date
 * ("Mon, Sep 21") for anything older. `todayIso` is the local calendar day.
 */
export function formatJournalDayLabel(
  date: string,
  todayIso: string,
  locale: string,
  t: Translate
): { primary: string; secondary: string | null } {
  const day = date.slice(0, 10);
  const formats = formatsFor(locale);
  const when = dateOf(day);
  if (day === todayIso.slice(0, 10)) {
    return { primary: t('foodJournal.day.today', { defaultValue: 'Today' }), secondary: formats.full.format(when) };
  }
  if (day === addIsoDays(todayIso, -1)) {
    return {
      primary: t('foodJournal.day.yesterday', { defaultValue: 'Yesterday' }),
      secondary: formats.full.format(when),
    };
  }
  return { primary: formats.weekday.format(when), secondary: null };
}

export interface MostOfferedFood {
  key: string;
  name: string | null;
  offered: number;
  ate: number;
  tasted: number;
  refused: number;
}

export interface AllergenHit {
  allergen: string;
  count: number;
  names: string[];
}

export interface JournalReaction {
  date: string;
  name: string | null;
  text: string;
}

export type AmountTrend = 'up' | 'down' | 'flat' | null;

export interface JournalPatterns {
  mostOffered: MostOfferedFood[];
  allergenHits: AllergenHit[];
  reactions: JournalReaction[];
  amountTrend: AmountTrend;
}

export interface BuildJournalPatternsOptions {
  days: ReadonlyArray<JournalDay>;
  /** Every plan entry; sliced to [from, to] here. */
  entries: ReadonlyArray<PlanEntry>;
  /** Null means every child. */
  kidId: string | null;
  from: string;
  to: string;
  foodName: (foodId: string) => string | null;
}

const AMOUNT_SCORE: Record<AmountEaten, number> = { a_lot: 3, some: 2, nibbles: 1 };
/** Mean-score change (on the 1-3 scale) below which the trend reads flat. */
const TREND_THRESHOLD = 0.25;

function mergeIndex(into: ResultIndex, from: ResultIndex): void {
  for (const [foodId, s] of from) {
    const t = into.get(foodId);
    if (!t) {
      into.set(foodId, { ...s });
      continue;
    }
    t.offered += s.offered;
    t.tries += s.tries;
    t.ate += s.ate;
    t.tasted += s.tasted;
    t.refused += s.refused;
  }
}

function amountMean(days: ReadonlyArray<JournalDay>): { n: number; mean: number } {
  const { amounts } = summarizeJournal(days);
  let n = 0;
  let sum = 0;
  for (const key of Object.keys(AMOUNT_SCORE) as AmountEaten[]) {
    n += amounts[key];
    sum += amounts[key] * AMOUNT_SCORE[key];
  }
  return { n, mean: n ? sum / n : 0 };
}

function daysBetween(from: string, to: string): number {
  return Math.round((dateOf(to).getTime() - dateOf(from).getTime()) / 86_400_000);
}

/**
 * What the range says about a child: the foods offered most (with how they
 * went), allergen hits, written reactions and whether portions are growing.
 */
export function buildJournalPatterns({
  days,
  entries,
  kidId,
  from,
  to,
  foodName,
}: BuildJournalPatternsOptions): JournalPatterns {
  const inRange = entries.filter((e) => {
    const d = e.date.slice(0, 10);
    return d >= from && d <= to && (!kidId || e.kid_id === kidId);
  });
  const index: ResultIndex = new Map();
  const kidIds = kidId ? [kidId] : [...new Set(inRange.map((e) => e.kid_id))];
  for (const id of kidIds) mergeIndex(index, buildResultIndex(inRange, id));

  const mostOffered: MostOfferedFood[] = [...index.entries()]
    .map(([key, s]) => ({ key, name: foodName(key), offered: s.offered, ate: s.ate, tasted: s.tasted, refused: s.refused }))
    .sort(
      (a, b) =>
        b.offered - a.offered ||
        b.ate + b.tasted - (a.ate + a.tasted) ||
        (a.name ?? '￿').localeCompare(b.name ?? '￿') ||
        a.key.localeCompare(b.key)
    )
    .slice(0, 3);

  const kidDays: JournalDay[] = days.map((day) => ({
    ...day,
    items: kidId ? day.items.filter((i) => i.kidId === kidId) : day.items,
  }));

  const hits = new Map<string, AllergenHit>();
  const reactions: JournalReaction[] = [];
  for (const day of kidDays) {
    for (const item of day.items) {
      if (item.allergen) {
        const hit = hits.get(item.allergen) ?? { allergen: item.allergen, count: 0, names: [] };
        hit.count += 1;
        if (item.name && !hit.names.includes(item.name)) hit.names.push(item.name);
        hits.set(item.allergen, hit);
      }
      const noteSets: Array<{ name: string | null; notes: JournalNote[] }> = [
        { name: item.name, notes: item.notes },
        ...item.components.map((c) => ({ name: c.name ?? item.name, notes: c.notes })),
      ];
      for (const set of noteSets) {
        for (const note of set.notes) {
          if (note.source === 'reaction') reactions.push({ date: day.date, name: set.name, text: note.text });
        }
      }
    }
  }
  reactions.sort((a, b) => b.date.localeCompare(a.date));
  const allergenHits = [...hits.values()].sort((a, b) => b.count - a.count || a.allergen.localeCompare(b.allergen));

  // Split the range in two by date: the first half is the older days.
  const span = daysBetween(from, to) + 1;
  const secondStart = addIsoDays(from, Math.floor(span / 2));
  const early = amountMean(kidDays.filter((d) => d.date < secondStart));
  const late = amountMean(kidDays.filter((d) => d.date >= secondStart));
  let amountTrend: AmountTrend = null;
  if (early.n >= 2 && late.n >= 2) {
    const diff = late.mean - early.mean;
    amountTrend = diff >= TREND_THRESHOLD ? 'up' : diff <= -TREND_THRESHOLD ? 'down' : 'flat';
  }

  return { mostOffered, allergenHits, reactions, amountTrend };
}

export interface FormatJournalTextOptions {
  t: Translate;
  slotLabel: (slot: MealSlot) => string;
  dayLabel: (date: string) => string;
  kidName: (kidId: string) => string;
  /** Group each day by kid under a kid heading. */
  familyMode: boolean;
  /** "Maria, 12:40" for a note, or null for no byline. */
  authorLabel?: (note: JournalNote) => string | null;
  /** Lines above the days, e.g. the kid's name and the range. */
  header?: string[];
  /** Lines from the patterns card, printed after the header. */
  patternLines?: string[];
  /**
   * The report leaves the household (a feeding therapist, a pediatrician).
   * Kid headings carry the first name only, and a household note is signed by
   * `roleLabel` instead of the member's name and time. Header lines are the
   * caller's, so the caller passes first names there too.
   */
  careTeam?: boolean;
  /** The byline for a household note in a care-team report, already translated ("Parent"). */
  roleLabel?: string;
}

function resultLabel(result: JournalItem['result'], t: Translate): string {
  switch (result) {
    case 'ate':
      return t('foodJournal.result.ate', { defaultValue: 'Ate' });
    case 'tasted':
      return t('foodJournal.result.tasted', { defaultValue: 'Tasted' });
    case 'refused':
      return t('foodJournal.result.refused', { defaultValue: 'Refused' });
    default:
      return t('foodJournal.report.noteOnly', { defaultValue: 'Note only' });
  }
}

function amountLabel(amount: AmountEaten, t: Translate): string {
  switch (amount) {
    case 'a_lot':
      return t('foodJournal.amount.a_lot', { defaultValue: 'A lot' });
    case 'some':
      return t('foodJournal.amount.some', { defaultValue: 'Some' });
    default:
      return t('foodJournal.amount.nibbles', { defaultValue: 'Nibbles' });
  }
}

/**
 * The journal as plain text. Each meal is one line,
 * `- Slot: Name / Result / Amount [/ First taste] [/ Contains X]`, with
 * separately logged sides and every line of every note indented beneath it,
 * so it survives being pasted into SMS, email or a patient portal.
 */
export function formatJournalText(days: ReadonlyArray<JournalDay>, opts: FormatJournalTextOptions): string {
  const { t, slotLabel, dayLabel, familyMode, careTeam } = opts;
  const out: string[] = [];
  const unknown = () => t('foodJournal.unknownFood', { defaultValue: 'Unknown food' });
  const kidName = careTeam ? (id: string) => firstName(opts.kidName(id)) : opts.kidName;
  const role = opts.roleLabel ?? t('foodJournal.careTeam.role', { defaultValue: 'Parent' });
  // Only household notes (feedback with an author) get a byline; entry notes
  // and reactions never carried one, and a care-team report must not add one.
  const authorLabel = careTeam
    ? (note: JournalNote) => (note.source === 'feedback' && note.userId ? role : null)
    : opts.authorLabel;

  const pushNotes = (notes: JournalNote[], indent: string) => {
    for (const note of notes) {
      const text =
        note.source === 'reaction'
          ? t('foodJournal.report.reaction', { text: note.text, defaultValue: 'Reaction: {{text}}' })
          : note.text;
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const by = authorLabel?.(note);
      if (by && lines.length > 0) lines[lines.length - 1] = `${lines[lines.length - 1]} (${by})`;
      for (const line of lines) out.push(`${indent}${line}`);
    }
  };

  const pushItem = (item: JournalItem, indent: string) => {
    const parts = [`${slotLabel(item.mealSlot)}: ${item.name ?? unknown()}`, resultLabel(item.result, t)];
    if (item.amountEaten) parts.push(amountLabel(item.amountEaten, t));
    if (item.firstTry) parts.push(t('foodJournal.report.firstTaste', { defaultValue: 'First taste' }));
    if (item.allergen) {
      parts.push(t('foodJournal.report.contains', { allergen: item.allergen, defaultValue: 'Contains {{allergen}}' }));
    }
    out.push(`${indent}- ${parts.join(' / ')}`);
    pushNotes(item.notes, `${indent}    `);
    for (const c of item.components) {
      const cParts = [c.name ?? unknown(), resultLabel(c.result, t)];
      if (c.amountEaten) cParts.push(amountLabel(c.amountEaten, t));
      out.push(`${indent}    - ${cParts.join(' / ')}`);
      pushNotes(c.notes, `${indent}        `);
    }
  };

  if (opts.header?.length) out.push(...opts.header, '');
  if (opts.patternLines?.length) out.push(...opts.patternLines, '');

  days.forEach((day, i) => {
    if (i > 0) out.push('');
    out.push(dayLabel(day.date));
    if (!familyMode) {
      for (const item of day.items) pushItem(item, '');
      return;
    }
    const byKid = new Map<string, JournalItem[]>();
    for (const item of day.items) {
      const list = byKid.get(item.kidId);
      if (list) list.push(item);
      else byKid.set(item.kidId, [item]);
    }
    for (const [kidId, items] of byKid) {
      out.push(`  ${kidName(kidId)}`);
      for (const item of items) pushItem(item, '  ');
    }
  });

  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}
