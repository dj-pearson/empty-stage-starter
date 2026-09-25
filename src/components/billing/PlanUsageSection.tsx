import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Check, ExternalLink, Minus, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import type { UsageStats } from '@/hooks/useUsageStats';
import { upgradeTargetFor } from '@/lib/planSource';
import { USAGE_METERS, resolveInclusions, type UsageMeterDef } from '@/lib/planInclusions';
import { parseServerTimestamp, usageState, type UsageState } from '@/lib/usageState';
import { cn } from '@/lib/utils';
import { SUPPORT_EMAIL } from '@/components/billing/ManagePlanCard';
import '@/i18n/appLocale';

export type UpgradeSourceKind = Parameters<typeof upgradeTargetFor>[0];

export interface PlanUsageSectionProps {
  stats: UsageStats | null;
  /** Set when get_usage_stats failed. With no stats, the section shows Retry. */
  error?: unknown;
  loading?: boolean;
  /**
   * Who bills the plan; decides where the one upgrade prompt points. Without
   * it (plan still loading) no prompt is shown.
   */
  sourceKind?: UpgradeSourceKind;
  onRetry: () => void;
  onOpenPortal?: () => void;
  className?: string;
}

/** Tailwind class for the Progress indicator, set through the root's className. */
function indicatorClass(state: UsageState, kind: UsageMeterDef['kind']): string {
  if (state === 'over') return '[&>div]:bg-destructive';
  if (state === 'near') return '[&>div]:bg-warning';
  if (state === 'full') return kind === 'quota' ? '[&>div]:bg-warning' : '[&>div]:bg-primary';
  return '[&>div]:bg-primary';
}

/** Higher is more constrained; 0 never earns an upgrade prompt. */
function pressure(state: UsageState, kind: UsageMeterDef['kind']): number {
  if (state === 'over') return 4;
  if (state === 'full') return kind === 'quota' ? 3 : 2;
  if (state === 'near') return 1;
  return 0;
}

interface MeterRow {
  def: UsageMeterDef;
  current: number;
  limit: number | null;
  state: UsageState;
  resetsAt: Date | null;
}

/**
 * How close the household is to each limit of the plan the server enforces,
 * then what that plan includes. Everything here is read from get_usage_stats;
 * if that did not load, the section says so instead of guessing.
 */
export function PlanUsageSection({ stats, error, loading = false, sourceKind, onRetry, onOpenPortal, className }: PlanUsageSectionProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const heading = t('billing.usage.title', { defaultValue: 'Usage this period' });

  if (!stats) {
    if (error && !loading) {
      return (
        <Card className={className}>
          <CardHeader>
            <CardTitle className="text-lg">{heading}</CardTitle>
          </CardHeader>
          <CardContent>
            <div role="alert" className="space-y-3">
              <p className="text-sm">{t('billing.usage.error', { defaultValue: "We couldn't load your usage" })}</p>
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                <span>{t('billing.usage.retry', { defaultValue: 'Retry' })}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card className={className} aria-busy="true">
        <CardHeader>
          <CardTitle className="text-lg">{heading}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <span className="sr-only">{t('billing.usage.loading', { defaultValue: 'Loading usage' })}</span>
          {USAGE_METERS.map((m) => (
            <Skeleton key={m.id} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const planName = stats.plan.name;
  const rows: MeterRow[] = USAGE_METERS.map((def) => {
    const u = stats.usage[def.id];
    const resetsAt = 'resets_at' in u ? parseServerTimestamp(u.resets_at) : null;
    return { def, current: u.current, limit: u.limit, state: usageState(u.current, u.limit, def.kind), resetsAt };
  });

  const worst = rows.reduce<MeterRow | null>((best, row) => {
    const p = pressure(row.state, row.def.kind);
    if (p === 0) return best;
    if (!best) return row;
    const bp = pressure(best.state, best.def.kind);
    if (p !== bp) return p > bp ? row : best;
    const ratio = (r: MeterRow) => (r.limit ? r.current / r.limit : 0);
    return ratio(row) > ratio(best) ? row : best;
  }, null);

  const resetLabel = (row: MeterRow): string | null => {
    if (!row.resetsAt || row.state === 'not_included' || row.state === 'unlimited') return null;
    if (row.def.reset === 'daily') {
      const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(row.resetsAt);
      return t('billing.usage.resetsAt', { defaultValue: 'Resets at {{time}}', time });
    }
    if (row.def.reset === 'monthly') {
      const day = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(row.resetsAt);
      return t('billing.usage.resetsOn', { defaultValue: 'Resets {{date}}', date: day });
    }
    return null;
  };

  const label = (def: UsageMeterDef) => t(def.labelKey, { defaultValue: def.defaultLabel });
  const inclusions = resolveInclusions(stats.plan);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">{heading}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <ul className="space-y-5">
          {rows.map((row) => {
            const name = label(row.def);
            const reset = resetLabel(row);
            const ofText =
              row.limit === null
                ? t('billing.usage.ofUnlimited', { defaultValue: '{{current}} of Unlimited', current: row.current })
                : t('billing.usage.of', { defaultValue: '{{current}} of {{limit}}', current: row.current, limit: row.limit });
            return (
              <li key={row.def.id} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{name}</span>
                  {row.state !== 'not_included' && <span className="shrink-0 tabular-nums">{ofText}</span>}
                </div>

                {row.state === 'not_included' ? (
                  <p className="text-sm text-muted-foreground">
                    {t('billing.usage.notIncluded', { defaultValue: 'Not in {{plan}}. Included in Pro', plan: planName })}
                  </p>
                ) : (
                  <>
                    {row.limit !== null && (
                      <Progress
                        value={Math.min(100, (row.current / row.limit) * 100)}
                        className={cn('h-1.5 motion-reduce:[&>div]:transition-none', indicatorClass(row.state, row.def.kind))}
                        aria-label={name}
                        aria-valuetext={ofText}
                      />
                    )}
                    {row.state === 'over' && row.limit !== null && (
                      <p className="text-sm">
                        {row.def.id === 'children'
                          ? t('billing.usage.overChildren', {
                              defaultValue: "{{count}} children, your plan allows {{limit}}. Everything you've added stays.",
                              count: row.current,
                              limit: row.limit,
                            })
                          : t('billing.usage.overPantry', {
                              defaultValue: "{{count}} foods, your plan allows {{limit}}. Everything you've added stays.",
                              count: row.current,
                              limit: row.limit,
                            })}
                      </p>
                    )}
                    {row.state === 'full' && row.def.kind === 'count' && (
                      <p className="text-sm text-muted-foreground">
                        {t('billing.usage.fullCount', { defaultValue: "You've used every slot on this plan." })}
                      </p>
                    )}
                    {row.state === 'full' && row.def.kind === 'quota' && (
                      <p className="text-sm font-medium">
                        <span className="rounded bg-warning/15 px-1.5 py-0.5">
                          {t('billing.usage.fullQuota', { defaultValue: 'All used for now' })}
                        </span>
                      </p>
                    )}
                    {reset && <p className="text-xs text-muted-foreground">{reset}</p>}
                  </>
                )}
              </li>
            );
          })}
        </ul>

        {worst && sourceKind && <UpgradePrompt row={worst} name={label(worst.def)} sourceKind={sourceKind} onOpenPortal={onOpenPortal} />}

        <div className="space-y-3 border-t pt-4">
          <h3 className="text-base font-semibold">{t('billing.inclusions.title', { defaultValue: 'What your plan includes' })}</h3>
          <ul className="space-y-2">
            {inclusions.map((item) => {
              const text = t(item.labelKey, { defaultValue: item.defaultLabel });
              const value =
                item.limit === undefined
                  ? null
                  : item.limit === null
                    ? t('billing.inclusions.unlimited', { defaultValue: 'Unlimited' })
                    : item.included
                      ? new Intl.NumberFormat(locale).format(item.limit)
                      : null;
              return (
                <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                  {item.included ? (
                    <Link to={item.route} className="flex min-h-11 items-center gap-2 underline-offset-4 hover:underline">
                      <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span>{text}</span>
                    </Link>
                  ) : (
                    <span className="flex min-h-11 items-center gap-2 text-muted-foreground">
                      <Minus className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{text}</span>
                      <span className="sr-only">{t('billing.inclusions.notIncluded', { defaultValue: 'Not included' })}</span>
                    </span>
                  )}
                  {value && <span className="shrink-0 tabular-nums text-muted-foreground">{value}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function UpgradePrompt({
  row,
  name,
  sourceKind,
  onOpenPortal,
}: {
  row: MeterRow;
  name: string;
  sourceKind: UpgradeSourceKind;
  onOpenPortal?: () => void;
}) {
  const { t } = useTranslation();
  const target = upgradeTargetFor(sourceKind);
  const message =
    row.state === 'near'
      ? t('billing.usage.prompt.near', { defaultValue: '{{name}} is close to your limit.', name })
      : t('billing.usage.prompt.full', { defaultValue: '{{name}} is at your limit.', name });

  let action: JSX.Element | null = null;
  if (target.type === 'pricing') {
    action = (
      <Button size="sm" asChild>
        <Link to="/pricing">
          <ArrowUpRight className="mr-2 h-4 w-4" aria-hidden="true" />
          <span>{t('billing.usage.prompt.pricing', { defaultValue: 'See plans with more room' })}</span>
        </Link>
      </Button>
    );
  } else if (target.type === 'portal') {
    action = onOpenPortal ? (
      <Button size="sm" variant="outline" onClick={onOpenPortal}>
        <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
        <span>{t('billing.usage.prompt.portal', { defaultValue: 'Change plan in the billing portal' })}</span>
      </Button>
    ) : null;
  } else if (target.type === 'appStore') {
    action = (
      <Button size="sm" variant="outline" asChild>
        <a href={target.href} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
          <span>{t('billing.usage.prompt.appStore', { defaultValue: 'Change plan in iPhone Settings' })}</span>
        </a>
      </Button>
    );
  } else {
    action = (
      <Button size="sm" variant="outline" asChild>
        <a href={`mailto:${SUPPORT_EMAIL}`}>
          <span>{t('billing.usage.prompt.support', { defaultValue: 'Ask us about more room' })}</span>
        </a>
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm">{message}</p>
      {action}
    </div>
  );
}

