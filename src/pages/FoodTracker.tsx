/**
 * Food Tracker: per food, per child. Where each food sits on the exposure
 * ladder, what to offer today, and what is one step from safe.
 *
 * Its neighbours answer different questions, and link here rather than
 * repeating it: the Food Journal is "what happened at each meal, day by day"
 * (plan_entries), and the Kids card is "this week's counts".
 *
 * Kid switching lives in the shell's header selector and, with two or more
 * children, in chips on this page. The per-child body is keyed on the child,
 * so a switch resets every dialog, filter and draft inside it instead of
 * carrying one child's half-typed log over to the next.
 */

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { Target, UserCog, UserPlus } from 'lucide-react';
import { useKids } from '@/contexts/AppContext';
import { useQuickLog } from '@/contexts/QuickLogContext';
import { FoodTrackerGate } from '@/components/foodTracker/FoodTrackerGate';
import { KidChips } from '@/components/foodTracker/KidChips';
import { FamilyLadderSummary } from '@/components/foodTracker/FamilyLadderSummary';
import { LadderOverview } from '@/components/foodTracker/LadderOverview';
import { FoodHistoryList } from '@/components/foodTracker/FoodHistoryList';
import type { ManageKidsDialogRef } from '@/components/ManageKidsDialog';
import { Button } from '@/components/ui/button';
import '@/i18n/appLocale';

const ManageKidsDialog = lazy(() =>
  import('@/components/ManageKidsDialog').then((m) => ({ default: m.ManageKidsDialog }))
);

type KidsDialogRequest = { kind: 'add' } | { kind: 'edit'; kidId: string };

const JOURNAL_ROUTE = '/dashboard/food-journal';
const KIDS_ROUTE = '/dashboard/kids';

/**
 * ManageKidsDialog is heavy and most visits never open it. It mounts on the
 * first request, and the request runs once the lazy chunk has attached its ref.
 */
function useManageKidsDialog() {
  const [mounted, setMounted] = useState(false);
  const instance = useRef<ManageKidsDialogRef | null>(null);
  const pending = useRef<KidsDialogRequest | null>(null);

  const run = (dialog: ManageKidsDialogRef, request: KidsDialogRequest) => {
    if (request.kind === 'add') dialog.openForAdd();
    else dialog.openForEdit(request.kidId);
  };

  const attach = useCallback((dialog: ManageKidsDialogRef | null) => {
    instance.current = dialog;
    if (dialog && pending.current) {
      const request = pending.current;
      pending.current = null;
      run(dialog, request);
    }
  }, []);

  const request = useCallback((next: KidsDialogRequest) => {
    if (instance.current) {
      run(instance.current, next);
      return;
    }
    pending.current = next;
    setMounted(true);
  }, []);

  const openForAdd = useCallback(() => request({ kind: 'add' }), [request]);
  const openForEdit = useCallback((kidId: string) => request({ kind: 'edit', kidId }), [request]);

  const dialog = mounted ? (
    <Suspense fallback={null}>
      <ManageKidsDialog ref={attach} />
    </Suspense>
  ) : null;

  return { openForAdd, openForEdit, dialog };
}

export default function FoodTracker() {
  const { t } = useTranslation();
  const { kids, activeKidId } = useKids();
  const { registerPageAction } = useQuickLog();
  const { openForAdd, openForEdit, dialog } = useManageKidsDialog();

  // A stale id (a deleted child, another household's id left in storage)
  // resolves to nothing and falls through to family mode.
  const activeKid = kids.find((k) => k.id === activeKidId) ?? null;
  const activeKidKey = activeKid?.id ?? null;

  const [logNonce, setLogNonce] = useState(0);

  // ?log=<foodId> (Meal Builder's "how did the try bite go"): read it once,
  // hand it to the ladder, and take it out of the URL so a reload or a back
  // navigation does not open the log controls again.
  const [searchParams, setSearchParams] = useSearchParams();
  const logParam = searchParams.get('log');
  const [logFoodId, setLogFoodId] = useState<string | undefined>(() => logParam ?? undefined);
  useEffect(() => {
    if (logParam === null) return;
    if (logParam) setLogFoodId(logParam);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('log');
        return next;
      },
      { replace: true }
    );
  }, [logParam, setSearchParams]);

  // The FAB's primary item becomes "Log a tasting" while a child is picked.
  // Unmounting (or going back to family mode) hands it back.
  useEffect(() => {
    if (!activeKidKey) return;
    return registerPageAction({
      label: t('foodTracker.logTasting', { defaultValue: 'Log a tasting' }),
      run: () => setLogNonce((n) => n + 1),
    });
  }, [activeKidKey, registerPageAction, t]);

  // After a switch, focus the new child's heading and say whose foods these
  // are. Not on first render: landing on the page is not a switch.
  const kidHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousKid = useRef<string | null | undefined>(undefined);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    const before = previousKid.current;
    previousKid.current = activeKidKey;
    if (before === undefined || before === activeKidKey || !activeKid) return;
    kidHeadingRef.current?.focus();
    setAnnouncement(t('foodTracker.nowTracking', { defaultValue: 'Now tracking {{name}}', name: activeKid.name }));
    // activeKid is read for its name only; the id is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKidKey]);

  const subtitle = activeKid
    ? t('foodTracker.subtitleKid', {
        defaultValue: "{{name}}'s foods: what to offer today and what is close to safe.",
        name: activeKid.name,
      })
    : t('foodTracker.subtitleFamily', {
        defaultValue: 'Every child\'s foods at a glance. Pick a child to log a tasting.',
      });

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6">
      <Helmet>
        <title>{`${t('foodTracker.title')} - EatPal`}</title>
        <meta
          name="description"
          content={t('foodTracker.page.metaDescription', {
            defaultValue:
              "See where each food sits on your child's ladder, what to offer today, and which foods are one step from safe.",
          })}
        />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Target className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{t('foodTracker.title')}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {/* Two whole-sentence links rather than <Trans>: Trans and its HTML parser weigh more than this page's copy. */}
              <Link to={JOURNAL_ROUTE} className="underline underline-offset-2 hover:text-foreground">
                {t('foodTracker.crossLinkJournal', { defaultValue: 'Past meals are in the Food Journal.' })}
              </Link>{' '}
              <Link to={KIDS_ROUTE} className="underline underline-offset-2 hover:text-foreground">
                {t('foodTracker.crossLinkKids', { defaultValue: 'Weekly counts are on Kids.' })}
              </Link>
            </p>
          </div>
        </div>

        {kids.length > 0 ? (
          activeKid ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11 shrink-0"
              onClick={() => openForEdit(activeKid.id)}
              aria-label={t('foodTracker.editChild', { defaultValue: "Edit {{name}}'s profile", name: activeKid.name })}
              title={t('foodTracker.editChild', { defaultValue: "Edit {{name}}'s profile", name: activeKid.name })}
            >
              <UserCog className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button type="button" variant="outline" className="min-h-11 shrink-0" onClick={openForAdd}>
              <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
              {t('foodTracker.addChild', { defaultValue: 'Add child' })}
            </Button>
          )
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite" role="status">
        {announcement}
      </p>

      <FoodTrackerGate onAddChild={openForAdd}>
        <KidChips className="mb-5" />

        {activeKid ? (
          <section key={activeKid.id} aria-labelledby="food-tracker-kid-heading" className="space-y-6">
            <h2
              id="food-tracker-kid-heading"
              ref={kidHeadingRef}
              tabIndex={-1}
              className="text-lg font-semibold focus:outline-none"
            >
              {t('foodTracker.kidHeading', { defaultValue: "{{name}}'s foods", name: activeKid.name })}
            </h2>
            <LadderOverview kid={activeKid} logRequestNonce={logNonce} logFoodId={logFoodId} />
            <FoodHistoryList kidId={activeKid.id} />
          </section>
        ) : (
          <section aria-labelledby="food-tracker-family-heading" className="space-y-4">
            <h2 id="food-tracker-family-heading" className="sr-only">
              {t('foodTracker.familyHeading', { defaultValue: 'Family' })}
            </h2>
            <FamilyLadderSummary kids={kids} />
          </section>
        )}
      </FoodTrackerGate>

      {dialog}
    </div>
  );
}
