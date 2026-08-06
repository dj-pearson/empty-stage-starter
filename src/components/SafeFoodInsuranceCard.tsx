/**
 * Safe Food Insurance card (US-611, web surface).
 *
 * The hard part of this card is tone, not layout. A parent reading it should
 * come away with something to do, not something to dread — so it reports what
 * was observed in the last couple of weeks and stops there. It never says a
 * food is being lost, never predicts, and never implies a clinical outcome.
 * The two offers (build a backup, give it some room) are the point; the
 * observations exist to explain why they are being offered at all.
 *
 * Every decision comes from the shared rule set — `scoreSafeFoodRisk` and
 * `selectSafeFoodAlerts`. This renders.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shuffle, Sprout, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { analytics } from '@/lib/analytics';
import type { SafeFoodAlert } from '@/lib/safeFoodAlerts';
import type { SafeFoodRisk, SafeFoodSignal } from '@/lib/safeFoodRisk';
import type { SafeFoodBackupTarget } from '@/hooks/useSafeFoodInsurance';

interface Props {
  alerts: SafeFoodAlert[];
  backupByFood: Map<string, SafeFoodBackupTarget>;
  onDismiss: (risk: SafeFoodRisk) => void;
  /** Starts a ladder for the backup target, anchored to the at-risk food. */
  onStartBackup: (target: SafeFoodBackupTarget) => Promise<boolean>;
  surface?: string;
}

export function SafeFoodInsuranceCard({
  alerts,
  backupByFood,
  onDismiss,
  onStartBackup,
  surface = 'unknown',
}: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [busyFoodId, setBusyFoodId] = useState<string | null>(null);

  if (alerts.length === 0) return null;

  const percent = new Intl.NumberFormat(i18n.language, {
    style: 'percent',
    maximumFractionDigits: 0,
  });

  const observationText = (signal: SafeFoodSignal, foodName: string): string | null => {
    switch (signal.kind) {
      case 'declining_acceptance':
        return t('safeFood.observations.decliningAcceptance', {
          food: foodName,
          recent: percent.format(signal.recentRate),
          baseline: percent.format(signal.baselineRate),
        });
      case 'rising_refusals':
        return t('safeFood.observations.risingRefusals', {
          recent: percent.format(signal.recentRate),
          baseline: percent.format(signal.baselineRate),
        });
      case 'over_served':
        return t('safeFood.observations.overServed', {
          shortCount: signal.shortWindowCount,
          longCount: signal.longWindowCount,
        });
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      {alerts.map((alert) => {
        const { risk } = alert;
        const backup = backupByFood.get(risk.foodId);
        const observations = alert.observations
          .map((signal) => observationText(signal, risk.foodName))
          .filter((text): text is string => !!text);

        const handleBackup = async () => {
          if (!backup) return;
          setBusyFoodId(risk.foodId);
          try {
            const ok = await onStartBackup(backup);
            analytics.trackEvent('safe_food_backup_started', {
              surface,
              level: risk.level,
              target_food_id: backup.foodId,
              anchor_food_id: backup.anchorFoodId,
              ok,
            });
            toast[ok ? 'success' : 'error'](
              ok
                ? t('safeFood.backupAdded', { target: backup.foodName, food: risk.foodName })
                : t('safeFood.backupFailed')
            );
          } finally {
            setBusyFoodId(null);
          }
        };

        const handleRotation = () => {
          analytics.trackEvent('safe_food_rotation_clicked', { surface, level: risk.level });
          navigate('/dashboard/sibling-meal-finder');
        };

        const handleDismiss = () => {
          analytics.trackEvent('safe_food_alert_dismissed', { surface, level: risk.level });
          onDismiss(risk);
          toast.success(t('safeFood.dismissed', { food: risk.foodName }));
        };

        return (
          <Card key={risk.foodId}>
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <Sprout
                    className="h-5 w-5 shrink-0 mt-0.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">
                        {t('safeFood.title', { food: risk.foodName })}
                      </h3>
                      <Badge variant="secondary" className="font-normal">
                        {risk.level === 'at_risk'
                          ? t('safeFood.levelAtRisk')
                          : t('safeFood.levelWatch')}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 max-w-[70ch]">
                      {t('safeFood.body', { food: risk.foodName })}
                    </p>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDismiss}
                  aria-label={t('safeFood.dismiss')}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              {observations.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t('safeFood.observationsLabel')}
                  </p>
                  <ul className="mt-1 ml-4 list-disc space-y-0.5">
                    {observations.map((text, index) => (
                      <li key={index} className="text-xs text-muted-foreground max-w-[70ch]">
                        {text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-sm font-medium">{t('safeFood.backupTitle')}</p>
                  {backup ? (
                    <>
                      <p className="text-xs text-muted-foreground mt-0.5 max-w-[70ch]">
                        {t('safeFood.backupBody', {
                          food: risk.foodName,
                          target: backup.foodName,
                        })}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={handleBackup}
                        disabled={busyFoodId === risk.foodId}
                      >
                        <Sprout className="h-4 w-4 mr-1.5" aria-hidden="true" />
                        {t('safeFood.backupCta', { target: backup.foodName })}
                      </Button>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5 max-w-[70ch]">
                      {t('safeFood.backupNone')}
                    </p>
                  )}
                </div>

                {alert.offerRotation && (
                  <div>
                    <p className="text-sm font-medium">{t('safeFood.rotationTitle')}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 max-w-[70ch]">
                      {t('safeFood.rotationBody', { food: risk.foodName })}
                    </p>
                    <Button size="sm" variant="outline" className="mt-2" onClick={handleRotation}>
                      <Shuffle className="h-4 w-4 mr-1.5" aria-hidden="true" />
                      {t('safeFood.rotationCta')}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
