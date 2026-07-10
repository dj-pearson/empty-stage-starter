import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { AgentRegistryTab } from '@/components/admin/agents/AgentRegistryTab';
import { ApprovalsTab } from '@/components/admin/agents/ApprovalsTab';
import { EscalationsTab } from '@/components/admin/agents/EscalationsTab';
import { RunsTab } from '@/components/admin/agents/RunsTab';

const TAB_KEYS = ['registry', 'approvals', 'escalations', 'runs', 'audit'] as const;
type TabKey = (typeof TAB_KEYS)[number];

/**
 * Admin Command Center shell + agent registry (US-483).
 *
 * Route: /admin/agents (ProtectedRoute requireAdmin). Hosts the global kill
 * switch, pending-work badges, and a tabbed shell. The registry tab is built
 * here; approvals/escalations/runs/audit tabs are filled by US-484..US-487.
 */
export default function AgentCommandCenter() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab');
  const activeTab: TabKey = (TAB_KEYS as readonly string[]).includes(tabParam ?? '')
    ? (tabParam as TabKey)
    : 'registry';

  const [globalPause, setGlobalPause] = useState<boolean | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [openEscalations, setOpenEscalations] = useState(0);
  const [openTier3, setOpenTier3] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [updatingPause, setUpdatingPause] = useState(false);

  const refreshCounts = useCallback(async () => {
    const [approvals, escalations, tier3] = await Promise.all([
      supabase.from('agent_approvals').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
      supabase.from('agent_escalations').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase
        .from('agent_escalations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open')
        .eq('tier', 3),
    ]);
    setPendingApprovals(approvals.count ?? 0);
    setOpenEscalations(escalations.count ?? 0);
    setOpenTier3(tier3.count ?? 0);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const settings = await supabase
        .from('agent_system_settings')
        .select('global_pause')
        .limit(1)
        .maybeSingle();
      if (!active) return;
      setGlobalPause(settings.data?.global_pause ?? false);
      await refreshCounts();
    })();
    return () => {
      active = false;
    };
  }, [refreshCounts]);

  function selectTab(tab: TabKey) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  }

  async function applyKillSwitch(next: boolean) {
    setUpdatingPause(true);
    const { error } = await supabase
      .from('agent_system_settings')
      .update({ global_pause: next })
      .not('id', 'is', null); // singleton row
    setUpdatingPause(false);
    setConfirmOpen(false);
    if (error) {
      toast.error(t('agents.killSwitch.error'));
      return;
    }
    setGlobalPause(next);
    toast.success(next ? t('agents.killSwitch.pausedToast') : t('agents.killSwitch.resumedToast'));
  }

  const paused = globalPause === true;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <Helmet>
        <title>{t('agents.metaTitle')}</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t('agents.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('agents.subtitle')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => selectTab('approvals')}>
            <Badge variant="secondary" className="cursor-pointer">
              {t('agents.badges.pendingApprovals', { count: pendingApprovals })}
            </Badge>
          </button>
          <button type="button" onClick={() => selectTab('escalations')}>
            <Badge
              variant={openEscalations > 0 ? 'destructive' : 'secondary'}
              className="cursor-pointer"
            >
              {t('agents.badges.openEscalations', { count: openEscalations })}
            </Badge>
          </button>
          {openTier3 > 0 && (
            <button type="button" onClick={() => selectTab('escalations')}>
              <Badge variant="destructive" className="cursor-pointer">
                {t('agents.escalations.openTier3Badge', { count: openTier3 })}
              </Badge>
            </button>
          )}
        </div>
      </header>

      {/* Global kill switch banner */}
      <Card
        className={cn(
          'mb-6 border',
          paused ? 'border-destructive bg-destructive/5' : 'border-border',
        )}
      >
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            {paused ? (
              <AlertTriangle className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
            ) : (
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            )}
            <div>
              <p className="font-medium">
                {paused ? t('agents.killSwitch.activeTitle') : t('agents.killSwitch.inactiveTitle')}
              </p>
              <p className="text-muted-foreground text-sm">
                {paused ? t('agents.killSwitch.activeBody') : t('agents.killSwitch.inactiveBody')}
              </p>
            </div>
          </div>
          <Button
            variant={paused ? 'default' : 'destructive'}
            disabled={globalPause === null || updatingPause}
            onClick={() => setConfirmOpen(true)}
            className="shrink-0"
          >
            {paused ? t('agents.killSwitch.resumeAll') : t('agents.killSwitch.pauseAll')}
          </Button>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(v) => selectTab(v as TabKey)}>
        <TabsList className="mb-4 flex flex-wrap">
          {TAB_KEYS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {t(`agents.tabs.${key}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="registry">
          <AgentRegistryTab />
        </TabsContent>
        <TabsContent value="approvals">
          <ApprovalsTab onChange={refreshCounts} />
        </TabsContent>
        <TabsContent value="escalations">
          <EscalationsTab onChange={refreshCounts} />
        </TabsContent>
        <TabsContent value="runs">
          <RunsTab />
        </TabsContent>
        {(['audit'] as const).map((key) => (
          <TabsContent key={key} value={key}>
            <p className="text-muted-foreground py-12 text-center">{t('agents.comingSoon')}</p>
          </TabsContent>
        ))}
      </Tabs>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {paused
                ? t('agents.killSwitch.confirmResumeTitle')
                : t('agents.killSwitch.confirmPauseTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {paused
                ? t('agents.killSwitch.confirmResumeBody')
                : t('agents.killSwitch.confirmPauseBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                applyKillSwitch(!paused);
              }}
            >
              {t('agents.killSwitch.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
