/**
 * How a logged result looks, everywhere it is shown.
 *
 * Ate and Tasted used to be the same green (--secondary and --safe-food share
 * a value in light mode) and Ate painted text-white on it. Each result now
 * gets its own hue and its own icon, so the two stay apart for a parent who
 * can't tell the colours apart either. Render with the outline variant:
 * `<Badge variant="outline" className={RESULT_STYLE[r].className}>`, because
 * the default variant repaints to primary on hover. The hover class on each
 * style pins the background for the same reason.
 */
import { AlertTriangle, Check, Circle, Utensils, X, type LucideIcon } from 'lucide-react';

export type LoggedResult = 'ate' | 'tasted' | 'refused';

export interface ResultStyle {
  className: string;
  /** A small solid marker (a dot or bar) in the result's hue. */
  dotClassName: string;
  Icon: LucideIcon;
}

export const RESULT_STYLE: Readonly<Record<LoggedResult, ResultStyle>> = Object.freeze({
  ate: {
    className: 'border-safe-food/40 bg-safe-food/15 text-safe-food hover:bg-safe-food/15',
    dotClassName: 'bg-safe-food',
    Icon: Check,
  },
  tasted: {
    className: 'border-try-bite/50 bg-try-bite/15 text-foreground hover:bg-try-bite/15',
    dotClassName: 'bg-try-bite',
    Icon: Utensils,
  },
  refused: {
    className: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive',
    dotClassName: 'bg-destructive',
    Icon: X,
  },
});

/** A meal on the plan with no result yet. */
export const NOT_LOGGED_STYLE: Readonly<ResultStyle> = Object.freeze({
  className: 'border-border bg-transparent text-muted-foreground hover:bg-transparent',
  dotClassName: 'bg-muted-foreground/40',
  Icon: Circle,
});

/**
 * A hard time at the table (food_attempts.outcome 'tantrum'). Outlined in
 * the destructive hue with a warning icon, so it reads apart from a plain
 * refusal (solid destructive, X) without a colour of its own.
 */
export const TANTRUM_STYLE: Readonly<ResultStyle> = Object.freeze({
  className: 'border-destructive bg-transparent text-destructive hover:bg-transparent',
  dotClassName: 'border-2 border-destructive bg-background',
  Icon: AlertTriangle,
});

/**
 * food_attempts.outcome in the same look as a meal result: success is Ate,
 * partial is Tasted, refused is Refused. Anything else reads as not logged.
 */
export function attemptOutcomeStyle(outcome: string): ResultStyle {
  switch (outcome) {
    case 'success':
      return RESULT_STYLE.ate;
    case 'partial':
      return RESULT_STYLE.tasted;
    case 'refused':
      return RESULT_STYLE.refused;
    case 'tantrum':
      return TANTRUM_STYLE;
    default:
      return NOT_LOGGED_STYLE;
  }
}
