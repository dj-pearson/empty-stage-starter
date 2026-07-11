import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { cn } from '@/lib/utils';
import {
  buildDailySpendSeries,
  capUtilization,
  formatDuration,
  pageRange,
  pageCount,
  utcDayKey,
  RUNS_PAGE_SIZE,
  type RunForChart,
} from '@/lib/runsDashboard';
import type { Database } from '@/integrations/supabase/types';

type AgentRunRow = Database['public']['Tables']['agent_runs']['Row'] & {
  agent_definitions: { name: string } | null;
};

interface AgentMeta {
  id: string;
  name: string;
  cap: number;
}

const STATUS_STYLES: Record<string, string> = {
  running: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  succeeded: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  failed: 'bg-destructive/15 text-destructive',
  skipped: 'bg-muted text-muted-foreground',
};

const CHART_COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#8b5cf6'];
const CHART_DAYS = 14;

export function RunsTab() {
  const { t, i18n } = useTranslation();
  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [chartRuns, setChartRuns] = useState<RunForChart[]>([]);
  const [rows, setRows] = useState<AgentRunRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AgentRunRow | null>(null);

  const [agentFilter, setAgentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const currency = useMemo(
    () => new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }),
    [i18n.language],
  );
  const dateTime = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }),
    [i18n.language],
  );

  // Agents + 14-day runs (for the chart + today's cap utilization). Loaded once.
  useEffect(() => {
    let active = true;
    (async () => {
      const since = new Date(Date.now() - CHART_DAYS * 86_400_000).toISOString();
      const [{ data: defs }, { data: recent }] = await Promise.all([
        supabase.from('agent_definitions').select('id, name, daily_cost_cap_usd').order('name'),
        supabase
          .from('agent_runs')
          .select('agent_id, cost_usd, started_at')
          .gte('started_at', since)
          .order('started_at', { ascending: false }),
      ]);
      if (!active) return;
      setAgents(
        (defs ?? []).map((d) => ({ id: d.id, name: d.name, cap: d.daily_cost_cap_usd ?? 0 })),
      );
      setChartRuns((recent ?? []) as RunForChart[]);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Paginated list, re-queried on filters/page.
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { from, to } = pageRange(page);
      let query = supabase
        .from('agent_runs')
        .select('*, agent_definitions(name)', { count: 'exact' })
        .order('started_at', { ascending: false })
        .range(from, to);
      if (agentFilter !== 'all') query = query.eq('agent_id', agentFilter);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (fromDate) query = query.gte('started_at', new Date(fromDate).toISOString());
      if (toDate) {
        const end = new Date(toDate);
        end.setUTCHours(23, 59, 59, 999);
        query = query.lte('started_at', end.toISOString());
      }
      const { data, error, count } = await query;
      if (!active) return;
      if (error) {
        console.error('runs load failed:', error);
      } else {
        setRows((data ?? []) as unknown as AgentRunRow[]);
        setTotal(count ?? 0);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [page, agentFilter, statusFilter, fromDate, toDate]);

  const agentNameById = useMemo(() => new Map(agents.map((a) => [a.id, a.name])), [agents]);
  const spend = useMemo(
    () => buildDailySpendSeries(chartRuns, agentNameById, CHART_DAYS, new Date()),
    [chartRuns, agentNameById],
  );

  const todaySpendByAgent = useMemo(() => {
    const today = utcDayKey(new Date());
    const map = new Map<string, number>();
    for (const r of chartRuns) {
      if (!r.agent_id) continue;
      if (utcDayKey(r.started_at) !== today) continue;
      map.set(r.agent_id, (map.get(r.agent_id) ?? 0) + (r.cost_usd ?? 0));
    }
    return map;
  }, [chartRuns]);

  const totalPages = pageCount(total);

  function resetToFirstPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(0);
    };
  }

  function clearFilters() {
    setAgentFilter('all');
    setStatusFilter('all');
    setFromDate('');
    setToDate('');
    setPage(0);
  }

  return (
    <div className="space-y-6">
      {/* Cost panel */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t('agents.runs.costTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {spend.agents.length === 0 ? (
              <p className="text-muted-foreground py-10 text-center text-sm">
                {t('agents.runs.costEmpty')}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={spend.data}>
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} width={40} />
                  <Tooltip
                    formatter={(value: number) => currency.format(value)}
                    contentStyle={{ fontSize: 12 }}
                  />
                  {spend.agents.map((name, i) => (
                    <Bar
                      key={name}
                      dataKey={name}
                      stackId="spend"
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('agents.runs.capUtilTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {agents.map((a) => {
              const spent = todaySpendByAgent.get(a.id) ?? 0;
              const util = capUtilization(spent, a.cap);
              return (
                <div key={a.id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="truncate">{a.name}</span>
                    <span className={cn('text-muted-foreground', util >= 100 && 'text-destructive font-medium')}>
                      {currency.format(spent)} / {currency.format(a.cap)}
                    </span>
                  </div>
                  <Progress value={Math.min(100, util)} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <Select value={agentFilter} onValueChange={resetToFirstPage(setAgentFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('agents.runs.filters.agent')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('agents.runs.filters.allAgents')}</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={resetToFirstPage(setStatusFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('agents.runs.filters.status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('agents.runs.filters.allStatuses')}</SelectItem>
            <SelectItem value="running">{t('agents.status.running')}</SelectItem>
            <SelectItem value="succeeded">{t('agents.status.succeeded')}</SelectItem>
            <SelectItem value="failed">{t('agents.status.failed')}</SelectItem>
            <SelectItem value="skipped">{t('agents.status.skipped')}</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs">{t('agents.runs.filters.from')}</label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => resetToFirstPage(setFromDate)(e.target.value)}
            className="w-36"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs">{t('agents.runs.filters.to')}</label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => resetToFirstPage(setToDate)(e.target.value)}
            className="w-36"
          />
        </div>

        <Button
          variant={statusFilter === 'failed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => resetToFirstPage(setStatusFilter)('failed')}
        >
          {t('agents.runs.filters.showFailed')}
        </Button>
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          {t('agents.runs.filters.clear')}
        </Button>
      </div>

      {/* Runs table */}
      {loading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center">{t('agents.runs.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('agents.runs.table.agent')}</TableHead>
                <TableHead>{t('agents.runs.table.status')}</TableHead>
                <TableHead>{t('agents.runs.table.trigger')}</TableHead>
                <TableHead>{t('agents.runs.table.started')}</TableHead>
                <TableHead>{t('agents.runs.table.duration')}</TableHead>
                <TableHead className="text-right">{t('agents.runs.table.cost')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className={cn(r.status === 'failed' && 'bg-destructive/5')}>
                  <TableCell className="font-medium">{r.agent_definitions?.name ?? '—'}</TableCell>
                  <TableCell>
                    <Badge className={cn('font-normal', STATUS_STYLES[r.status] ?? '')}>
                      {t(`agents.status.${r.status}`, r.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.trigger ?? '—'}</TableCell>
                  <TableCell>{dateTime.format(new Date(r.started_at))}</TableCell>
                  <TableCell>{formatDuration(r.started_at, r.finished_at)}</TableCell>
                  <TableCell className="text-right">{currency.format(r.cost_usd ?? 0)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => setSelected(r)}>
                      {t('agents.runs.table.view')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {total > RUNS_PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>
            {t('agents.runs.pagination.prev')}
          </Button>
          <span className="text-muted-foreground text-sm">
            {t('agents.runs.pagination.page', { page: page + 1, total: totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('agents.runs.pagination.next')}
          </Button>
        </div>
      )}

      {/* Detail drawer */}
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t('agents.runs.detail.title')}</SheetTitle>
            <SheetDescription>{selected?.agent_definitions?.name ?? ''}</SheetDescription>
          </SheetHeader>
          {selected && <RunDetail run={selected} currency={currency} dateTime={dateTime} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

interface RunDetailProps {
  run: AgentRunRow;
  currency: Intl.NumberFormat;
  dateTime: Intl.DateTimeFormat;
}

function RunDetail({ run, currency, dateTime }: RunDetailProps) {
  const { t } = useTranslation();
  const row = (label: string, value: ReactNode) => (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="min-w-0 break-words text-right">{value}</span>
    </div>
  );
  const block = (label: string, value: unknown) =>
    value ? (
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
          {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
        </pre>
      </div>
    ) : null;

  return (
    <div className="mt-4 space-y-4">
      <div className="divide-y">
        {row(t('agents.runs.detail.status'), t(`agents.status.${run.status}`, run.status))}
        {row(t('agents.runs.detail.trigger'), run.trigger ?? t('agents.runs.detail.none'))}
        {row(t('agents.runs.detail.started'), dateTime.format(new Date(run.started_at)))}
        {row(
          t('agents.runs.detail.finished'),
          run.finished_at ? dateTime.format(new Date(run.finished_at)) : t('agents.runs.detail.none'),
        )}
        {row(t('agents.runs.detail.duration'), formatDuration(run.started_at, run.finished_at))}
        {row(t('agents.runs.detail.tokens'), `${run.tokens_in ?? 0} / ${run.tokens_out ?? 0}`)}
        {row(t('agents.runs.detail.cost'), currency.format(run.cost_usd ?? 0))}
      </div>
      {block(t('agents.runs.detail.input'), run.input)}
      {block(t('agents.runs.detail.output'), run.output)}
      {run.error && block(t('agents.runs.detail.error'), run.error)}
    </div>
  );
}
