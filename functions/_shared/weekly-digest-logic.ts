/**
 * Pure logic for the weekly household digest (US-501).
 *
 * DB-free so the weekly-stats computation, the "skip empty" gate, and the
 * (mostly deterministic) template rendering are unit-testable. Only the 1-2
 * sentence encouragement is model-written; everything else is deterministic.
 */

export interface WeeklyStats {
  plansMade: number;
  newFoodsTried: number;
  activeDays: number;
}

/** Compute the week's recap from plan-entry timestamps and the new-food count. */
export function computeWeeklyStats(planEntryDates: string[], newFoodsCount: number): WeeklyStats {
  const days = new Set(planEntryDates.map((d) => d.slice(0, 10)));
  return {
    plansMade: planEntryDates.length,
    newFoodsTried: Math.max(0, newFoodsCount),
    activeDays: days.size,
  };
}

/** Skip the digest for households with no activity this week (no empty digests). */
export function hasActivity(stats: WeeklyStats): boolean {
  return stats.plansMade > 0 || stats.newFoodsTried > 0;
}

export interface DigestContext {
  unsubscribeUrl: string;
  encouragement?: string;
}

export interface RenderedDigest {
  subject: string;
  body: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Deterministic weekly recap email; the model only supplies `encouragement`. */
export function renderDigest(stats: WeeklyStats, ctx: DigestContext): RenderedDigest {
  const enc = ctx.encouragement?.trim() ? `<p>${ctx.encouragement.trim()}</p>` : '';
  const body = `
    <div style="font-family:system-ui,sans-serif;max-width:520px">
      <h2>Your EatPal week</h2>
      <ul style="line-height:1.7">
        <li><strong>${plural(stats.plansMade, 'meal planned', 'meals planned')}</strong></li>
        <li><strong>${plural(stats.newFoodsTried, 'new food tried', 'new foods tried')}</strong></li>
        <li><strong>${plural(stats.activeDays, 'active day', 'active days')}</strong> this week</li>
      </ul>
      ${enc}
      <p><a href="https://tryeatpal.com/dashboard">Open your dashboard →</a></p>
      <p style="color:#9ca3af;font-size:12px;margin-top:24px">
        Weekly digest from EatPal. <a href="${ctx.unsubscribeUrl}">Unsubscribe</a>.</p>
    </div>`.trim();
  return { subject: 'Your EatPal week in review', body };
}
