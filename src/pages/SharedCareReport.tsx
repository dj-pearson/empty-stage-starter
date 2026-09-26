import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { ChefHat, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { toISODate } from "@/lib/date-utils";
import { parseCareReport, type CareReport } from "@/lib/careReport";
import {
  careSummaryLines,
  formatReportDay,
  newFoodLine,
  reportRangeLabel,
  rungName,
  statusName,
} from "@/lib/careReportCopy";
import "@/i18n/appLocale";

type State =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error" }
  | { status: "ready"; report: CareReport; sharedAt: string; expiresAt: string };

/**
 * /care/:token, a care report a parent shared with a clinician. Public and
 * read-only: no session, nothing but the snapshot the parent previewed and
 * chose to send. Unknown, revoked and expired links all read as "not
 * available", because the database answers them the same way. noindex and
 * no-referrer, so the link neither lands in search nor leaks onward in a
 * Referer header.
 */
export default function SharedCareReport() {
  const { t, i18n } = useTranslation();
  const { token = "" } = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_shared_care_report", { p_token: token });
        if (cancelled) return;
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : null;
        const report = row ? parseCareReport(row.report) : null;
        setState(
          row && report
            ? { status: "ready", report, sharedAt: row.shared_at, expiresAt: row.expires_at }
            : { status: "missing" },
        );
      } catch (error) {
        if (cancelled) return;
        logger.error("Could not load a shared care report:", error);
        setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const title =
    state.status === "ready"
      ? t("careReport.page.metaTitle", { defaultValue: "Care report for {{name}} - EatPal", name: state.report.kidFirstName })
      : t("careReport.page.metaTitleFallback", { defaultValue: "A shared care report - EatPal" });

  return (
    <main id="main-content" className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>{title}</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>

      <header className="border-b print:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <ChefHat className="h-5 w-5 text-primary" aria-hidden="true" />
            EatPal
          </Link>
          {state.status === "ready" ? (
            <Button size="sm" variant="outline" onClick={() => window.print()} className="min-h-11">
              <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("careReport.page.print", { defaultValue: "Print or save as PDF" })}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6 md:py-10">
        {state.status === "loading" ? (
          <div className="flex justify-center py-16" role="status">
            <Loader2 className="h-6 w-6 motion-safe:animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">{t("careReport.page.loading", { defaultValue: "Loading the report" })}</span>
          </div>
        ) : state.status === "ready" ? (
          <ReportBody report={state.report} sharedAt={state.sharedAt} expiresAt={state.expiresAt} language={i18n.language} />
        ) : (
          <div className="space-y-3 py-12 text-center">
            <h1 className="text-2xl font-semibold">
              {state.status === "missing"
                ? t("careReport.page.missingTitle", { defaultValue: "This report isn't available" })
                : t("careReport.page.errorTitle", { defaultValue: "Couldn't load this report" })}
            </h1>
            <p className="mx-auto max-w-[60ch] text-muted-foreground">
              {state.status === "missing"
                ? t("careReport.page.missingBody", {
                    defaultValue: "The link may have expired or been turned off. Ask the family to send a new one.",
                  })
                : t("careReport.page.errorBody", { defaultValue: "Check your connection and try again." })}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function ReportBody({
  report,
  sharedAt,
  expiresAt,
  language,
}: {
  report: CareReport;
  sharedAt: string;
  expiresAt: string;
  language: string;
}) {
  const { t } = useTranslation();
  const sectionClass = "space-y-2 border-t border-border pt-5";
  const headingClass = "text-lg font-semibold";

  return (
    <article className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold md:text-3xl">
          {t("careReport.page.heading", { defaultValue: "Care report for {{name}}", name: report.kidFirstName })}
        </h1>
        <p className="text-muted-foreground">{reportRangeLabel(report, language)}</p>
        <p className="text-sm text-muted-foreground">
          {t("careReport.page.sharedLine", {
            defaultValue: "Shared by the family on {{shared}}. This link works until {{expires}}.",
            shared: formatReportDay(toISODate(sharedAt), language),
            expires: formatReportDay(toISODate(expiresAt), language),
          })}
        </p>
      </header>

      <section aria-labelledby="care-summary" className={sectionClass}>
        <h2 id="care-summary" className={headingClass}>
          {t("careReport.headings.summary", { defaultValue: "Summary" })}
        </h2>
        <ul className="space-y-1">
          {careSummaryLines(report, t).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="care-safe" className={sectionClass}>
        <h2 id="care-safe" className={headingClass}>
          {t("careReport.headings.safe", { defaultValue: "Safe foods now" })}
        </h2>
        <p className={report.safeFoods.length > 0 ? undefined : "text-muted-foreground"}>
          {report.safeFoods.length > 0
            ? report.safeFoods.join(", ")
            : t("careReport.empty.safe", { defaultValue: "None recorded yet." })}
        </p>
      </section>

      <section aria-labelledby="care-new" className={sectionClass}>
        <h2 id="care-new" className={headingClass}>
          {t("careReport.headings.new", { defaultValue: "New foods offered" })}
        </h2>
        {report.newFoods.length > 0 ? (
          <ul className="space-y-1">
            {report.newFoods.map((food) => (
              <li key={`${food.name}|${food.firstOfferedOn}`}>{newFoodLine(food, t, language)}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">
            {t("careReport.empty.new", { defaultValue: "No first-time offers in this range." })}
          </p>
        )}
      </section>

      <section aria-labelledby="care-ladder" className={sectionClass}>
        <h2 id="care-ladder" className={headingClass}>
          {t("careReport.headings.ladder", { defaultValue: "Exposure ladder" })}
        </h2>
        {report.ladder.length > 0 ? (
          <ul className="divide-y divide-border">
            {report.ladder.map((row) => {
              const c = row.outcomeCounts;
              return (
                <li key={row.foodName} className="space-y-1 py-3">
                  <p className="font-medium">{row.foodName}</p>
                  {row.currentRung ? (
                    <p className="text-sm">
                      {t("foodLadder.report.currentRung")}: {rungName(row.currentRung, t)}
                      {row.status ? ` (${statusName(row.status, t)})` : ""}
                    </p>
                  ) : null}
                  {row.rungHistory.length > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("foodLadder.report.history")}:{" "}
                      {row.rungHistory
                        .map((step) => `${rungName(step.rung, t)} (${formatReportDay(step.on, language)})`)
                        .join(" > ")}
                    </p>
                  ) : null}
                  {c.total > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("foodLadder.report.attempts")} ({c.total}): {t("foodLadder.report.outcomeSuccess")} {c.success} ·{" "}
                      {t("foodLadder.report.outcomePartial")} {c.partial} · {t("foodLadder.report.outcomeRefused")}{" "}
                      {c.refused} · {t("foodLadder.report.outcomeTantrum")} {c.tantrum}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted-foreground">{t("careReport.empty.ladder", { defaultValue: "No foods on the ladder." })}</p>
        )}
      </section>

      {report.includesNotes && report.notes.length > 0 ? (
        <section aria-labelledby="care-notes" className={sectionClass}>
          <h2 id="care-notes" className={headingClass}>
            {t("careReport.headings.notes", { defaultValue: "Parent's notes" })}
          </h2>
          <ul className="space-y-2">
            {report.notes.map((note, i) => (
              <li key={`${note.on}-${i}`} className="text-sm">
                <span className="text-muted-foreground">
                  {formatReportDay(note.on, language)} · {note.food}:
                </span>{" "}
                {note.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="space-y-1 border-t border-border pt-5 text-sm text-muted-foreground">
        <p>{t("foodLadder.disclaimer")}</p>
        <p>
          {t("careReport.generatedNote", {
            defaultValue: "Made in EatPal from what the family logged. The child appears by first name only.",
          })}
        </p>
      </footer>
    </article>
  );
}
