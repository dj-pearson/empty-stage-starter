import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  applyEdits,
  canBulkApprove,
  isTemplated,
  payloadString,
  type ApprovalLike,
} from '@/lib/approvalQueue';
import type { Json } from '@/integrations/supabase/types';
import { logAgentAudit } from '@/lib/agentAudit';
import { recordApprovalFeedback, payloadEditDistance } from '@/lib/agentFeedback';

interface ApprovalRow {
  id: string;
  action_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  expires_at: string | null;
  agent_id: string | null;
  run_id: string | null;
  agent_definitions: { name: string } | null;
}

interface ApprovalsTabProps {
  /** Called after any action changes the draft set, so the shell can refresh badges. */
  onChange?: () => void;
}

export function ApprovalsTab({ onChange }: ApprovalsTabProps) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<ApprovalRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const dateTime = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('agent_approvals')
        .select('id, action_type, payload, created_at, expires_at, agent_id, run_id, agent_definitions(name)')
        .eq('status', 'draft')
        .order('created_at', { ascending: false });
      if (!active) return;
      if (error) {
        console.error('approval queue load failed:', error);
        toast.error(t('agents.approvals.loadError'));
      } else {
        setRows((data ?? []) as unknown as ApprovalRow[]);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [t]);

  function setBusyFor(id: string, on: boolean) {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function editValue(row: ApprovalRow, field: string): string {
    const edited = edits[row.id]?.[field];
    if (edited !== undefined) return edited;
    const fromPayload = payloadString(row.payload, field);
    if (fromPayload) return fromPayload;
    // send_email drafts may store the body under `html` instead of `body`.
    return field === 'body' ? payloadString(row.payload, 'html') : '';
  }

  function setEdit(id: string, field: string, value: string) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    onChange?.();
  }

  async function persistEdits(row: ApprovalRow): Promise<Record<string, unknown>> {
    const merged = applyEdits(row.payload, edits[row.id] ?? {});
    if (edits[row.id]) {
      const { error } = await supabase
        .from('agent_approvals')
        .update({ payload: merged as Json })
        .eq('id', row.id);
      if (error) throw error;
    }
    return merged;
  }

  async function saveEdits(row: ApprovalRow) {
    setBusyFor(row.id, true);
    try {
      await persistEdits(row);
      toast.success(t('agents.approvals.savedToast'));
    } catch (err) {
      console.error(err);
      toast.error(t('agents.approvals.actionError'));
    } finally {
      setBusyFor(row.id, false);
    }
  }

  async function approve(row: ApprovalRow) {
    setBusyFor(row.id, true);
    try {
      const wasEdited = Boolean(edits[row.id]);
      const merged = await persistEdits(row);
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('agent_approvals')
        .update({
          payload: merged as Json,
          status: 'approved',
          reviewed_by: auth.user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (error) throw error;
      if (auth.user) {
        void logAgentAudit({
          actor: auth.user.id,
          action: 'approval_approved',
          subjectType: 'agent_approval',
          subjectId: row.id,
          detail: { action_type: row.action_type },
        });
      }
      // Feedback record (US-514): edited approvals carry the draft-vs-approved
      // edit distance so the self-eval agent can measure first-attempt quality.
      void recordApprovalFeedback({
        approvalId: row.id,
        runId: row.run_id,
        agentId: row.agent_id,
        actionType: row.action_type,
        decision: wasEdited ? 'edited' : 'approved',
        editDistance: wasEdited ? payloadEditDistance(row.payload, merged) : null,
        reviewedBy: auth.user?.id ?? null,
      });
      // Fire-and-forward to the executor; failure there keeps status 'approved'
      // for retry and does not put the row back in the draft queue.
      await invokeEdgeFunction('approval-executor', { body: { approval_id: row.id } });
      removeRow(row.id);
      toast.success(t('agents.approvals.approvedToast'));
    } catch (err) {
      console.error(err);
      toast.error(t('agents.approvals.actionError'));
    } finally {
      setBusyFor(row.id, false);
    }
  }

  async function confirmReject() {
    if (!rejecting) return;
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error(t('agents.approvals.reasonRequired'));
      return;
    }
    const row = rejecting;
    setBusyFor(row.id, true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('agent_approvals')
        .update({
          status: 'rejected',
          review_note: reason,
          reviewed_by: auth.user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (error) throw error;
      if (auth.user) {
        void logAgentAudit({
          actor: auth.user.id,
          action: 'approval_rejected',
          subjectType: 'agent_approval',
          subjectId: row.id,
          detail: { action_type: row.action_type, reason },
        });
      }
      // Feedback record (US-514): rejections carry the reviewer's reason so the
      // self-eval agent can surface the top rejection patterns per agent.
      void recordApprovalFeedback({
        approvalId: row.id,
        runId: row.run_id,
        agentId: row.agent_id,
        actionType: row.action_type,
        decision: 'rejected',
        rejectionReason: reason,
        reviewedBy: auth.user?.id ?? null,
      });
      removeRow(row.id);
      toast.success(t('agents.approvals.rejectedToast'));
      setRejecting(null);
      setRejectReason('');
    } catch (err) {
      console.error(err);
      toast.error(t('agents.approvals.actionError'));
    } finally {
      setBusyFor(row.id, false);
    }
  }

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const bulkGate = canBulkApprove(selectedRows as ApprovalLike[]);

  async function bulkApprove() {
    if (!bulkGate.ok) return;
    const toApprove = [...selectedRows];
    for (const row of toApprove) {
      // eslint-disable-next-line no-await-in-loop -- sequential to keep DB + executor ordering simple
      await approve(row);
    }
    toast.success(t('agents.approvals.bulkApprovedToast', { count: toApprove.length }));
  }

  function toggleSelected(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="text-muted-foreground py-12 text-center">{t('agents.approvals.empty')}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">{t('agents.approvals.bulkHint')}</p>
        <Button size="sm" disabled={!bulkGate.ok} onClick={bulkApprove}>
          {t('agents.approvals.bulkApprove', { count: selectedRows.length })}
        </Button>
      </div>

      {rows.map((row) => {
        const isBusy = busy.has(row.id);
        const templated = isTemplated(row.payload);
        return (
          <Card key={row.id}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selected.has(row.id)}
                  onCheckedChange={(c) => toggleSelected(row.id, c === true)}
                  aria-label={t('agents.approvals.selectForBulk')}
                  disabled={!templated}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{row.agent_definitions?.name ?? '—'}</span>
                    <Badge variant="outline">{row.action_type}</Badge>
                    {templated && <Badge variant="secondary">{t('agents.approvals.templated')}</Badge>}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {t('agents.approvals.created')}: {dateTime.format(new Date(row.created_at))}
                    {' · '}
                    {row.expires_at
                      ? `${t('agents.approvals.expires')}: ${dateTime.format(new Date(row.expires_at))}`
                      : t('agents.approvals.noExpiry')}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <ApprovalPreview row={row} editValue={editValue} setEdit={setEdit} />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => saveEdits(row)}>
                  {t('agents.approvals.save')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => {
                    setRejecting(row);
                    setRejectReason('');
                  }}
                >
                  {t('agents.approvals.reject')}
                </Button>
                <Button size="sm" disabled={isBusy} onClick={() => approve(row)}>
                  {t('agents.approvals.approve')}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={rejecting !== null} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('agents.approvals.rejectTitle')}</DialogTitle>
            <DialogDescription>{t('agents.approvals.rejectBody')}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={t('agents.approvals.rejectReasonPlaceholder')}
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmReject}>
              {t('agents.approvals.rejectConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface PreviewProps {
  row: ApprovalRow;
  editValue: (row: ApprovalRow, field: string) => string;
  setEdit: (id: string, field: string, value: string) => void;
}

/** Per-action-type editable preview. */
function ApprovalPreview({ row, editValue, setEdit }: PreviewProps) {
  const { t } = useTranslation();

  if (row.action_type === 'send_email') {
    return (
      <div className="space-y-2">
        <label className="text-muted-foreground text-xs font-medium">
          {t('agents.approvals.fields.subject')}
        </label>
        <Input
          value={editValue(row, 'subject')}
          onChange={(e) => setEdit(row.id, 'subject', e.target.value)}
        />
        <label className="text-muted-foreground text-xs font-medium">
          {t('agents.approvals.fields.body')}
        </label>
        <Textarea
          value={editValue(row, 'body')}
          onChange={(e) => setEdit(row.id, 'body', e.target.value)}
          rows={6}
        />
      </div>
    );
  }

  if (row.action_type === 'social_webhook') {
    const imageUrl = payloadString(row.payload, 'image_url');
    return (
      <div className="space-y-2">
        <label className="text-muted-foreground text-xs font-medium">
          {t('agents.approvals.fields.caption')}
        </label>
        <Textarea
          value={editValue(row, 'caption')}
          onChange={(e) => setEdit(row.id, 'caption', e.target.value)}
          rows={4}
        />
        {imageUrl && (
          <img
            src={imageUrl}
            alt={t('agents.approvals.imageAlt')}
            className="max-h-64 w-auto rounded-md border"
            loading="lazy"
          />
        )}
      </div>
    );
  }

  if (row.action_type === 'github_issue') {
    return (
      <div className="space-y-2">
        <label className="text-muted-foreground text-xs font-medium">
          {t('agents.approvals.fields.title')}
        </label>
        <Input
          value={editValue(row, 'title')}
          onChange={(e) => setEdit(row.id, 'title', e.target.value)}
        />
        <label className="text-muted-foreground text-xs font-medium">
          {t('agents.approvals.fields.body')}
        </label>
        <Textarea
          value={editValue(row, 'body')}
          onChange={(e) => setEdit(row.id, 'body', e.target.value)}
          rows={8}
          className="font-mono text-sm"
        />
      </div>
    );
  }

  // Unknown action type: read-only JSON.
  return (
    <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
      {JSON.stringify(row.payload, null, 2)}
    </pre>
  );
}
