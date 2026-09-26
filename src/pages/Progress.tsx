/**
 * Progress: for each child, what has changed over the months.
 *
 * This page is a composer, like Insights. It resolves the scope once (a
 * child, or the family when no child is selected or the selected id no longer
 * exists), owns the single long-horizon progress read, and hands each section
 * what it needs:
 *
 *   milestones  the months trajectory and headline per child
 *   badges      earned badges, per child
 *   family      the parents' logging rhythm and family milestones
 *   numbers     household counts over the year, with export
 *   report      the care report for a clinician: PDF or expiring link
 *   history     the last logged dishes
 *
 * /dashboard/analytics used to redraw a pie, a top-five list and a success
 * rate that Insights, Kids and the Food Journal already show. It was folded
 * in here and redirects to ?section=numbers; the rest of what it showed is a
 * link-out at the bottom, not a second copy.
 */

import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useFoods, useKids, usePlan, useRecipes } from '@/contexts/AppContext';
import { useKidsProgressSummary } from '@/hooks/useKidsProgressSummary';
import { useLandOnSection } from '@/hooks/useLandOnSection';
import { toISODate } from '@/lib/date-utils';
import { KidChips } from '@/components/foodTracker/KidChips';
import { InsightsGate } from '@/components/insights/InsightsGate';
import { ProgressDashboard as ProgressTrajectory } from '@/components/ProgressDashboard';
import { AchievementsView } from '@/components/AchievementsView';
import { HouseholdNumbers } from '@/components/progress/HouseholdNumbers';
import { ResultHistoryCard } from '@/components/ResultHistoryCard';
import { FamilyRhythmCard } from '@/components/family/FamilyRhythmCard';
import { FamilyMilestones } from '@/components/family/FamilyMilestones';
import { CareReportDialog } from '@/components/careReport/CareReportDialog';
import type { Food, Kid } from '@/types';
import '@/i18n/appLocale';

type Scope = { kind: 'kid'; kid: Kid } | { kind: 'family' };

/** ?section=<key> -> the element it lands on. */
const PROGRESS_SECTIONS = Object.freeze({
  milestones: 'progress-milestones',
  badges: 'progress-badges',
  family: 'progress-family',
  numbers: 'progress-numbers',
  report: 'progress-report',
  history: 'progress-history',
} as const);

type SectionKey = keyof typeof PROGRESS_SECTIONS;
const SECTION_ORDER: readonly SectionKey[] = ['milestones', 'badges', 'family', 'numbers', 'report', 'history'];

const linkClass =
  'inline-flex min-h-11 shrink-0 items-center rounded-md px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/** Keeps a landed-on section clear of the sticky app header. */
const sectionClass = 'scroll-mt-20 space-y-3';

function formatMonth(iso: string, language: string): string {
  const [y, m] = iso.slice(0, 10).split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, 1);
  const opts: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' };
  try {
    return new Intl.DateTimeFormat(language || undefined, opts).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, opts).format(date);
  }
}

export default function Progress() {
  const { t, i18n } = useTranslation();
  const { kids, activeKidId, kidsHydrated } = useKids();
  const { foodsHydrated } = useFoods();
  const [sinceIso, setSinceIso] = useState<string | null>(null);

  const activeKid = activeKidId ? kids.find((k) => k.id === activeKidId) : undefined;
  const scope: Scope = activeKid ? { kind: 'kid', kid: activeKid } : { kind: 'family' };

  const ready = kidsHydrated && foodsHydrated && kids.length > 0;
  useLandOnSection(ready, PROGRESS_SECTIONS);

  const title =
    scope.kind === 'kid'
      ? t('progressPage.header.titleKid', { name: scope.kid.name, defaultValue: "{{name}}'s progress" })
      : t('progressPage.header.titleFamily', { defaultValue: 'Family progress' });

  const subtitle = sinceIso
    ? t('progressPage.header.since', {
        date: formatMonth(sinceIso, i18n.language),
        defaultValue: "From what you've logged since {{date}}",
      })
    : t('progressPage.header.sinceNone', { defaultValue: "From what you've logged" });

  return (
    <div className="container mx-auto max-w-3xl space-y-4 px-4 py-4 md:space-y-6 md:py-8">
      <Helmet>
        <title>{t('progressPage.meta.title', { defaultValue: 'Progress - EatPal' })}</title>
        <meta
          name="description"
          content={t('progressPage.meta.description', {
            defaultValue:
              "What has changed for each child over the months: foods that reached safe, ladder graduations, badges and household numbers.",
          })}
        />
        <meta name="robots" content="noindex" />
      </Helmet>

      <header>
        <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        <KidChips
          className="mt-3"
          ariaLabel={t('progressPage.scope.chooseChild', { defaultValue: 'Show progress for' })}
        />
      </header>

      <InsightsGate>
        <ProgressBody scope={scope} onSince={setSinceIso} />
      </InsightsGate>
    </div>
  );
}

function ProgressBody({ scope, onSince }: { scope: Scope; onSince: (iso: string | null) => void }) {
  const { t } = useTranslation();
  const { kids, setActiveKid } = useKids();
  const { foods } = useFoods();
  const { recipes } = useRecipes();
  const { planEntries } = usePlan();
  // Recomputed on every render so a tab left open past midnight rolls over.
  const todayIso = toISODate(new Date());

  // `scope` is rebuilt on every render, so key the memo on the kid object.
  const scopedKid = scope.kind === 'kid' ? scope.kid : null;
  const scopeKids = useMemo(() => (scopedKid ? [scopedKid] : kids), [scopedKid, kids]);
  const targetKidIds = useMemo(() => scopeKids.map((k) => k.id), [scopeKids]);

  // Read for every child, not just the one in scope: the household numbers
  // list siblings too, and their "graduations to date" come from these ladder
  // rows. Every consumer filters by kid_id, so the scoped views are unaffected.
  const householdKidIds = useMemo(() => kids.map((k) => k.id), [kids]);

  // A new logged result anywhere in the household refetches the durable rows,
  // so a meal marked in another tab shows up here without a reload.
  const refreshKey = useMemo(
    () => planEntries.filter((e) => e.result != null).length,
    [planEntries],
  );

  const progressOpts = useMemo(() => ({ since: 'all' as const, refreshKey }), [refreshKey]);
  const progress = useKidsProgressSummary(householdKidIds, progressOpts);

  const earliest = useMemo(() => {
    let min: string | null = null;
    for (const a of progress.attempts) {
      const at = a.attempted_at;
      if (!at || !a.kid_id || !targetKidIds.includes(a.kid_id)) continue;
      if (min === null || at < min) min = at;
    }
    return min;
  }, [progress.attempts, targetKidIds]);

  useEffect(() => {
    onSince(earliest);
  }, [earliest, onSince]);

  const foodsById = useMemo(() => new Map<string, Food>(foods.map((f) => [f.id, f])), [foods]);
  const scopeKidId = scope.kind === 'kid' ? scope.kid.id : null;

  const sectionLabel: Record<SectionKey, string> = {
    milestones: t('progressPage.jump.milestones', { defaultValue: 'Milestones' }),
    badges: t('progressPage.jump.badges', { defaultValue: 'Badges' }),
    family: t('progressPage.jump.family', { defaultValue: 'Family' }),
    numbers: t('progressPage.jump.numbers', { defaultValue: 'Numbers' }),
    report: t('progressPage.jump.report', { defaultValue: 'Care report' }),
    history: t('progressPage.jump.history', { defaultValue: 'Recent meals' }),
  };

  const journalTo = scopeKidId
    ? `/dashboard/food-journal?kid=${encodeURIComponent(scopeKidId)}`
    : '/dashboard/food-journal';
  const linkOuts: { to: string; label: string }[] = [
    { to: '/dashboard/kids', label: t('progressPage.links.thisWeek', { defaultValue: 'This week' }) },
    { to: '/dashboard/insights', label: t('progressPage.links.working', { defaultValue: "What's working" }) },
    {
      to: journalTo,
      label: t('progressPage.links.journal', { defaultValue: 'Meal log and care-team report' }),
    },
    { to: '/dashboard/food-tracker', label: t('progressPage.links.tracker', { defaultValue: 'Offer today' }) },
  ];

  return (
    <div className="space-y-6 md:space-y-8">
      <nav aria-label={t('progressPage.jump.label', { defaultValue: 'Jump to section' })}>
        <ul className="-mx-2 flex gap-1 overflow-x-auto whitespace-nowrap">
          {SECTION_ORDER.map((key) => (
            <li key={key}>
              <a href={`#${PROGRESS_SECTIONS[key]}`} className={linkClass}>
                {sectionLabel[key]}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* ProgressTrajectory renders its own section and h2. */}
      <div id={PROGRESS_SECTIONS.milestones} className="scroll-mt-20">
        <ProgressTrajectory
          kids={scopeKids}
          ladderRows={progress.ladderRows}
          attempts={progress.attempts}
          loading={progress.loading}
          error={progress.error}
          truncated={progress.truncated}
          todayIso={todayIso}
          onSelectKid={scope.kind === 'family' ? setActiveKid : undefined}
        />
      </div>

      <section id={PROGRESS_SECTIONS.badges} aria-labelledby="progress-badges-title" className={sectionClass}>
        <h2 id="progress-badges-title" className="text-lg font-semibold">
          {t('progressPage.badges.title', { defaultValue: 'Badges' })}
        </h2>
        {scope.kind === 'kid' ? (
          <AchievementsView kid={scope.kid} ladderRows={progress.ladderRows} foodsById={foodsById} />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t('progressPage.badges.familyIntro', {
                defaultValue: 'Each child earns their own. Pick one to see theirs.',
              })}
            </p>
            <ul className="-mx-2">
              {kids.map((kid) => (
                <li key={kid.id}>
                  <button
                    type="button"
                    onClick={() => setActiveKid(kid.id)}
                    className="inline-flex min-h-11 items-center rounded-md px-2 text-left text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {t('progressPage.badges.familyRow', { name: kid.name, defaultValue: "See {{name}}'s badges" })}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section id={PROGRESS_SECTIONS.family} aria-labelledby="progress-family-title" className={sectionClass}>
        <h2 id="progress-family-title" className="text-lg font-semibold">
          {t('progressPage.family.title', { defaultValue: 'Family milestones' })}
        </h2>
        {/* Household-wide on purpose: whoever logs, for whichever child, it counts. */}
        <FamilyRhythmCard attempts={progress.attempts} todayIso={todayIso} loading={progress.loading} headingLevel="h3" />
        <FamilyMilestones attempts={progress.attempts} todayIso={todayIso} />
      </section>

      <section id={PROGRESS_SECTIONS.numbers} aria-labelledby="progress-numbers-title" className={sectionClass}>
        <h2 id="progress-numbers-title" className="text-lg font-semibold">
          {t('progressPage.numbers.title', { defaultValue: 'Household numbers' })}
        </h2>
        <HouseholdNumbers kids={kids} scopeKidId={scopeKidId} ladderRows={progress.ladderRows} />
      </section>

      <section id={PROGRESS_SECTIONS.report} aria-labelledby="progress-report-title" className={sectionClass}>
        <h2 id="progress-report-title" className="text-lg font-semibold">
          {t('progressPage.report.title', { defaultValue: 'Care report' })}
        </h2>
        <p className="max-w-[68ch] text-sm text-muted-foreground">
          {t('progressPage.report.intro', {
            defaultValue:
              'For a psychologist, feeding therapist or dietitian. Download a PDF, or send a link that expires. Nothing is shared until you choose to.',
          })}
        </p>
        {scope.kind === 'kid' ? (
          <CareReportDialog kid={scope.kid} ladderRows={progress.ladderRows} foods={foods} />
        ) : (
          <ul className="-mx-2">
            {kids.map((kid) => (
              <li key={kid.id}>
                <button
                  type="button"
                  onClick={() => setActiveKid(kid.id)}
                  className="inline-flex min-h-11 items-center rounded-md px-2 text-left text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {t('progressPage.report.familyRow', { name: kid.name, defaultValue: "Make {{name}}'s report" })}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id={PROGRESS_SECTIONS.history} aria-labelledby="progress-history-title" className="scroll-mt-20">
        <ResultHistoryCard
          titleId="progress-history-title"
          entries={planEntries}
          foods={foods}
          recipes={recipes}
          kids={kids}
          kidId={scopeKidId}
          todayIso={todayIso}
        />
      </section>

      <nav aria-label={t('progressPage.links.label', { defaultValue: 'Elsewhere in EatPal' })}>
        <ul className="-mx-2 flex flex-wrap gap-x-2">
          {linkOuts.map((link) => (
            <li key={link.to}>
              <Link to={link.to} className={linkClass}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
