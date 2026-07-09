import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { AgentRegistry } from './AgentRegistry';

/** Placeholder tab body filled in by US-484..US-487. */
function ComingSoon() {
  const { t } = useTranslation();
  return <p className="text-muted-foreground py-12 text-center">{t('agents.comingSoon')}</p>;
}

export function AgentCommandCenter() {
  const { t } = useTranslation();
  const [globalPause, setGlobalPause] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [openEscalations, setOpenEscalations] = useState(0);

  const loadHeader = useCallback(async () => {
    const [{ data: settings }, { count: approvals }, { count: escalations }] = await Promise.all([
      supabase.from('agent_system_settings').select('global_pause').limit(1).maybeSingle(),
      supabase
        .from('agent_approvals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'draft'),
      supabase
        .from('agent_escalations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),
    ]);
    setGlobalPause(Boolean(settings?.global_pause));
    setPendingApprovals(approvals ?? 0);
    setOpenEscalations(escalations ?? 0);
  }, []);

  useEffect(() => {
    void loadHeader();
  }, [loadHeader]);

  const setPause = useCallback(
    async (next: boolean) => {
      setGlobalPause(next); // optimistic
      const { error } = await supabase
        .from('agent_system_settings')
        .update({ global_pause: next })
        .eq('id', 1);
      if (error) {
        setGlobalPause(!next);
        toast.error(t('agents.killSwitch.error'));
        return;
      }
      toast.success(next ? t('agents.killSwitch.paused') : t('agents.killSwitch.resumed'));
    },
    [t],
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{t('agents.title')}</h1>
          {pendingApprovals > 0 && (
            <Badge variant="secondary">
              {t('agents.badges.pendingApprovals', { count: pendingApprovals })}
            </Badge>
          )}
          {openEscalations > 0 && (
            <Badge variant="destructive">
              {t('agents.badges.openEscalations', { count: openEscalations })}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground">{t('agents.subtitle')}</p>
      </header>

      <KillSwitchBanner paused={globalPause} onSetPause={setPause} />

      <Tabs defaultValue="agents">
        <TabsList>
          <TabsTrigger value="agents">{t('agents.tabs.agents')}</TabsTrigger>
          <TabsTrigger value="approvals">{t('agents.tabs.approvals')}</TabsTrigger>
          <TabsTrigger value="escalations">{t('agents.tabs.escalations')}</TabsTrigger>
          <TabsTrigger value="runs">{t('agents.tabs.runs')}</TabsTrigger>
          <TabsTrigger value="audit">{t('agents.tabs.audit')}</TabsTrigger>
        </TabsList>
        <TabsContent value="agents" className="mt-4">
          <AgentRegistry />
        </TabsContent>
        <TabsContent value="approvals" className="mt-4">
          <ComingSoon />
        </TabsContent>
        <TabsContent value="escalations" className="mt-4">
          <ComingSoon />
        </TabsContent>
        <TabsContent value="runs" className="mt-4">
          <ComingSoon />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <ComingSoon />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KillSwitchBanner({
  paused,
  onSetPause,
}: {
  paused: boolean;
  onSetPause: (next: boolean) => void | Promise<void>;
}) {
  const { t } = useTranslation();

  if (paused) {
    return (
      <Card className="border-destructive bg-destructive/10">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className="text-destructive h-5 w-5 shrink-0" />
            <div>
              <p className="text-destructive font-semibold">{t('agents.killSwitch.activeTitle')}</p>
              <p className="text-muted-foreground text-sm">{t('agents.killSwitch.activeBody')}</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => void onSetPause(false)}>
            {t('agents.killSwitch.resume')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="text-muted-foreground h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">{t('agents.killSwitch.idleTitle')}</p>
            <p className="text-muted-foreground text-sm">{t('agents.killSwitch.idleBody')}</p>
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">{t('agents.killSwitch.pause')}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('agents.killSwitch.confirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('agents.killSwitch.confirmBody')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => void onSetPause(true)}>
                {t('agents.killSwitch.confirmPause')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
