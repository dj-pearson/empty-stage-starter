/**
 * The care report for one child: download it as a PDF, or share it as a link
 * that expires.
 *
 * Both paths start from the same object (buildCareReport), so the link shows
 * exactly what the PDF shows. A link needs a consent step first: who can open
 * it, that it can be forwarded, that it does not update, and that EatPal is
 * not a medical record system. The parent's list of links shows how often
 * each was opened and turns any of them off.
 *
 * A clinician account that follows a child live is deliberately not offered.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Copy, FileDown, Link2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { addIsoDays, toISODate } from '@/lib/date-utils';
import { firstName } from '@/lib/firstName';
import { downloadBlob } from '@/lib/csvExport';
import { fetchAllPages } from '@/lib/clinicianLadderReport';
import { isRung } from '@/lib/exposureLadder';
import { buildCareReport, type CareReport } from '@/lib/careReport';
import { renderCareReportPdf } from '@/lib/careReportPdf';
import { careReportPdfStrings, formatReportDay } from '@/lib/careReportCopy';
import {
  CARE_SHARE_EXPIRY_DAYS,
  CARE_SHARE_LABEL_MAX,
  DEFAULT_CARE_SHARE_EXPIRY,
  buildCareShareUrl,
  careShareState,
  createCareShare,
  listCareShares,
  revokeCareShare,
  type CareReportShare,
  type CareShareExpiryDays,
} from '@/lib/careReportShares';
import { copyTextToClipboard } from '@/lib/recipeShareLinks';
import type { KidLadderRow } from '@/lib/kidProgress';
import type { Food, Kid } from '@/types';
import '@/i18n/appLocale';

const DEFAULT_RANGE_DAYS = 90;

export interface CareReportDialogProps {
  kid: Pick<Kid, 'id' | 'name' | 'always_eats_foods'>;
  /** The household's ladder rows; narrowed to `kid` here. */
  ladderRows: readonly KidLadderRow[];
  foods: readonly Pick<Food, 'id' | 'name'>[];
}

type Step = 'options' | 'consent' | 'created';

/** Every attempt for the child up to `to`: "new" needs the history before `from`. */
async function fetchAttempts(kidId: string, to: string) {
  return fetchAllPages((rangeFrom, rangeTo) =>
    supabase
      .from('food_attempts')
      .select('food_id, stage, outcome, attempted_at, preparation_method, parent_notes, reaction_notes')
      .eq('kid_id', kidId)
      .lte('attempted_at', `${to}T23:59:59.999Z`)
      .order('attempted_at', { ascending: true })
      .order('id', { ascending: true })
      .range(rangeFrom, rangeTo),
  );
}

export function CareReportDialog({ kid, ladderRows, foods }: CareReportDialogProps) {
  const { t, i18n } = useTranslation();
  const { householdId } = useAuth();
  const name = firstName(kid.name);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('options');
  const [from, setFrom] = useState(() => addIsoDays(toISODate(new Date()), -DEFAULT_RANGE_DAYS));
  const [to, setTo] = useState(() => toISODate(new Date()));
  const [includeNotes, setIncludeNotes] = useState(false);
  const [busy, setBusy] = useState<'pdf' | 'share' | null>(null);

  const [expiry, setExpiry] = useState<CareShareExpiryDays>(DEFAULT_CARE_SHARE_EXPIRY);
  const [label, setLabel] = useState('');
  const [consented, setConsented] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  const [shares, setShares] = useState<CareReportShare[]>([]);
  const [sharesError, setSharesError] = useState(false);

  const reloadShares = useCallback(async () => {
    try {
      setShares(await listCareShares(kid.id));
      setSharesError(false);
    } catch (error) {
      logger.warn('Care report links: read failed', error);
      setSharesError(true);
    }
  }, [kid.id]);

  useEffect(() => {
    if (open) void reloadShares();
  }, [open, reloadShares]);

  const resetShareFlow = () => {
    setStep('options');
    setConsented(false);
    setLabel('');
    setExpiry(DEFAULT_CARE_SHARE_EXPIRY);
    setCreatedUrl(null);
  };

  const buildReport = async (): Promise<CareReport | null> => {
    if (to < from) {
      toast.error(t('foodLadder.report.rangeInvalid'));
      return null;
    }
    const rows = await fetchAttempts(kid.id, to);
    const foodNames: Record<string, string> = {};
    for (const food of foods) foodNames[food.id] = food.name;
    const report = buildCareReport({
      kidFirstName: name,
      from,
      to,
      attempts: rows.map((row) => ({
        foodId: row.food_id,
        stage: row.stage,
        outcome: row.outcome,
        attemptedAt: row.attempted_at,
        preparationMethod: row.preparation_method,
        parentNotes: row.parent_notes,
        reactionNotes: row.reaction_notes,
      })),
      ladderRows: ladderRows.flatMap((row) =>
        row.kid_id === kid.id && isRung(row.current_rung)
          ? [{ foodId: row.food_id, currentRung: row.current_rung, status: row.status }]
          : [],
      ),
      foodNames,
      // always_eats_foods holds ids or free-text names; resolve what it can.
      safeFoodNames: (kid.always_eats_foods ?? []).map((value) => foodNames[value] ?? value),
      includeNotes,
    });
    if (report.summary.offers === 0 && report.ladder.length === 0 && report.safeFoods.length === 0) {
      toast.info(t('careReport.emptyRange', { defaultValue: 'Nothing was logged for {{name}} in this range.', name }));
      return null;
    }
    return report;
  };

  const handleDownload = async () => {
    setBusy('pdf');
    try {
      const report = await buildReport();
      if (!report) return;
      const blob = renderCareReportPdf(report, careReportPdfStrings(report, t, i18n.language));
      const filename = `${t('careReport.filename', { defaultValue: 'care-report-{{name}}-{{from}}', name, from })}.pdf`;
      downloadBlob(blob, filename);
      toast.success(t('careReport.downloaded', { defaultValue: 'Saved {{filename}}', filename }));
    } catch (error) {
      logger.error('Care report PDF failed:', error);
      toast.error(t('careReport.failed', { defaultValue: "Couldn't make the report. Try again." }));
    } finally {
      setBusy(null);
    }
  };

  const handleCreateLink = async () => {
    if (!householdId || !consented) return;
    setBusy('share');
    try {
      const report = await buildReport();
      if (!report) return;
      const share = await createCareShare({ householdId, kidId: kid.id, report, label, expiresInDays: expiry });
      setCreatedUrl(buildCareShareUrl(share.token));
      setStep('created');
      void reloadShares();
    } catch (error) {
      logger.error('Care report link failed:', error);
      toast.error(t('careReport.share.failed', { defaultValue: "Couldn't make the link. Try again." }));
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async (url: string) => {
    const ok = await copyTextToClipboard(url);
    if (ok) toast.success(t('careReport.share.copied', { defaultValue: 'Link copied' }));
    else toast.error(t('careReport.share.copyFailed', { defaultValue: 'Copy the link from the box instead.' }));
  };

  const handleRevoke = async (share: CareReportShare) => {
    try {
      await revokeCareShare(share.id);
      toast.success(t('careReport.share.revoked', { defaultValue: 'Link turned off' }));
      void reloadShares();
    } catch (error) {
      logger.error('Care report link revoke failed:', error);
      toast.error(t('careReport.share.revokeFailed', { defaultValue: "Couldn't turn the link off. Try again." }));
    }
  };

  const now = new Date();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetShareFlow();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="min-h-11">
          <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
          {t('careReport.cta', { defaultValue: 'Care report' })}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('careReport.dialogTitle', { defaultValue: 'Care report for {{name}}', name })}</DialogTitle>
          <DialogDescription>
            {t('careReport.dialogBody', {
              defaultValue:
                'A summary for a psychologist, feeding therapist or dietitian: how often you logged, what was offered and how it went, safe foods and the exposure ladder. {{name}} appears by first name only.',
              name,
            })}
          </DialogDescription>
        </DialogHeader>

        {step === 'options' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="care-report-from">{t('foodLadder.report.from')}</Label>
                <Input id="care-report-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="care-report-to">{t('foodLadder.report.to')}</Label>
                <Input id="care-report-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="care-report-notes"
                checked={includeNotes}
                onCheckedChange={(value) => setIncludeNotes(value === true)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="care-report-notes">
                  {t('careReport.includeNotes', { defaultValue: 'Include my notes from each try' })}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('careReport.includeNotesHint', {
                    defaultValue: 'Off by default. Notes can mention names, places or other people, so read them first.',
                  })}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleDownload()} disabled={busy !== null} className="min-h-11">
                {busy === 'pdf' ? (
                  <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                ) : (
                  <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {t('careReport.download', { defaultValue: 'Download PDF' })}
              </Button>
              <Button
                variant="outline"
                onClick={() => setStep('consent')}
                disabled={busy !== null || !householdId}
                className="min-h-11"
              >
                <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
                {t('careReport.share.start', { defaultValue: 'Share as a link' })}
              </Button>
            </div>
          </div>
        ) : null}

        {step === 'consent' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">
                {t('careReport.share.consent.heading', { defaultValue: 'Before you share' })}
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>
                  {t('careReport.share.consent.anyone', {
                    defaultValue:
                      'Anyone with the link can open it until it expires or you turn it off, and they can forward it.',
                  })}
                </li>
                <li>
                  {includeNotes
                    ? t('careReport.share.consent.contentsNotes', {
                        defaultValue:
                          "It shows this report as it is now, including your notes. It won't update as you log more.",
                      })
                    : t('careReport.share.consent.contents', {
                        defaultValue: "It shows this report as it is now. It won't update as you log more.",
                      })}
                </li>
                <li>
                  {t('careReport.share.consent.notMedical', {
                    defaultValue:
                      'EatPal is not a healthcare provider, and this link is not a medical record. Send it only to people you choose.',
                  })}
                </li>
                <li>
                  {t('careReport.share.consent.control', {
                    defaultValue: 'You can see how many times it was opened, and turn it off at any time.',
                  })}
                </li>
              </ul>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                {t('careReport.share.expiryLegend', { defaultValue: 'Link works for' })}
              </legend>
              <RadioGroup
                value={String(expiry)}
                onValueChange={(value) => setExpiry(Number(value) as CareShareExpiryDays)}
                className="flex flex-wrap gap-4"
              >
                {CARE_SHARE_EXPIRY_DAYS.map((days) => (
                  <div key={days} className="flex items-center gap-2">
                    <RadioGroupItem id={`care-expiry-${days}`} value={String(days)} />
                    <Label htmlFor={`care-expiry-${days}`}>
                      {t('careReport.share.expiryDays', { defaultValue: '{{count}} days', count: days })}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="care-share-label">
                {t('careReport.share.labelLabel', { defaultValue: 'Who is it for? Only you see this.' })}
              </Label>
              <Input
                id="care-share-label"
                value={label}
                maxLength={CARE_SHARE_LABEL_MAX}
                placeholder={t('careReport.share.labelPlaceholder', { defaultValue: 'e.g. Feeding therapist' })}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="care-share-consent"
                checked={consented}
                onCheckedChange={(value) => setConsented(value === true)}
                className="mt-0.5"
              />
              <Label htmlFor="care-share-consent" className="leading-snug">
                {t('careReport.share.consent.agree', {
                  defaultValue: "I'm {{name}}'s parent or guardian, and I choose to share this report.",
                  name,
                })}
              </Label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void handleCreateLink()}
                disabled={!consented || busy !== null}
                className="min-h-11"
              >
                {busy === 'share' ? (
                  <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                ) : (
                  <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {t('careReport.share.create', { defaultValue: 'Create link' })}
              </Button>
              <Button variant="ghost" onClick={resetShareFlow} className="min-h-11">
                {t('careReport.share.back', { defaultValue: 'Back' })}
              </Button>
            </div>
          </div>
        ) : null}

        {step === 'created' && createdUrl ? (
          <div className="space-y-3">
            <Label htmlFor="care-share-url">
              {t('careReport.share.createdLabel', {
                defaultValue: 'Link ready. It works for {{count}} days.',
                count: expiry,
              })}
            </Label>
            <div className="flex gap-2">
              <Input id="care-share-url" readOnly value={createdUrl} onFocus={(e) => e.currentTarget.select()} />
              <Button
                variant="outline"
                onClick={() => void handleCopy(createdUrl)}
                aria-label={t('careReport.share.copy', { defaultValue: 'Copy link' })}
                className="min-h-11 shrink-0"
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <Button variant="ghost" onClick={resetShareFlow} className="min-h-11">
              {t('careReport.share.done', { defaultValue: 'Done' })}
            </Button>
          </div>
        ) : null}

        <section aria-labelledby="care-links-heading" className="space-y-2 border-t border-border pt-4">
          <h3 id="care-links-heading" className="text-sm font-semibold">
            {t('careReport.share.listHeading', { defaultValue: 'Links you have shared' })}
          </h3>
          {sharesError ? (
            <p className="text-sm text-muted-foreground">
              {t('careReport.share.listError', { defaultValue: "Couldn't load your links." })}
            </p>
          ) : shares.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('careReport.share.listEmpty', { defaultValue: 'None yet.' })}
            </p>
          ) : (
            <ul className="divide-y divide-border" data-testid="care-share-list">
              {shares.map((share) => {
                const state = careShareState(share, now);
                const day = (iso: string) => formatReportDay(toISODate(iso), i18n.language);
                const stateLine =
                  state === 'live'
                    ? t('careReport.share.stateLive', { defaultValue: 'Works until {{date}}', date: day(share.expiresAt) })
                    : state === 'expired'
                      ? t('careReport.share.stateExpired', { defaultValue: 'Expired {{date}}', date: day(share.expiresAt) })
                      : t('careReport.share.stateRevoked', { defaultValue: 'Turned off' });
                const views =
                  share.viewCount > 0 && share.lastViewedAt
                    ? t('careReport.share.views', {
                        defaultValue: 'Opened {{count}} times, last {{date}}',
                        count: share.viewCount,
                        date: day(share.lastViewedAt),
                      })
                    : t('careReport.share.notOpened', { defaultValue: 'Not opened yet' });
                return (
                  <li key={share.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {share.label || t('careReport.share.untitled', { defaultValue: 'Link from {{date}}', date: day(share.createdAt) })}
                      </p>
                      <p className="text-muted-foreground">
                        {stateLine} · {views}
                      </p>
                    </div>
                    {state === 'live' ? (
                      <Button variant="outline" size="sm" className="min-h-11 shrink-0" onClick={() => void handleRevoke(share)}>
                        {t('careReport.share.revoke', { defaultValue: 'Turn off' })}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
