import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { KidProfileEditor, type KidEditorRequest } from "@/components/kids/KidProfileEditor";
import type { KidSectionId } from "@/lib/kidIntakeForm";

export interface ManageKidsDialogRef {
  /** Add a child: the editor starts at Basics, then Allergies. */
  openForAdd: () => void;
  /**
   * Edit one section of a child's profile (Basics when none is named). An
   * empty id opens the Add flow, kept for older callers.
   */
  openForEdit: (kidId: string, section?: KidSectionId, options?: { review?: boolean }) => void;
}

interface ManageKidsDialogProps {
  onSaved?: (name: string, kind: "added" | "updated") => void;
}

/**
 * The host for the one child-profile editor (item 30). It used to be the
 * quick-edit dialog; the Kids page, the food tracker and anything else that
 * holds this ref now open the section editor through it.
 */
const ManageKidsDialogComponent = forwardRef<ManageKidsDialogRef, ManageKidsDialogProps>(({ onSaved }, ref) => {
  const [request, setRequest] = useState<KidEditorRequest | null>(null);
  // A fresh key per open, so each request starts from the saved profile.
  const openCount = useRef(0);
  const [key, setKey] = useState(0);

  const show = useCallback((next: KidEditorRequest) => {
    openCount.current += 1;
    setKey(openCount.current);
    setRequest(next);
  }, []);

  const openForAdd = useCallback(() => show({ kind: "add" }), [show]);
  const openForEdit = useCallback(
    (kidId: string, section: KidSectionId = "basics", options?: { review?: boolean }) => {
      if (!kidId) show({ kind: "add" });
      else show({ kind: "edit", kidId, section, review: options?.review === true });
    },
    [show],
  );

  useImperativeHandle(ref, () => ({ openForAdd, openForEdit }), [openForAdd, openForEdit]);

  const close = useCallback(() => setRequest(null), []);

  if (!request) return null;
  return <KidProfileEditor key={key} request={request} onClose={close} onSaved={onSaved} />;
});

ManageKidsDialogComponent.displayName = "ManageKidsDialog";

export const ManageKidsDialog = ManageKidsDialogComponent;
