/**
 * Insights: for one child over the last four weeks, how it is going, what is
 * working, where variety is thin and the one thing to try next.
 *
 * This page is a composer. It resolves the scope once (a child, or the
 * family when no child is selected or the selected id no longer exists, the
 * same rule KidChips uses), owns the single progress read, and hands each
 * section what it needs. The sections compute their own claims from logged
 * results; the per-food ladder, the meal log and the day-by-day week line stay
 * on their own screens and are linked from InsightsLinks.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useFoods, useKids, usePlan } from '@/contexts/AppContext';
import { useKidsProgressSummary } from '@/hooks/useKidsProgressSummary';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { toISODate } from '@/lib/date-utils';
import { KidChips } from '@/components/foodTracker/KidChips';
import { InsightsGate } from '@/components/insights/InsightsGate';
import { InsightsLinks } from '@/components/insights/InsightsLinks';
import { WeekTrendSection } from '@/components/insights/WeekTrendSection';
import { NextStepSection } from '@/components/insights/NextStepSection';
import { WorkingSection } from '@/components/insights/WorkingSection';
import { VarietySection } from '@/components/insights/VarietySection';
import { AllergyCheckSection } from '@/components/insights/AllergyCheckSection';
import type { Kid } from '@/types';
import '@/i18n/appLocale';

/** Four weeks, today included: inside the -30d plan window the app loads. */
const WINDOW_DAYS = 28;

type Scope = { kind: 'kid'; kid: Kid } | { kind: 'family' };

/** Home's InsightSlot kinds, and the section each one lands on. */
const FROM_TARGET: Record<'safeFood' | 'fatigue' | 'seasonal' | 'birthday', string | null> = {
  safeFood: 'insights-working',
  fatigue: 'insights-variety',
  seasonal: null,
  birthday: null,
};

function isFromKind(value: string | null): value is keyof typeof FROM_TARGET {
  return value !== null && Object.prototype.hasOwnProperty.call(FROM_TARGET, value);
}

/** Bumps when the tab comes back into view, so a return refetches progress. */
function useVisibleCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const onChange = () => {
      if (document.visibilityState === 'visible') setCount((c) => c + 1);
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return count;
}

export default function InsightsDashboard() {
  const { t } = useTranslation();
  const { kids, activeKidId, setActiveKid, kidsHydrated } = useKids();
  const { foodsHydrated } = useFoods();
  const { planEntries } = usePlan();
  const prefersReducedMotion = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();
  const [todayIso] = useState(() => toISODate(new Date()));

  const activeKid = activeKidId ? kids.find((k) => k.id === activeKidId) : undefined;
  const scope: Scope = activeKid ? { kind: 'kid', kid: activeKid } : { kind: 'family' };

  const targetKidIds = useMemo(
    () => (activeKid ? [activeKid.id] : kids.map((k) => k.id)),
    [activeKid, kids],
  );

  const visibleCount = useVisibleCount();
  const loggedCount = useMemo(() => {
    const ids = new Set(targetKidIds);
    return planEntries.filter((e) => ids.has(e.kid_id) && e.result != null).length;
  }, [planEntries, targetKidIds]);
  const refreshKey = `${visibleCount}:${loggedCount}`;

  const progressOpts = useMemo(() => ({ windowDays: WINDOW_DAYS, refreshKey }), [refreshKey]);
  const progress = useKidsProgressSummary(targetKidIds, progressOpts);

  // ?from=<kind> from Home's "See all insights": read once, land on the
  // matching section, then drop the param so Back or a refresh do not replay it.
  const fromHandled = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const ready = kidsHydrated && foodsHydrated && kids.length > 0;
  const landOn = useCallback(
    (targetId: string | null) => {
      if (!mounted.current) return;
      const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';
      const section = targetId ? document.getElementById(targetId) : null;
      if (section) {
        section.scrollIntoView?.({ behavior, block: 'start' });
        const heading = section.querySelector<HTMLElement>('h2');
        if (heading) {
          if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
          heading.focus({ preventScroll: true });
        }
      } else if (typeof window.scrollTo === 'function') {
        try {
          window.scrollTo({ top: 0, behavior });
        } catch {
          // jsdom and old engines: position is already the top on a fresh load.
        }
      }
    },
    [prefersReducedMotion],
  );

  useEffect(() => {
    if (fromHandled.current) return;
    const from = searchParams.get('from');
    if (from === null) {
      fromHandled.current = true;
      return;
    }
    if (!ready) return;
    fromHandled.current = true;
    const targetId = isFromKind(from) ? FROM_TARGET[from] : null;
    // Clearing the param re-runs this effect, so the frame is not cancelled
    // in its cleanup; landOn is a no-op once the page has unmounted.
    requestAnimationFrame(() => landOn(targetId));
    const next = new URLSearchParams(searchParams);
    next.delete('from');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, ready, landOn]);

  const title =
    scope.kind === 'kid'
      ? t('insightsPage.header.titleKid', { name: scope.kid.name, defaultValue: "{{name}}'s insights" })
      : t('insightsPage.header.titleFamily', { defaultValue: 'Family insights' });

  return (
    <div className="container mx-auto max-w-3xl space-y-4 px-4 py-4 md:space-y-6 md:py-8">
      <Helmet>
        <title>{t('insightsPage.meta.title', { defaultValue: 'Insights - EatPal' })}</title>
        <meta
          name="description"
          content={t('insightsPage.meta.description', {
            defaultValue:
              "How each child's eating is going over the last four weeks: what is working, where variety is thin, and what to try next.",
          })}
        />
        <meta name="robots" content="noindex" />
      </Helmet>

      <header>
        <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('insightsPage.header.subtitle', { defaultValue: 'The last four weeks, from what you logged.' })}
        </p>
        <KidChips
          className="mt-3"
          ariaLabel={t('insightsPage.scope.chooseChild', { defaultValue: 'Show insights for' })}
        />
      </header>

      <InsightsGate>
        {scope.kind === 'kid' ? (
          <div className="space-y-4 md:space-y-6">
            <WeekTrendSection kids={[scope.kid]} progress={progress} todayIso={todayIso} />
            <NextStepSection kid={scope.kid} todayIso={todayIso} progress={progress} />
            <WorkingSection kid={scope.kid} todayIso={todayIso} />
            <VarietySection kid={scope.kid} todayIso={todayIso} />
            <AllergyCheckSection kid={scope.kid} todayIso={todayIso} />
            <InsightsLinks kid={scope.kid} />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {kids.map((kid) => (
              <li key={kid.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                <h2 className="text-lg font-semibold">
                  <button
                    type="button"
                    onClick={() => setActiveKid(kid.id)}
                    aria-label={t('insightsPage.family.rowLabel', {
                      name: kid.name,
                      defaultValue: "Open {{name}}'s insights",
                    })}
                    className="-mx-2 inline-flex min-h-11 items-center rounded-md px-2 text-left text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {kid.name}
                  </button>
                </h2>
                <WeekTrendSection kids={[kid]} progress={progress} todayIso={todayIso} compact embedded />
                <NextStepSection kid={kid} todayIso={todayIso} progress={progress} compact />
              </li>
            ))}
          </ul>
        )}
      </InsightsGate>
    </div>
  );
}
