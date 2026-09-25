/**
 * Every try of one food for one child, newest first, 20 at a time.
 *
 * A reaction note leads each entry, ahead of anything else, because it is
 * the one thing a parent must not scroll past. Read-only in this pass.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Star } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { loadFoodAttempts, type FoodAttemptDetailRow } from '@/hooks/useFoodAttemptHistory';
import { isRung, RUNG_META } from '@/lib/exposureLadder';
import { attemptOutcomeStyle } from '@/lib/mealResultStyle';
import { cn } from '@/lib/utils';
import { OUTCOME_LABEL_DEFAULTS, outcomeLabelKey } from './foodHistoryFormat';
import '@/i18n/appLocale';

/** Past this, a reaction note is clamped to three lines with a toggle. */
const LONG_NOTE_CHARS = 160;

type TimelineState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: FoodAttemptDetailRow[]; page: number; hasMore: boolean };

export interface FoodHistorySheetProps {
  kidId: string;
  foodId: string | null;
  foodName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ReactionNote({ text }: { text: string }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const long = text.length > LONG_NOTE_CHARS || text.split('\n').length > 3;
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1 text-sm font-medium text-destructive">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        {t('foodTracker.history.sheet.reaction', { defaultValue: 'Reaction' })}
      </p>
      <p className={cn('whitespace-pre-line text-sm', !expanded && 'line-clamp-3')}>{text}</p>
      {long && (
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded
            ? t('foodTracker.history.sheet.showLess', { defaultValue: 'Show less' })
            : t('foodTracker.history.sheet.showAll', { defaultValue: 'Show all' })}
        </Button>
      )}
    </div>
  );
}

export function FoodHistorySheet({ kidId, foodId, foodName, open, onOpenChange }: FoodHistorySheetProps) {
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  const [state, setState] = useState<TimelineState>({ status: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  /** Identifies the (kid, food) a response belongs to; stale ones are dropped. */
  const requestKey = useRef('');

  const loadFirst = useCallback(() => {
    if (!foodId) return;
    const key = `${kidId}:${foodId}`;
    requestKey.current = key;
    setState({ status: 'loading' });
    void loadFoodAttempts(kidId, foodId, 0).then((res) => {
      if (requestKey.current !== key) return;
      setState(res.ok ? { status: 'ready', rows: res.rows, page: 0, hasMore: res.hasMore } : { status: 'error' });
    });
  }, [kidId, foodId]);

  useEffect(() => {
    if (open && foodId) loadFirst();
    if (!open) requestKey.current = '';
  }, [open, foodId, loadFirst]);

  const loadOlder = async () => {
    if (state.status !== 'ready' || !foodId || loadingMore) return;
    const key = requestKey.current;
    setLoadingMore(true);
    const res = await loadFoodAttempts(kidId, foodId, state.page + 1);
    setLoadingMore(false);
    if (requestKey.current !== key) return;
    if (!res.ok) {
      setState({ status: 'error' });
      return;
    }
    setState({
      status: 'ready',
      rows: [...state.rows, ...res.rows.filter((r) => !state.rows.some((p) => p.id === r.id))],
      page: state.page + 1,
      hasMore: res.hasMore,
    });
  };

  const dateFmt = new Intl.DateTimeFormat(i18n.language || undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  let body;
  if (state.status === 'loading') {
    body = (
      <div aria-busy="true" className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  } else if (state.status === 'error') {
    body = (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {t('foodTracker.history.loadFailed', {
              defaultValue: "Couldn't load this history. Nothing is lost; try again.",
            })}
          </span>
          <Button variant="outline" size="sm" onClick={loadFirst}>
            {t('foodTracker.history.retry', { defaultValue: 'Retry' })}
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else if (state.rows.length === 0) {
    body = (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {t('foodTracker.history.sheet.empty', { defaultValue: 'No tries logged for this food yet.' })}
      </p>
    );
  } else {
    body = (
      <>
        <ol className="divide-y divide-border">
          {state.rows.map((row) => {
            const style = attemptOutcomeStyle(row.outcome);
            const labelKey = outcomeLabelKey(row.outcome);
            const OutcomeIcon = style.Icon;
            const stage = isRung(row.stage) ? row.stage : null;
            const reaction = (row.reaction_notes ?? '').trim();
            const notes = (row.parent_notes ?? '').trim();
            return (
              <li key={row.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">
                    {stage ? (
                      <>
                        <span aria-hidden="true">{RUNG_META[stage].emoji} </span>
                        {t(`foodLadder.rungs.${stage}`, { defaultValue: RUNG_META[stage].label })}
                      </>
                    ) : (
                      t('foodTracker.history.sheet.stageUnknown', { defaultValue: 'Step not recorded' })
                    )}
                  </span>
                  <Badge variant="outline" className={cn('gap-1', style.className)}>
                    <OutcomeIcon className="h-3 w-3" aria-hidden="true" />
                    {t(`foodTracker.history.outcome.${labelKey}`, {
                      defaultValue: OUTCOME_LABEL_DEFAULTS[labelKey],
                    })}
                  </Badge>
                  {row.is_milestone && (
                    <span
                      role="img"
                      aria-label={t('foodTracker.history.sheet.milestone', { defaultValue: 'Milestone' })}
                      className="inline-flex text-primary"
                    >
                      <Star className="h-4 w-4 fill-current" aria-hidden="true" />
                    </span>
                  )}
                </div>
                {reaction && <ReactionNote text={reaction} />}
                {notes && (
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {t('foodTracker.history.sheet.parentNotes', { defaultValue: 'Notes' })}:
                    </span>{' '}
                    {notes}
                  </p>
                )}
                {row.attempted_at && (
                  <time dateTime={row.attempted_at} className="block text-xs text-muted-foreground">
                    {dateFmt.format(new Date(row.attempted_at))}
                  </time>
                )}
              </li>
            );
          })}
        </ol>
        {state.hasMore && (
          <Button
            variant="outline"
            className="mt-2 min-h-11 w-full"
            onClick={() => void loadOlder()}
            disabled={loadingMore}
            aria-busy={loadingMore}
          >
            {t('foodTracker.history.sheet.showOlder', { defaultValue: 'Show older' })}
          </Button>
        )}
      </>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={cn('flex flex-col gap-0 p-0', isMobile ? 'max-h-[90dvh]' : 'w-full sm:max-w-md')}
      >
        <SheetHeader className="px-6 pb-2 pt-6 text-left">
          <SheetTitle>
            {t('foodTracker.history.sheet.title', { defaultValue: '{{food}} over time', food: foodName })}
          </SheetTitle>
          <SheetDescription>
            {t('foodTracker.history.sheet.description', { defaultValue: 'Every try, newest first.' })}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 pb-6">{body}</div>
      </SheetContent>
    </Sheet>
  );
}
