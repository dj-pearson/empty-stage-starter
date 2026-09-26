/**
 * Family milestones: the parent-side counterpart to each child's badges.
 *
 * Every one is about the adults logging and offering, never about how much a
 * child ate. Earned dates come from the attempt history (familyMilestones),
 * so nothing is stored and every device shows the same date.
 */
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Progress } from '@/components/ui/progress';
import { familyMilestones, isoDayDiff, type FamilyMilestoneId } from '@/lib/familyRhythm';
import type { KidAttemptRow } from '@/lib/kidProgress';
import '@/i18n/appLocale';

/** Earned this recently reads as "New". */
const NEW_FOR_DAYS = 7;

export interface FamilyMilestonesProps {
  attempts: readonly KidAttemptRow[];
  todayIso: string;
}

export const FamilyMilestones = memo(function FamilyMilestones({ attempts, todayIso }: FamilyMilestonesProps) {
  const { t, i18n } = useTranslation();
  const milestones = useMemo(() => familyMilestones(attempts, todayIso), [attempts, todayIso]);

  const copy: Record<FamilyMilestoneId, { title: string; description: string }> = {
    first_log: {
      title: t('familyRhythm.milestones.first_log.title', { defaultValue: 'First log' }),
      description: t('familyRhythm.milestones.first_log.description', { defaultValue: 'Logged the first meal.' }),
    },
    days_7: {
      title: t('familyRhythm.milestones.days_7.title', { defaultValue: 'A week of notes' }),
      description: t('familyRhythm.milestones.days_7.description', { defaultValue: 'Logged on 7 different days.' }),
    },
    days_30: {
      title: t('familyRhythm.milestones.days_30.title', { defaultValue: 'A month of notes' }),
      description: t('familyRhythm.milestones.days_30.description', { defaultValue: 'Logged on 30 different days.' }),
    },
    days_100: {
      title: t('familyRhythm.milestones.days_100.title', { defaultValue: 'The long record' }),
      description: t('familyRhythm.milestones.days_100.description', {
        defaultValue: 'Logged on 100 different days.',
      }),
    },
    streak_7: {
      title: t('familyRhythm.milestones.streak_7.title', { defaultValue: 'Steady hand' }),
      description: t('familyRhythm.milestones.streak_7.description', { defaultValue: 'A 7-day logging streak.' }),
    },
    streak_21: {
      title: t('familyRhythm.milestones.streak_21.title', { defaultValue: 'Habit formed' }),
      description: t('familyRhythm.milestones.streak_21.description', { defaultValue: 'A 21-day logging streak.' }),
    },
    streak_60: {
      title: t('familyRhythm.milestones.streak_60.title', { defaultValue: 'Two months running' }),
      description: t('familyRhythm.milestones.streak_60.description', { defaultValue: 'A 60-day logging streak.' }),
    },
    new_foods_5: {
      title: t('familyRhythm.milestones.new_foods_5.title', { defaultValue: 'Widening the table' }),
      description: t('familyRhythm.milestones.new_foods_5.description', {
        defaultValue: 'Offered 5 foods for the first time.',
      }),
    },
    new_foods_20: {
      title: t('familyRhythm.milestones.new_foods_20.title', { defaultValue: 'Adventurous kitchen' }),
      description: t('familyRhythm.milestones.new_foods_20.description', {
        defaultValue: 'Offered 20 foods for the first time.',
      }),
    },
    stuck_with_it: {
      title: t('familyRhythm.milestones.stuck_with_it.title', { defaultValue: 'Stuck with it' }),
      description: t('familyRhythm.milestones.stuck_with_it.description', {
        defaultValue: 'Offered one food 10 times, whatever happened each time.',
      }),
    },
  };

  const dateFormat = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(i18n.language || undefined, { dateStyle: 'medium', timeZone: 'UTC' });
    } catch {
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
    }
  }, [i18n.language]);
  const formatIso = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return dateFormat.format(new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)));
  };

  const earnedCount = milestones.filter((m) => m.earnedOn).length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t('familyRhythm.milestones.intro', {
          defaultValue: '{{earned}} of {{total}} earned. These count what the grown-ups do: logging and offering.',
          earned: earnedCount,
          total: milestones.length,
        })}
      </p>
      <ul className="divide-y divide-border" data-testid="family-milestones">
        {milestones.map((m) => {
          const isNew = m.earnedOn !== null && isoDayDiff(m.earnedOn, todayIso) < NEW_FOR_DAYS;
          return (
            <li key={m.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className={m.earnedOn ? 'font-medium' : 'font-medium text-muted-foreground'}>
                  {copy[m.id].title}
                  {isNew ? (
                    <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                      {t('familyRhythm.milestones.new', { defaultValue: 'New' })}
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-muted-foreground">{copy[m.id].description}</p>
              </div>
              <div className="w-28 shrink-0 text-right text-sm">
                {m.earnedOn ? (
                  <span>{formatIso(m.earnedOn)}</span>
                ) : (
                  <>
                    <span className="tabular-nums text-muted-foreground">
                      {m.progress} / {m.target}
                    </span>
                    <Progress
                      value={(m.progress / m.target) * 100}
                      className="mt-1 h-1.5"
                      aria-label={t('familyRhythm.milestones.progressLabel', {
                        defaultValue: '{{title}}: {{progress}} of {{target}}',
                        title: copy[m.id].title,
                        progress: m.progress,
                        target: m.target,
                      })}
                    />
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
});
