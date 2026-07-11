import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { actorKind, auditRowsToCsv, type AuditRow } from '@/lib/auditLog';
import { downloadCsv } from '@/lib/csvExport';
import { pageRange, pageCount, RUNS_PAGE_SIZE } from '@/lib/runsDashboard';

const SUBJECT_TYPES = ['agent_approval', 'agent_escalation', 'agent_definition', 'agent_system_settings'];

export function AuditTab() {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const [actorFilter, setActorFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const dateTime = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'medium' }),
    [i18n.language],
  );

  // Debounce the free-text filters so each keystroke does not hit the DB.
  const [debouncedActor, setDebouncedActor] = useState('');
  const [debouncedAction, setDebouncedAction] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedActor(actorFilter.trim()), 300);
    return () => clearTimeout(id);
  }, [actorFilter]);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedAction(actionFilter.trim()), 300);
    return () => clearTimeout(id);
  }, [actionFilter]);

  function buildQuery(forExport: boolean) {
    let query = supabase
      .from('agent_audit_log')
      .select('id, actor, action, subject_type, subject_id, detail, created_at', {
        count: forExport ? undefined : 'exact',
      })
      .order('created_at', { ascending: false });
    if (debouncedActor) query = query.ilike('actor', `%${debouncedActor}%`);
    if (debouncedAction) query = query.ilike('action', `%${debouncedAction}%`);
    if (subjectFilter !== 'all') query = query.eq('subject_type', subjectFilter);
    if (fromDate) query = query.gte('created_at', new Date(fromDate).toISOString());
    if (toDate) {
      const end = new Date(toDate);
      end.setUTCHours(23, 59, 59, 999);
      query = query.lte('created_at', end.toISOString());
    }
    return query;
  }

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { from, to } = pageRange(page);
      const { data, error, count } = await buildQuery(false).range(from, to);
      if (!active) return;
      if (error) {
        console.error('audit log load failed:', error);
        toast.error(t('agents.audit.loadError'));
      } else {
        setRows((data ?? []) as AuditRow[]);
        setTotal(count ?? 0);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedActor, debouncedAction, subjectFilter, fromDate, toDate]);

  const totalPages = pageCount(total);

  function resetToFirstPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(0);
    };
  }

  function clearFilters() {
    setActorFilter('');
    setActionFilter('');
    setSubjectFilter('all');
    setFromDate('');
    setToDate('');
    setPage(0);
  }

  async function exportCsv() {
    // Export the current filtered view (bounded to a sane cap, newest first).
    const { data, error } = await buildQuery(true).range(0, 4999);
    if (error) {
      toast.error(t('agents.audit.loadError'));
      return;
    }
    const exportRows = (data ?? []) as AuditRow[];
    if (exportRows.length === 0) {
      toast.error(t('agents.audit.exportEmpty'));
      return;
    }
    downloadCsv(`agent-audit-${new Date().toISOString().slice(0, 10)}.csv`, auditRowsToCsv(exportRows));
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs">{t('agents.audit.filters.actor')}</label>
          <Input
            value={actorFilter}
            onChange={(e) => resetToFirstPage(setActorFilter)(e.target.value)}
            placeholder={t('agents.audit.filters.actorPlaceholder')}
            className="w-44"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs">{t('agents.audit.filters.action')}</label>
          <Input
            value={actionFilter}
            onChange={(e) => resetToFirstPage(setActionFilter)(e.target.value)}
            placeholder={t('agents.audit.filters.actionPlaceholder')}
            className="w-44"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs">{t('agents.audit.filters.subjectType')}</label>
          <Select value={subjectFilter} onValueChange={resetToFirstPage(setSubjectFilter)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('agents.audit.filters.allSubjects')}</SelectItem>
              {SUBJECT_TYPES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs">{t('agents.audit.filters.from')}</label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => resetToFirstPage(setFromDate)(e.target.value)}
            className="w-36"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs">{t('agents.audit.filters.to')}</label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => resetToFirstPage(setToDate)(e.target.value)}
            className="w-36"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          {t('agents.audit.filters.clear')}
        </Button>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          {t('agents.audit.export')}
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center">{t('agents.audit.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('agents.audit.table.time')}</TableHead>
                <TableHead>{t('agents.audit.table.actor')}</TableHead>
                <TableHead>{t('agents.audit.table.action')}</TableHead>
                <TableHead>{t('agents.audit.table.subject')}</TableHead>
                <TableHead>{t('agents.audit.table.detail')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const human = actorKind(r.actor) === 'human';
                return (
                  <TableRow key={r.id} className={cn(human && 'bg-primary/5')}>
                    <TableCell className="whitespace-nowrap">
                      {dateTime.format(new Date(r.created_at))}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={human ? 'default' : 'secondary'}>
                          {human ? t('agents.audit.human') : t('agents.audit.agent')}
                        </Badge>
                        <span className="text-muted-foreground max-w-[12rem] truncate text-xs" title={r.actor}>
                          {r.actor}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{r.action}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {r.subject_type ?? '—'}
                    </TableCell>
                    <TableCell className="max-w-[20rem]">
                      <code className="text-muted-foreground block truncate text-xs" title={JSON.stringify(r.detail)}>
                        {r.detail ? JSON.stringify(r.detail) : '—'}
                      </code>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {total > RUNS_PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>
            {t('agents.audit.pagination.prev')}
          </Button>
          <span className="text-muted-foreground text-sm">
            {t('agents.audit.pagination.page', { page: page + 1, total: totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('agents.audit.pagination.next')}
          </Button>
        </div>
      )}
    </div>
  );
}
