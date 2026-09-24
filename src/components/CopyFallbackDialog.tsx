import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface CopyFallbackDialogProps {
  /** The text to copy by hand; null keeps the dialog closed. */
  text: string | null;
  onClose: () => void;
  title: string;
  body: string;
}

/**
 * Shown when neither the share sheet nor the clipboard took the text: the
 * text itself, selected on focus so a long-press or Ctrl+C copies all of it.
 */
export function CopyFallbackDialog({ text, onClose, title, body }: CopyFallbackDialogProps) {
  return (
    <Dialog open={text !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <Textarea
          readOnly
          value={text ?? ""}
          aria-label={title}
          onFocus={(e) => e.currentTarget.select()}
          className="h-48 text-sm"
        />
      </DialogContent>
    </Dialog>
  );
}
