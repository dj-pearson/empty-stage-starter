import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  sortEscalations,
  flattenContext,
  distinctDomains,
  type EscalationLike,
} from '@/lib/escalationQueue';
import { logAgentAudit } from '@/lib/agentAudit';

interface EscalationRow extends EscalationLike {
  agent_id: string | null;
  assigned_to: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
}

type StatusFilter = 'open' | 'acknowledged' | 'resolved' | 'all';

interface EscalationsTabProps {
  onChange?: () => void;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-destructive text-destructive-foreground',
  high: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  medium: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  low: 'bg-muted text-muted-foreground',
};

export function EscalationsTab({ onChange }: EscalationsTabProps) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<EscalationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState<EscalationRow | null>(null);
  const [resolveNote, setResolveNote] = useState('');

  const dateTime = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      let query = supabase
        .from('agent_escalations')
        .select(
          'id, tier, severity, domain, title, context, status, created_at, agent_id, assigned_to, resolution_note, resolved_at',
        );
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      const { data, error } = await query;
      if (!active) return;
      if (error) {
        console.error('escalation queue load failed:', error);
        toast.error(t('agents.escalations.loadError'));
      } else {
        setRows((data ?? []) as EscalationRow[]);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [statusFilter, t]);

  const domains = useMemo(() => distinctDomains(rows), [rows]);

  const visible = useMemo(() => {
    const filtered =
      domainFilter === 'all' ? rows : rows.filter((r) => r.domain === domainFilter);
    return sortEscalations(filtered);
  }, [rows, domainFilter]);

  function setBusyFor(id: string, on: boolean) {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Remove a row from view when its new status no longer matches the filter. */
  function reconcile(id: string, newStatus: string) {
    setRows((prev) =>
      statusFilter === 'all' || statusFilter === newStatus
        ? prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
        : prev.filter((r) => r.id !== id),
    );
    onChange?.();
  }

  async function acknowledge(row: EscalationRow) {
    setBusyFor(row.id, true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('agent_escalations')
        .update({ status: 'acknowledged', assigned_to: auth.user?.id ?? null })
        .eq('id', row.id);
      if (error) throw error;
      if (auth.user) {
        void logAgentAudit({
          actor: auth.user.id,
          action: 'escalation_acknowledged',
          subjectType: 'agent_escalation',
          subjectId: row.id,
        });
      }
      reconcile(row.id, 'acknowledged');
      toast.success(t('agents.escalations.acknowledgedToast'));
    } catch (err) {
      console.error(err);
      toast.error(t('agents.escalations.actionError'));
    } finally {
      setBusyFor(row.id, false);
    }
  }

  async function confirmResolve() {
    if (!resolving) return;
    const note = resolveNote.trim();
    if (!note) {
      toast.error(t('agents.escalations.noteRequired'));
      return;
    }
    const row = resolving;
    setBusyFor(row.id, true);
    try {
      const { error } = await supabase
        .from('agent_escalations')
        .update({
          status: 'resolved',
          resolution_note: note,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (error) throw error;
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        void logAgentAudit({
          actor: auth.user.id,
          action: 'escalation_resolved',
          subjectType: 'agent_escalation',
          subjectId: row.id,
          detail: { note },
        });
      }
      reconcile(row.id, 'resolved');
      toast.success(t('agents.escalations.resolvedToast'));
      setResolving(null);
      setResolveNote('');
    } catch (err) {
      console.error(err);
      toast.error(t('agents.escalations.actionError'));
    } finally {
      setBusyFor(row.id, false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t('agents.escalations.filters.status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('agents.escalations.filters.allStatuses')}</SelectItem>
            <SelectItem value="open">{t('agents.escalations.filters.open')}</SelectItem>
            <SelectItem value="acknowledged">{t('agents.escalations.filters.acknowledged')}</SelectItem>
            <SelectItem value="resolved">{t('agents.escalations.filters.resolved')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={domainFilter} onValueChange={setDomainFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t('agents.escalations.filters.domain')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('agents.escalations.filters.allDomains')}</SelectItem>
            {domains.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center">{t('agents.escalations.empty')}</p>
      ) : (
        visible.map((row) => {
          const isTier3 = row.tier >= 3;
          const isBusy = busy.has(row.id);
          const isOpen = expanded.has(row.id);
          const pairs = flattenContext(row.context);
          return (
            <Card
              key={row.id}
              className={cn(isTier3 && 'border-destructive bg-destructive/5')}
            >
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={isTier3 ? 'destructive' : 'secondary'}>
                      {t('agents.escalations.tier', { tier: row.tier })}
                    </Badge>
                    <Badge className={cn('font-normal', SEVERITY_STYLES[row.severity] ?? '')}>
                      {t(`agents.escalations.severity.${row.severity}`, row.severity)}
                    </Badge>
                    {row.domain && <Badge variant="outline">{row.domain}</Badge>}
                    <Badge variant="outline">{row.status}</Badge>
                  </div>
                  <p className="mt-1 font-medium">{row.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {t('agents.escalations.created')}: {dateTime.format(new Date(row.created_at))}
                    {row.assigned_to ? ` · ${t('agents.escalations.assigned')}` : ''}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {pairs.length > 0 && (
                  <div>
                    <Button variant="link" size="sm" className="h-auto p-0" onClick={() => toggleExpanded(row.id)}>
                      {isOpen ? t('agents.escalations.hideDetail') : t('agents.escalations.showDetail')}
                    </Button>
                    {isOpen && (
                      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                        {pairs.map((p) => (
                          <div key={p.key} className="flex gap-2 text-sm">
                            <dt className="text-muted-foreground shrink-0">{p.key}:</dt>
                            <dd className="min-w-0 break-words">{p.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                )}
                {row.status === 'resolved' && row.resolution_note && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">{t('agents.escalations.resolvedNote')}:</span>{' '}
                    {row.resolution_note}
                  </p>
                )}
                {row.status !== 'resolved' && (
                  <div className="flex flex-wrap justify-end gap-2">
                    {row.status === 'open' && (
                      <Button variant="outline" size="sm" disabled={isBusy} onClick={() => acknowledge(row)}>
                        {t('agents.escalations.acknowledge')}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      disabled={isBusy}
                      onClick={() => {
                        setResolving(row);
                        setResolveNote('');
                      }}
                    >
                      {t('agents.escalations.resolve')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      <Dialog open={resolving !== null} onOpenChange={(open) => !open && setResolving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('agents.escalations.resolveTitle')}</DialogTitle>
            <DialogDescription>{t('agents.escalations.resolveBody')}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
            placeholder={t('agents.escalations.resolveNotePlaceholder')}
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResolving(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={confirmResolve}>{t('agents.escalations.resolveConfirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
