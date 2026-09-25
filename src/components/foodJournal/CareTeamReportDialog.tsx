import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface CareTeamReportDialogProps {
  /** The exact report text; null keeps the dialog closed. */
  text: string | null;
  onClose: () => void;
  onCopy: (text: string) => void;
  onShare: (text: string) => void;
  /** Whether a share sheet exists here. Copy is always offered. */
  canShare: boolean;
  busy?: boolean;
}

/**
 * The report a parent is about to send outside the household, shown in full
 * before it goes. What is in the box is exactly what is copied or shared:
 * first names only, household notes signed "Parent".
 */
export function CareTeamReportDialog({ text, onClose, onCopy, onShare, canShare, busy = false }: CareTeamReportDialogProps) {
  const { t } = useTranslation();
  const title = t("foodJournal.careTeam.previewTitle", { defaultValue: "Report for the care team" });
  return (
    <Dialog open={text !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {t("foodJournal.careTeam.previewBody", {
              defaultValue:
                "This is exactly what will be sent. Kids appear by first name only, and household notes are signed \"Parent\" instead of by name.",
            })}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          readOnly
          value={text ?? ""}
          aria-label={title}
          onFocus={(e) => e.currentTarget.select()}
          className="h-64 text-sm leading-relaxed"
        />
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant={canShare ? "outline" : "default"}
            className="min-h-11"
            disabled={busy}
            onClick={() => text !== null && onCopy(text)}
          >
            <Copy className="mr-1 h-4 w-4" aria-hidden="true" />
            {t("foodJournal.careTeam.copy", { defaultValue: "Copy" })}
          </Button>
          {canShare && (
            <Button className="min-h-11" disabled={busy} onClick={() => text !== null && onShare(text)}>
              <Share2 className="mr-1 h-4 w-4" aria-hidden="true" />
              {t("foodJournal.careTeam.share", { defaultValue: "Share" })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
