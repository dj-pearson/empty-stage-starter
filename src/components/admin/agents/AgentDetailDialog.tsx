import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { logAgentAudit } from '@/lib/agentAudit';
import {
  isValidCron,
  validateCap,
  getAllowlist,
  toggleAllowlist,
  KNOWN_ACTION_TYPES,
  AGENT_MODELS,
} from '@/lib/agentConfig';
import type { Database, Json } from '@/integrations/supabase/types';

type AgentDefinition = Database['public']['Tables']['agent_definitions']['Row'];
type PromptVersion = Database['public']['Tables']['agent_prompt_versions']['Row'];

interface AgentDetailDialogProps {
  agent: AgentDefinition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful save so the registry can refresh. */
  onSaved?: (updated: AgentDefinition) => void;
}

/**
 * Agent detail / config editor (US-515). Edits system_prompt (with version
 * history + rollback), schedule_cron, daily_cost_cap_usd, autonomy_policy
 * auto-approve allowlist, and model. Cron/cap are validated inline; every save
 * writes a prompt version (when the prompt changed) and an audit entry with
 * before/after values.
 */
export function AgentDetailDialog({ agent, open, onOpenChange, onSaved }: AgentDetailDialogProps) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [cron, setCron] = useState('');
  const [cap, setCap] = useState('');
  const [model, setModel] = useState<string>(AGENT_MODELS[0]);
  const [policy, setPolicy] = useState<Record<string, unknown>>({});
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [saving, setSaving] = useState(false);

  // Hydrate editor state whenever a new agent is opened.
  useEffect(() => {
    if (!agent) return;
    setPrompt(agent.system_prompt ?? '');
    setCron(agent.schedule_cron ?? '');
    setCap(String(agent.daily_cost_cap_usd ?? 0));
    setModel(agent.model);
    setPolicy((agent.autonomy_policy as Record<string, unknown>) ?? {});
  }, [agent]);

  useEffect(() => {
    if (!agent || !open) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('agent_prompt_versions')
        .select('*')
        .eq('agent_id', agent.id)
        .order('version', { ascending: false });
      if (active) setVersions((data ?? []) as PromptVersion[]);
    })();
    return () => {
      active = false;
    };
  }, [agent, open]);

  const cronValid = cron.trim() === '' || isValidCron(cron);
  const capResult = validateCap(cap);
  const allowlist = useMemo(() => new Set(getAllowlist(policy)), [policy]);
  const canSave = cronValid && capResult.ok && !saving;

  function toggleAction(actionType: string, on: boolean) {
    setPolicy((prev) => toggleAllowlist(prev, actionType, on));
  }

  async function persist(nextPrompt: string) {
    if (!agent) return;
    if (!cronValid || !capResult.ok) return;
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const actor = auth.user?.id ?? null;
      const before = {
        system_prompt: agent.system_prompt,
        schedule_cron: agent.schedule_cron,
        daily_cost_cap_usd: agent.daily_cost_cap_usd,
        model: agent.model,
        autonomy_policy: agent.autonomy_policy,
      };
      const nextCron = cron.trim() === '' ? null : cron.trim();
      const after = {
        system_prompt: nextPrompt,
        schedule_cron: nextCron,
        daily_cost_cap_usd: capResult.value ?? 0,
        model,
        autonomy_policy: policy as Json,
      };

      // A changed prompt gets a new immutable version row first.
      const promptChanged = (agent.system_prompt ?? '') !== nextPrompt;
      if (promptChanged) {
        const nextVersion = (versions[0]?.version ?? 0) + 1;
        const { error: vErr } = await supabase.from('agent_prompt_versions').insert({
          agent_id: agent.id,
          system_prompt: nextPrompt,
          version: nextVersion,
          created_by: actor,
        });
        if (vErr) throw vErr;
      }

      const { data: updated, error } = await supabase
        .from('agent_definitions')
        .update(after)
        .eq('id', agent.id)
        .select('*')
        .single();
      if (error) throw error;

      if (actor) {
        void logAgentAudit({
          actor,
          action: 'agent_config_updated',
          subjectType: 'agent_definition',
          subjectId: agent.id,
          detail: { before, after } as Json,
        });
      }

      // Refresh the version list if we just added one.
      if (promptChanged) {
        const { data } = await supabase
          .from('agent_prompt_versions')
          .select('*')
          .eq('agent_id', agent.id)
          .order('version', { ascending: false });
        setVersions((data ?? []) as PromptVersion[]);
      }

      toast.success(t('agents.detail.savedToast'));
      onSaved?.(updated as AgentDefinition);
    } catch (err) {
      console.error('agent config save failed:', err);
      toast.error(t('agents.detail.saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function rollback(v: PromptVersion) {
    setPrompt(v.system_prompt);
    // Restore = save the old text as a NEW version.
    await persist(v.system_prompt);
  }

  if (!agent) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{agent.name}</DialogTitle>
          <DialogDescription>{t('agents.detail.subtitle')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* System prompt */}
          <div className="space-y-2">
            <Label htmlFor="agent-prompt">{t('agents.detail.systemPrompt')}</Label>
            <Textarea
              id="agent-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              className="font-mono text-sm"
            />
          </div>

          {/* Schedule + cap */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="agent-cron">{t('agents.detail.scheduleCron')}</Label>
              <Input
                id="agent-cron"
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                placeholder="*/15 * * * *"
                aria-invalid={!cronValid}
              />
              {!cronValid && <p className="text-destructive text-xs">{t('agents.detail.invalidCron')}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-cap">{t('agents.detail.dailyCap')}</Label>
              <Input
                id="agent-cap"
                type="number"
                step="0.5"
                min="0"
                value={cap}
                onChange={(e) => setCap(e.target.value)}
                aria-invalid={!capResult.ok}
              />
              {!capResult.ok && <p className="text-destructive text-xs">{t('agents.detail.invalidCap')}</p>}
            </div>
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label htmlFor="agent-model">{t('agents.detail.model')}</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="agent-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGENT_MODELS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Auto-approve allowlist */}
          <div className="space-y-2">
            <Label>{t('agents.detail.autoApprove')}</Label>
            <p className="text-muted-foreground text-xs">{t('agents.detail.autoApproveHint')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {KNOWN_ACTION_TYPES.map((action) => (
                <label key={action} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={allowlist.has(action)}
                    onCheckedChange={(checked) => toggleAction(action, checked === true)}
                  />
                  <span className="font-mono">{action}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Version history */}
          <div className="space-y-2">
            <Label>{t('agents.detail.versionHistory')}</Label>
            {versions.length === 0 ? (
              <p className="text-muted-foreground text-xs">{t('agents.detail.noVersions')}</p>
            ) : (
              <ul className="divide-border divide-y rounded-md border">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">v{v.version}</span>{' '}
                      <span className="text-muted-foreground">{v.system_prompt.slice(0, 60)}…</span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={saving}
                      onClick={() => rollback(v)}
                    >
                      {t('agents.detail.rollback')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => persist(prompt)} disabled={!canSave}>
            {t('agents.detail.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
