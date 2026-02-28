import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { ReactNode } from "react";

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  onSubmit: (e: React.FormEvent) => void | Promise<void>;
  submitLabel?: string;
  submitLoadingLabel?: string;
  isSubmitting?: boolean;
  showCancel?: boolean;
  cancelLabel?: string;
  submitDisabled?: boolean;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
}

/**
 * Standardized form dialog component
 *
 * Features:
 * - Consistent button layout with DialogFooter
 * - Loading state with spinner
 * - Disabled state handling
 * - Configurable max width
 * - Cancel button (optional)
 *
 * @example
 * <FormDialog
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="Add Food"
 *   onSubmit={handleSubmit}
 *   submitLabel="Add Food"
 *   submitLoadingLabel="Adding..."
 *   isSubmitting={isSubmitting}
 * >
 *   <FormField label="Name" error={errors.name}>
 *     <Input value={name} onChange={(e) => setName(e.target.value)} />
 *   </FormField>
 * </FormDialog>
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  children,
  onSubmit,
  submitLabel = "Save",
  submitLoadingLabel = "Saving...",
  isSubmitting = false,
  showCancel = true,
  cancelLabel = "Cancel",
  submitDisabled = false,
  maxWidth = "md",
}: FormDialogProps) {
  const maxWidthClass = {
    sm: "sm:max-w-[425px]",
    md: "sm:max-w-[500px]",
    lg: "sm:max-w-[600px]",
    xl: "sm:max-w-[700px]",
    "2xl": "sm:max-w-[800px]",
  }[maxWidth];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={maxWidthClass}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">Complete the form below</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {children}

          <DialogFooter>
            {showCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                {cancelLabel}
              </Button>
            )}
            <Button type="submit" disabled={submitDisabled || isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {submitLoadingLabel}
                </>
              ) : (
                submitLabel
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
