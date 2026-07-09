import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { Database } from '@/integrations/supabase/types';

type AgentDefinition = Database['public']['Tables']['agent_definitions']['Row'];

interface AgentStats {
  lastRunStatus: string | null;
  lastRunAt: string | null;
  todaySpendUsd: number;
}

const usd = new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' });

function startOfUtcDayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function statusVariant(status: string | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'succeeded':
      return 'default';
    case 'failed':
      return 'destructive';
    case 'running':
      return 'secondary';
    default:
      return 'outline';
  }
}

export function AgentRegistry() {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [stats, setStats] = useState<Record<string, AgentStats>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: defs, error } = await supabase
        .from('agent_definitions')
        .select('*')
        .order('domain', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      setAgents(defs ?? []);

      // One pass over recent runs → last run + today's spend per agent.
      const { data: runs } = await supabase
        .from('agent_runs')
        .select('agent_id, status, started_at, cost_usd')
        .order('started_at', { ascending: false })
        .limit(500);

      const dayStart = startOfUtcDayIso();
      const next: Record<string, AgentStats> = {};
      for (const run of runs ?? []) {
        const id = run.agent_id;
        if (!next[id]) {
          next[id] = { lastRunStatus: run.status, lastRunAt: run.started_at, todaySpendUsd: 0 };
        }
        if (run.started_at >= dayStart) {
          next[id].todaySpendUsd += Number(run.cost_usd) || 0;
        }
      }
      setStats(next);
    } catch {
      toast.error(t('agents.registry.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleEnabled = useCallback(
    async (agent: AgentDefinition, next: boolean) => {
      // Optimistic update, rolled back on failure.
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, enabled: next } : a)));
      const { error } = await supabase
        .from('agent_definitions')
        .update({ enabled: next })
        .eq('id', agent.id);
      if (error) {
        setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, enabled: !next } : a)));
        toast.error(t('agents.registry.toggleError'));
        return;
      }
      toast.success(next ? t('agents.registry.toggleOn') : t('agents.registry.toggleOff'));
    },
    [t],
  );

  const sortedAgents = useMemo(() => agents, [agents]);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (sortedAgents.length === 0) {
    return <p className="text-muted-foreground py-8 text-center">{t('agents.registry.empty')}</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sortedAgents.map((agent) => {
        const s = stats[agent.id];
        const cap = agent.daily_cost_cap_usd;
        const spend = s?.todaySpendUsd ?? 0;
        const overCap = cap != null && cap >= 0 && spend >= cap;
        return (
          <Card key={agent.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <div className="min-w-0">
                <CardTitle className="truncate text-base">{agent.name}</CardTitle>
                {agent.domain && (
                  <Badge variant="outline" className="mt-1">
                    {agent.domain}
                  </Badge>
                )}
              </div>
              <Switch
                checked={agent.enabled}
                onCheckedChange={(v) => void toggleEnabled(agent, v)}
                aria-label={agent.enabled ? t('agents.registry.enabled') : t('agents.registry.disabled')}
              />
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('agents.registry.lastRun')}</span>
                {s?.lastRunStatus ? (
                  <span className="flex items-center gap-2">
                    <Badge variant={statusVariant(s.lastRunStatus)}>{s.lastRunStatus}</Badge>
                    <span className="text-muted-foreground">
                      {s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : ''}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t('agents.registry.neverRun')}</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('agents.registry.todaySpend')}</span>
                <span className={overCap ? 'font-medium text-destructive' : ''}>
                  {usd.format(spend)}
                  {' / '}
                  {cap != null ? usd.format(cap) : t('agents.registry.noCap')}
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
