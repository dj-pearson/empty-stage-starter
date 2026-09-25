/**
 * Tone classes for the Home insight cards.
 *
 * The birthday, seasonal-recall and most-repeated cards each carried their own
 * raw Tailwind palette (rose, sky, amber) with hand-written dark variants. These
 * map the same four moods onto the semantic tokens, which already carry their
 * dark-mode values. Every string is a literal so Tailwind's scanner sees it.
 */

export type InsightToneKind = 'high' | 'mild' | 'birthday' | 'neutral';

export interface InsightToneClasses {
  /** Card surface: background, border and default text colour. */
  surface: string;
  /** Leading icon colour. */
  icon: string;
  /** Outline badge on the card. */
  badge: string;
}

export function insightTone(kind: InsightToneKind): InsightToneClasses {
  switch (kind) {
    case 'high':
      return {
        surface: 'bg-destructive/5 border-destructive/30 text-destructive',
        icon: 'text-destructive',
        badge: 'bg-destructive/15 text-foreground border-destructive/30',
      };
    case 'mild':
      return {
        surface: 'bg-warning/5 border-warning/30 text-warning',
        icon: 'text-warning',
        badge: 'bg-warning/15 text-foreground border-warning/30',
      };
    case 'birthday':
      return {
        surface: 'bg-primary/5 border-primary/30 text-primary',
        icon: 'text-primary',
        badge: 'bg-primary/15 text-foreground border-primary/30',
      };
    case 'neutral':
    default:
      return {
        surface: 'bg-muted/50 border-border text-muted-foreground',
        icon: 'text-muted-foreground',
        badge: 'bg-muted text-foreground border-border',
      };
  }
}
