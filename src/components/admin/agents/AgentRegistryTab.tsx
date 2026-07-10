import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { logAgentAudit } from '@/lib/agentAudit';
import type { Database } from '@/integrations/supabase/types';

type AgentDefinition = Database['public']['Tables']['agent_definitions']['Row'];
type AgentRun = Database['public']['Tables']['agent_runs']['Row'];

interface AgentCardData {
  agent: AgentDefinition;
  lastRun: Pick<AgentRun, 'status' | 'started_at'> | null;
  todaySpendUsd: number;
}

const STATUS_STYLES: Record<string, string> = {
  running: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  succeeded: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  failed: 'bg-destructive/15 text-destructive',
  skipped: 'bg-muted text-muted-foreground',
};

function startOfUtcDayIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/**
 * Agent registry tab of the Command Center (US-483). One card per
 * agent_definitions row with an enabled toggle, last-run status/time, and
 * today's spend against the daily cap.
 */
export function AgentRegistryTab() {
  const { t, i18n } = useTranslation();
  const [cards, setCards] = useState<AgentCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const [{ data: agents, error: agentsError }, { data: runs, error: runsError }] =
          await Promise.all([
            supabase.from('agent_definitions').select('*').order('name'),
            // Bounded: recent runs cover last-run-per-agent + today's spend without
            // an unbounded scan of the full history.
            supabase
              .from('agent_runs')
              .select('agent_id, status, started_at, cost_usd')
              .order('started_at', { ascending: false })
              .limit(500),
          ]);
        if (agentsError) throw agentsError;
        if (runsError) throw runsError;
        if (!active) return;

        const dayStart = startOfUtcDayIso();
        const built: AgentCardData[] = (agents ?? []).map((agent) => {
          const agentRuns = (runs ?? []).filter((r) => r.agent_id === agent.id);
          const lastRun = agentRuns[0] ?? null; // runs are ordered desc
          const todaySpendUsd = agentRuns
            .filter((r) => r.started_at >= dayStart)
            .reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);
          return {
            agent,
            lastRun: lastRun ? { status: lastRun.status, started_at: lastRun.started_at } : null,
            todaySpendUsd,
          };
        });
        setCards(built);
      } catch (err) {
        console.error('agent registry load failed:', err);
        toast.error(t('agents.registry.loadError'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [t]);

  const currency = useMemo(
    () => new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'USD' }),
    [i18n.language],
  );
  const dateTime = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language],
  );

  async function toggleEnabled(card: AgentCardData, next: boolean) {
    setBusyId(card.agent.id);
    // Optimistic update; revert on failure.
    setCards((prev) =>
      prev.map((c) => (c.agent.id === card.agent.id ? { ...c, agent: { ...c.agent, enabled: next } } : c)),
    );
    const { error } = await supabase
      .from('agent_definitions')
      .update({ enabled: next })
      .eq('id', card.agent.id);
    setBusyId(null);
    if (error) {
      setCards((prev) =>
        prev.map((c) =>
          c.agent.id === card.agent.id ? { ...c, agent: { ...c.agent, enabled: !next } } : c,
        ),
      );
      toast.error(t('agents.registry.toggleError', { name: card.agent.name }));
      return;
    }
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) {
      void logAgentAudit({
        actor: auth.user.id,
        action: next ? 'agent_enabled' : 'agent_disabled',
        subjectType: 'agent_definition',
        subjectId: card.agent.id,
        detail: { name: card.agent.name },
      });
    }
    toast.success(
      next
        ? t('agents.registry.enabledToast', { name: card.agent.name })
        : t('agents.registry.disabledToast', { name: card.agent.name }),
    );
  }

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return <p className="text-muted-foreground py-12 text-center">{t('agents.registry.empty')}</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => {
        const { agent, lastRun, todaySpendUsd } = card;
        const cap = agent.daily_cost_cap_usd ?? 0;
        return (
          <Card key={agent.id} className={cn(!agent.enabled && 'opacity-75')}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <div className="min-w-0">
                <CardTitle className="truncate text-base">{agent.name}</CardTitle>
                <p className="text-muted-foreground text-sm">
                  {agent.domain || t('agents.registry.domainless')}
                </p>
              </div>
              <Switch
                checked={agent.enabled}
                disabled={busyId === agent.id}
                onCheckedChange={(checked) => toggleEnabled(card, checked)}
                aria-label={agent.enabled ? t('agents.registry.disable') : t('agents.registry.enable')}
              />
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('agents.registry.lastRun')}</span>
                {lastRun ? (
                  <span className="flex items-center gap-2">
                    <Badge className={cn('font-normal', STATUS_STYLES[lastRun.status] ?? '')}>
                      {t(`agents.status.${lastRun.status}`, lastRun.status)}
                    </Badge>
                    <span className="text-muted-foreground">
                      {dateTime.format(new Date(lastRun.started_at))}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t('agents.registry.neverRun')}</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('agents.registry.todaySpend')}</span>
                <span>
                  <span className={cn(todaySpendUsd >= cap && cap > 0 && 'text-destructive font-medium')}>
                    {currency.format(todaySpendUsd)}
                  </span>{' '}
                  <span className="text-muted-foreground">
                    {t('agents.registry.capOf', { cap: currency.format(cap) })}
                  </span>
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
