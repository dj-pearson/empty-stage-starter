/**
 * Clinician ladder report export (US-605).
 *
 * The attempt history is fetched only when a parent actually asks for a
 * summary — the board does not need it, and a range this wide is not
 * something to hold in memory on the off chance. Everything after the fetch
 * happens on the device: assemble, render, save. Nothing is uploaded.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { RUNG_META, type Rung } from '@/lib/exposureLadder';
import { buildClinicianLadderReport } from '@/lib/clinicianLadderReport';
import { renderClinicianLadderPdf } from '@/lib/clinicianLadderPdf';
import { downloadBlob } from '@/lib/reportGenerator';

interface LadderReportDialogProps {
  kidId: string;
  /** First name only — it is the single identifier the report carries. */
  kidFirstName: string;
  ladderRows: { foodId: string; currentRung: Rung; status: string }[];
  foodNameById: Map<string, string>;
}

const DEFAULT_RANGE_DAYS = 90;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export function LadderReportDialog({
  kidId,
  kidFirstName,
  ladderRows,
  foodNameById,
}: LadderReportDialogProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(() => isoDaysAgo(DEFAULT_RANGE_DAYS));
  const [to, setTo] = useState(() => isoDaysAgo(0));
  const [busy, setBusy] = useState(false);

  const handleGenerate = async () => {
    if (to < from) {
      toast.error(t('foodLadder.report.rangeInvalid'));
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase
        .from('food_attempts')
        .select('food_id, stage, outcome, attempted_at, preparation_method')
        .eq('kid_id', kidId)
        .gte('attempted_at', `${from}T00:00:00.000Z`)
        .lte('attempted_at', `${to}T23:59:59.999Z`);

      if (error) throw error;

      const report = buildClinicianLadderReport({
        kidFirstName,
        from,
        to,
        attempts: (data ?? []).map((row) => ({
          foodId: row.food_id,
          stage: row.stage,
          outcome: row.outcome,
          attemptedAt: row.attempted_at,
          preparationMethod: row.preparation_method,
        })),
        ladderRows,
        foodNames: Object.fromEntries(foodNameById),
      });

      if (report.rows.length === 0) {
        toast.info(t('foodLadder.report.empty'));
        return;
      }

      const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
      const percent = new Intl.NumberFormat(i18n.language, {
        style: 'percent',
        maximumFractionDigits: 0,
      });

      const blob = renderClinicianLadderPdf(report, {
        title: t('foodLadder.report.title'),
        rangeLabel: `${dateFormat.format(new Date(`${from}T12:00:00Z`))} – ${dateFormat.format(
          new Date(`${to}T12:00:00Z`)
        )}`,
        totalsLine: t('foodLadder.report.totalsLine', {
          foods: report.totals.foods,
          attempts: report.totals.attempts,
          mastered: report.totals.mastered,
        }),
        currentRungLabel: t('foodLadder.report.currentRung'),
        startedAtLabel: t('foodLadder.report.startedAt'),
        historyLabel: t('foodLadder.report.history'),
        attemptsLabel: t('foodLadder.report.attempts'),
        prepsLabel: t('foodLadder.report.preps'),
        noPrepsLabel: t('foodLadder.report.noPreps'),
        noAttemptsLabel: t('foodLadder.report.noAttempts'),
        outcomes: {
          success: t('foodLadder.report.outcomeSuccess'),
          partial: t('foodLadder.report.outcomePartial'),
          refused: t('foodLadder.report.outcomeRefused'),
          tantrum: t('foodLadder.report.outcomeTantrum'),
        },
        statuses: {
          active: t('foodLadder.sections.active.title'),
          paused: t('foodLadder.sections.paused.title'),
          backed_off: t('foodLadder.sections.backed_off.title'),
          mastered: t('foodLadder.sections.mastered.title'),
        },
        disclaimer: t('foodLadder.disclaimer'),
        generatedNote: t('foodLadder.report.generatedNote'),
        rungLabel: (rung) => t(`foodLadder.rungs.${rung}`, { defaultValue: RUNG_META[rung].label }),
        formatPercent: (rate) => percent.format(rate),
      });

      const filename = `${t('foodLadder.report.filename', { name: kidFirstName, from })}.pdf`;
      downloadBlob(blob, filename);
      toast.success(t('foodLadder.report.ready', { filename }));
      setOpen(false);
    } catch (err) {
      logger.error('Ladder report export failed:', err);
      toast.error(t('foodLadder.report.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
          {t('foodLadder.report.cta')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('foodLadder.report.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('foodLadder.report.dialogBody')}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ladder-report-from">{t('foodLadder.report.from')}</Label>
            <Input
              id="ladder-report-from"
              type="date"
              value={from}
              max={to}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ladder-report-to">{t('foodLadder.report.to')}</Label>
            <Input
              id="ladder-report-to"
              type="date"
              value={to}
              min={from}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleGenerate} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {busy ? t('foodLadder.report.generating') : t('foodLadder.report.generate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
