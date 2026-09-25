import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Loader2, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataImport } from "@/components/settings/DataImport";
import { DeleteAccountDialog } from "@/components/settings/DeleteAccountDialog";
import { exportSummaryText } from "@/components/settings/exportSummaryText";
import { useAccountExport } from "@/hooks/useAccountExport";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import "@/i18n/appLocale";

/**
 * Settings > Your data: export, import and delete (settings pass B).
 * Content only; the hub supplies the section and its h2.
 *
 * The export reports what it actually got ("Exported 16 of 17 sections; food
 * history couldn't be read") and writes the same manifest into the file. The
 * old card toasted success whatever the queries returned and never showed
 * that it was working.
 */
export function DataSection() {
  const { t, i18n } = useTranslation();
  const reducedMotion = useReducedMotion();
  const exporter = useAccountExport();
  const [ran, setRan] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const onExport = async () => {
    setRan(false);
    await exporter.run();
    setRan(true);
  };

  const partial = exporter.failed || (exporter.result?.partial ?? false);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {t("settings.account.data.exportTitle", { defaultValue: "Download your data" })}
          </CardTitle>
          <CardDescription>
            {t("settings.account.data.exportDescription", {
              defaultValue:
                "A JSON file with your household's child profiles, foods, recipes, plans and lists, plus your own settings. It lists anything we couldn't read.",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button
            id="export-data"
            type="button"
            variant="outline"
            onClick={() => void onExport()}
            disabled={exporter.running}
            aria-busy={exporter.running || undefined}
            aria-describedby="export-data-status"
          >
            {exporter.running ? (
              <Loader2
                className={reducedMotion ? "h-4 w-4 mr-2" : "h-4 w-4 mr-2 animate-spin"}
                aria-hidden="true"
              />
            ) : (
              <Download className="h-4 w-4 mr-2" aria-hidden="true" />
            )}
            {exporter.running
              ? t("settings.account.data.preparing", { defaultValue: "Preparing..." })
              : t("settings.account.data.exportButton", { defaultValue: "Export my data" })}
          </Button>
          <p
            id="export-data-status"
            aria-live="polite"
            className={partial ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
          >
            {ran && !exporter.running
              ? exportSummaryText(exporter.result, exporter.failed, t, i18n.language || "en")
              : ""}
          </p>
        </CardContent>
      </Card>

      <DataImport />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-destructive">
            <Trash2 className="h-5 w-5" aria-hidden="true" />
            {t("settings.account.data.deleteTitle", { defaultValue: "Delete account" })}
          </CardTitle>
          <CardDescription>
            {t("settings.account.data.deleteDescription", {
              defaultValue:
                "Removes your sign-in and everything you created. If you share a household, we'll show you what the others lose before anything happens.",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            id="delete-account"
            type="button"
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            {t("settings.account.data.deleteButton", { defaultValue: "Delete account..." })}
          </Button>
        </CardContent>
      </Card>

      {/* Mounted only while open: it reads the household and the subscription. */}
      {deleteOpen && <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />}
    </div>
  );
}
