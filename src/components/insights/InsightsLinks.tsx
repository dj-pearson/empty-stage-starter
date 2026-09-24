/**
 * Where the detail lives. Insights answers "how is it going" for four weeks;
 * the per-food ladder, the meal log, the plan and the day-by-day week line
 * each have their own screen, so this row sends the parent there instead of
 * repeating them.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { parseReviewed } from '@/lib/kidProfileCompleteness';
import type { Kid } from '@/types';
import '@/i18n/appLocale';

/** A profile older than this gets a gentle "check it" hint. */
const REVIEW_DUE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const linkClass =
  'inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

function formatDate(date: Date, language: string): string {
  try {
    return new Intl.DateTimeFormat(language || undefined, { dateStyle: 'medium' }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
  }
}

/**
 * `kid` is the child in scope. Without one (the family view) the links that
 * belong to a single child, the profile and its review hint, are left out and
 * the Progress link drops the possessive.
 */
export function InsightsLinks({ kid = null, now = new Date() }: { kid?: Kid | null; now?: Date }) {
  const { t, i18n } = useTranslation();
  const kidParam = kid ? encodeURIComponent(kid.id) : '';

  const reviewed = kid ? parseReviewed(kid.profile_last_reviewed) : null;
  const reviewDue = reviewed !== null && now.getTime() - reviewed.getTime() > REVIEW_DUE_DAYS * DAY_MS;

  const links: { to: string; label: string }[] = [
    {
      to: '/dashboard/progress',
      label: kid
        ? t('insightsPage.links.progress', { name: kid.name, defaultValue: "{{name}}'s progress over months" })
        : t('insightsPage.links.progressFamily', { defaultValue: 'Progress over months' }),
    },
    { to: '/dashboard/food-tracker', label: t('insightsPage.links.tracker', { defaultValue: 'Food Tracker' }) },
    { to: '/dashboard/food-journal', label: t('insightsPage.links.journal', { defaultValue: 'Food Journal' }) },
    { to: '/dashboard/planner', label: t('insightsPage.links.planner', { defaultValue: 'Planner' }) },
    ...(kid
      ? [
          {
            to: `/dashboard/kids?kid=${kidParam}&edit=1`,
            label: t('insightsPage.links.profile', { name: kid.name, defaultValue: "{{name}}'s profile" }),
          },
        ]
      : []),
    { to: '/dashboard/kids', label: t('insightsPage.links.kidsDay', { defaultValue: 'Day by day on Kids' }) },
  ];

  return (
    <nav aria-label={t('insightsPage.links.label', { defaultValue: 'More detail' })} className="space-y-2">
      {kid && reviewDue && reviewed ? (
        <p className="flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
          <span>
            {t('insightsPage.review.due', {
              name: kid.name,
              date: formatDate(reviewed, i18n.language),
              defaultValue: "{{name}}'s profile was last reviewed {{date}}. Check it is still current.",
            })}
          </span>
          <Link to={`/dashboard/kids?kid=${kidParam}&intake=1`} className={`${linkClass} -mx-2 self-start`}>
            {t('insightsPage.review.action', { name: kid.name, defaultValue: "Review {{name}}'s profile" })}
          </Link>
        </p>
      ) : null}
      <ul className="-mx-2 flex flex-wrap gap-x-2">
        {links.map((link) => (
          <li key={link.to}>
            <Link to={link.to} className={linkClass}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
