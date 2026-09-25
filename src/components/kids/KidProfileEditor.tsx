import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useFoods, useKids, usePlan } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { KidSectionFields } from "@/components/kids/KidEditorSections";
import { KID_SECTION_TITLES } from "@/components/kids/kidSectionMeta";
import { useKidPhotoUpload } from "@/components/kids/useKidPhotoUpload";
import { useIsMobile } from "@/hooks/use-mobile";
import { logger } from "@/lib/logger";
import { KidSchema, KidUpdateSchema } from "@/lib/validations";
import { KID_ALLERGEN_PICKER, canonicalAllergen } from "@/lib/allergens";
import { computeProfileCompleteness } from "@/lib/kidProfileCompleteness";
import {
  EMPTY_KID_FORM,
  buildAddPayload,
  buildSectionPatch,
  effectiveAllergens,
  kidFormFromKid,
  removedAllergens,
  sectionChangedSince,
  withSectionFrom,
  type KidEditorForm,
  type KidEditorPatch,
  type KidSectionId,
} from "@/lib/kidIntakeForm";
import type { Kid } from "@/types";

export type KidEditorRequest =
  | { kind: "add" }
  /** review: opened from the "review the profile" nudge, so saving (even unchanged) records a review. */
  | { kind: "edit"; kidId: string; section: KidSectionId; review?: boolean };

export interface KidProfileEditorProps {
  request: KidEditorRequest;
  onClose: () => void;
  /** Called after a save lands, with the child's name, for a status message. */
  onSaved?: (name: string, kind: "added" | "updated") => void;
}

const ADD_STEPS: readonly KidSectionId[] = ["basics", "allergies"];

/** Apply a patch to a kid the way KidsContext does: null clears. */
function mergedKid(kid: Kid, patch: KidEditorPatch): Kid {
  const out = { ...kid } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else out[key] = value;
  }
  return out as unknown as Kid;
}

/**
 * One editor for a child profile (item 30). Opened on a single section of an
 * existing child, it saves that section's changed fields and nothing else.
 * Adding a child walks Basics then Allergies and saves both at once.
 *
 * Phones get a bottom sheet, wider screens a side sheet. Every save goes
 * through KidsContext (addKid / updateKid / deleteKid).
 */
export function KidProfileEditor({ request, onClose, onSaved }: KidProfileEditorProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const uid = useId();
  const { kids, addKid, updateKid, deleteKid } = useKids();
  const { planEntries } = usePlan();
  const { foods } = useFoods();

  const isAdd = request.kind === "add";
  const kidId = request.kind === "edit" ? request.kidId : null;
  const kid = useMemo(() => (kidId ? kids.find((k) => k.id === kidId) ?? null : null), [kids, kidId]);

  // The baseline is the kid as it was when the editor opened, so a realtime
  // update to another field while this is open is neither sent nor undone.
  const [base, setBase] = useState<KidEditorForm>(() => (kid ? kidFormFromKid(kid) : EMPTY_KID_FORM));
  const isReview = request.kind === "edit" && request.review === true;
  const [form, setForm] = useState<KidEditorForm>(base);
  const [addStep, setAddStep] = useState(0);
  const section: KidSectionId = request.kind === "edit" ? request.section : ADD_STEPS[addStep];

  const [open, setOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; allergens?: string }>({});
  const [saveError, setSaveError] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<string[] | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const onUploaded = useCallback((url: string) => setForm((prev) => ({ ...prev, profile_picture_url: url })), []);
  const photo = useKidPhotoUpload(onUploaded);

  // An edit whose child is gone (deleted elsewhere, or a stale link) closes.
  // A delete made here removes the child before it settles; that is not "missing".
  const deletingHere = useRef(false);
  const missing = !isAdd && !kid;
  useEffect(() => {
    if (!missing || deletingHere.current) return;
    toast.error(t("kids.dialog.notFound", { defaultValue: "That child profile couldn't be found." }));
    onClose();
  }, [missing, onClose, t]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(base), [form, base]);

  const update = useCallback((patch: Partial<KidEditorForm>) => {
    setErrors((prev) => ({
      name: "name" in patch && patch.name?.trim() ? undefined : prev.name,
      allergens: "allergens" in patch || "allergy_status" in patch ? undefined : prev.allergens,
    }));
    setSaveError("");
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const finalizeClose = useCallback(() => {
    photo.discardUploads();
    setOpen(false);
    onClose();
  }, [onClose, photo]);

  const requestClose = useCallback(() => {
    if (saving || deleting) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    finalizeClose();
  }, [deleting, dirty, finalizeClose, saving]);

  const friendlyError = (field: string): string => {
    switch (field) {
      case "name":
        return t("kids.dialog.name.required", { defaultValue: "Please enter a name" });
      case "height_cm":
        return t("kids.intake.errors.height", { defaultValue: "Height needs to be between 40 and 220 cm (about 1 ft 4 in to 7 ft 2 in)." });
      case "weight_kg":
        return t("kids.intake.errors.weight", { defaultValue: "Weight needs to be between 1 and 200 kg (about 2 to 440 lb)." });
      case "gender":
        return t("kids.intake.errors.gender", { defaultValue: "Pick one of the gender options, or leave it blank." });
      case "allergens":
      case "allergen_severity":
        return t("kids.intake.errors.allergens", { defaultValue: "Each allergen needs a name of 50 characters or fewer, and there can be at most 20." });
      case "favorite_foods":
      case "always_eats_foods":
      case "disliked_foods":
      case "preferred_preparations":
        return t("kids.intake.errors.foods", { defaultValue: "Keep each food under 100 characters, and the list to 50 foods." });
      case "behavioral_notes":
        return t("kids.intake.errors.notes", { defaultValue: "The eating habit notes are too long to save." });
      default:
        return t("kids.intake.errors.generic", { defaultValue: "One of these answers couldn't be saved. Check it and try again." });
    }
  };

  const saveFailed = () =>
    setSaveError(t("kids.dialog.saveFailed", { defaultValue: "Couldn't save. Your changes are still here, so try again." }));

  /** Section-level checks that the schema cannot make. False when something is shown to fix. */
  const checkSection = (which: KidSectionId): boolean => {
    if (which === "basics" && !form.name.trim()) {
      setErrors((prev) => ({ ...prev, name: t("kids.dialog.name.required", { defaultValue: "Please enter a name" }) }));
      return false;
    }
    if (which === "allergies" && form.allergy_status === "has") {
      const list = effectiveAllergens(form) ?? [];
      const removed = isAdd ? [] : removedAllergens(base, form);
      // "Has allergies" with nothing ticked only makes sense as removing the last one.
      if (list.length === 0 && removed.length === 0) {
        setErrors((prev) => ({
          ...prev,
          allergens: t("kids.dialog.allergens.pickOne", {
            defaultValue: "Pick at least one allergen, or choose No known allergies.",
          }),
        }));
        return false;
      }
    }
    return true;
  };

  /**
   * The saved child changed in this section since the editor opened (another
   * device, or the server load replacing a cached row). Load the latest into
   * the form and ask for another look instead of writing over it.
   */
  const rebaseIfStale = (): boolean => {
    if (!kid) return false;
    const live = kidFormFromKid(kid);
    if (!sectionChangedSince(section, base, live)) return false;
    setBase((prev) => withSectionFrom(section, prev, live));
    setForm((prev) => withSectionFrom(section, prev, live));
    setPendingRemoval(null);
    setSaveError(
      t("kids.editor.changedElsewhere", {
        defaultValue: "This was changed on another device. We loaded the latest, so check it and save again.",
      }),
    );
    return true;
  };

  const commitEdit = async () => {
    if (!kid || !kidId) return;
    if (rebaseIfStale()) return;
    const patch = buildSectionPatch(section, form, base);
    if (Object.keys(patch).length === 0 && !isReview) {
      finalizeClose();
      return;
    }
    const parsed = KidUpdateSchema.safeParse(patch);
    if (!parsed.success) {
      logger.warn("Kid editor validation failed:", parsed.error.issues);
      setSaveError(friendlyError(String(parsed.error.issues[0]?.path[0] ?? "")));
      return;
    }
    // Only a review (the Insights nudge) records a review date; a one-field
    // edit is not a review of the whole profile.
    const extra: KidEditorPatch = isReview ? { profile_last_reviewed: new Date().toISOString() } : {};
    if (kid.profile_completed !== true && computeProfileCompleteness(mergedKid(kid, patch)).percent === 100) {
      extra.profile_completed = true;
    }
    setSaving(true);
    setSaveError("");
    try {
      const ok = await updateKid(kidId, { ...patch, ...extra });
      if (!ok) {
        saveFailed();
        return;
      }
      photo.settleUploads(base.profile_picture_url, form.profile_picture_url);
      const name = form.name.trim() || kid.name;
      toast.success(t("kids.dialog.toast.updated", { name, defaultValue: "{{name}}'s profile saved" }));
      onSaved?.(name, "updated");
      setOpen(false);
      onClose();
    } catch (error) {
      logger.error("Error saving child:", error);
      saveFailed();
    } finally {
      setSaving(false);
    }
  };

  const commitAdd = async () => {
    const payload = buildAddPayload(form);
    const parsed = KidSchema.safeParse({ ...payload, allergens: payload.allergens ?? undefined });
    if (!parsed.success) {
      logger.warn("Kid editor validation failed:", parsed.error.issues);
      const field = String(parsed.error.issues[0]?.path[0] ?? "");
      if (["name", "date_of_birth", "gender", "height_cm", "weight_kg", "profile_picture_url"].includes(field)) setAddStep(0);
      setSaveError(friendlyError(field));
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const ok = await addKid(payload);
      if (!ok) {
        saveFailed();
        return;
      }
      photo.settleUploads(null, form.profile_picture_url);
      const name = payload.name;
      toast.success(t("kids.dialog.toast.added", { name, defaultValue: "{{name}} added" }));
      onSaved?.(name, "added");
      setOpen(false);
      onClose();
    } catch (error) {
      logger.error("Error adding child:", error);
      saveFailed();
    } finally {
      setSaving(false);
    }
  };

  const handlePrimary = () => {
    if (saving || photo.uploading) return;
    if (!checkSection(section)) return;
    if (isAdd) {
      if (addStep < ADD_STEPS.length - 1) {
        setAddStep(addStep + 1);
        return;
      }
      void commitAdd();
      return;
    }
    if (rebaseIfStale()) return;
    if (section === "allergies") {
      const removed = removedAllergens(base, form);
      if (removed.length > 0) {
        setPendingRemoval(removed);
        return;
      }
    }
    void commitEdit();
  };

  const hasPlanEntries = useMemo(
    () => (kidId ? planEntries.some((e) => e.kid_id === kidId) : false),
    [planEntries, kidId],
  );
  const deleteNameMatches =
    !hasPlanEntries || deleteConfirmName.trim().toLowerCase() === base.name.trim().toLowerCase();

  const handleDelete = async () => {
    if (!kidId || !deleteNameMatches) return;
    const name = base.name.trim();
    setDeleting(true);
    deletingHere.current = true;
    try {
      const ok = await deleteKid(kidId);
      if (!ok) deletingHere.current = false;
      setDeleteOpen(false);
      setDeleteConfirmName("");
      if (ok) {
        toast.success(t("kids.dialog.toast.removed", { name, defaultValue: "{{name}} removed" }));
        finalizeClose();
      }
      // On failure KidsContext has already rolled back and said so.
    } finally {
      setDeleting(false);
    }
  };

  const allergenLabel = (value: string) => {
    const picker = KID_ALLERGEN_PICKER.find(
      (p) => p.value === value || canonicalAllergen(p.value) === canonicalAllergen(value),
    );
    return picker ? t(picker.labelKey, { defaultValue: value }) : value;
  };

  if (missing && !deletingHere.current) return null;

  const sectionTitle = t(KID_SECTION_TITLES[section].key, { defaultValue: KID_SECTION_TITLES[section].label });
  const kidName = form.name.trim() || base.name.trim();
  const title = isAdd ? t("kids.dialog.title.add", { defaultValue: "Add child" }) : sectionTitle;
  const description = isAdd
    ? t("kids.editor.addStep", {
        n: addStep + 1,
        total: ADD_STEPS.length,
        section: sectionTitle,
        defaultValue: "Step {{n}} of {{total}}: {{section}}",
      })
    : t("kids.editor.editDescription", { name: base.name, defaultValue: "{{name}}'s profile" });

  const primaryLabel = saving
    ? t("kids.dialog.saving", { defaultValue: "Saving..." })
    : isAdd
      ? addStep < ADD_STEPS.length - 1
        ? t("kids.editor.nextSection", {
            section: t(KID_SECTION_TITLES[ADD_STEPS[addStep + 1]].key, {
              defaultValue: KID_SECTION_TITLES[ADD_STEPS[addStep + 1]].label,
            }),
            defaultValue: "Next: {{section}}",
          })
        : t("kids.dialog.add", { defaultValue: "Add child" })
      : isReview && !dirty
        ? t("kids.editor.stillCurrent", { defaultValue: "Still current" })
        : t("kids.dialog.save", { defaultValue: "Save changes" });

  const saveErrorId = `${uid}-save-error`;

  const body = (
    <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
      <form
        id={`${uid}-form`}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          handlePrimary();
        }}
      >
        <KidSectionFields
          section={section}
          form={form}
          base={base}
          isAdd={isAdd}
          onChange={update}
          householdFoods={foods}
          errors={errors}
          photo={{
            uploading: photo.uploading,
            previewUrl: photo.previewUrl,
            onFile: photo.handleFile,
            onRemove: () => {
              photo.revokePreview();
              update({ profile_picture_url: null });
            },
          }}
        />
      </form>
    </div>
  );

  const footerButtons: ReactNode = (
    <>
      {saveError && (
        <p id={saveErrorId} role="alert" className="flex items-start gap-2 text-sm text-destructive sm:mr-auto">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {saveError}
        </p>
      )}
      {!isAdd && section === "basics" && !saveError && (
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 text-destructive hover:text-destructive sm:mr-auto"
          onClick={() => setDeleteOpen(true)}
          disabled={saving}
        >
          <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("kids.dialog.delete.button", { defaultValue: "Delete" })}
        </Button>
      )}
      <div className="flex gap-2 sm:ml-auto">
        {isAdd && addStep > 0 ? (
          <Button type="button" variant="outline" className="min-h-11 flex-1 sm:flex-none" onClick={() => setAddStep(addStep - 1)} disabled={saving}>
            <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
            {t("kids.intake.back", { defaultValue: "Back" })}
          </Button>
        ) : (
          <Button type="button" variant="outline" className="min-h-11 flex-1 sm:flex-none" onClick={requestClose} disabled={saving}>
            {t("kids.dialog.cancel", { defaultValue: "Cancel" })}
          </Button>
        )}
        <Button
          type="submit"
          form={`${uid}-form`}
          className="min-h-11 flex-1 sm:flex-none"
          disabled={saving || photo.uploading}
          aria-describedby={saveError ? saveErrorId : undefined}
        >
          {(saving || photo.uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {primaryLabel}
          {isAdd && addStep < ADD_STEPS.length - 1 && !saving && <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />}
        </Button>
      </div>
    </>
  );

  const handleOpenChange = (next: boolean) => {
    if (!next) requestClose();
  };

  return (
    <>
      {isMobile ? (
        <Drawer open={open} onOpenChange={handleOpenChange}>
          <DrawerContent className="flex max-h-[92dvh] flex-col" data-testid="kid-editor-drawer">
            <DrawerHeader className="text-left">
              <DrawerTitle>{title}</DrawerTitle>
              <DrawerDescription>{description}</DrawerDescription>
            </DrawerHeader>
            {body}
            <DrawerFooter className="flex-col gap-2 border-t bg-background">{footerButtons}</DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Sheet open={open} onOpenChange={handleOpenChange}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg" data-testid="kid-editor-sheet">
            <SheetHeader className="border-b px-4 py-4 text-left sm:px-6">
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>{description}</SheetDescription>
            </SheetHeader>
            {body}
            <SheetFooter className="flex-col gap-2 border-t bg-background px-4 py-3 sm:flex-row sm:items-center sm:space-x-0 sm:px-6">
              {footerButtons}
            </SheetFooter>
          </SheetContent>
        </Sheet>
      )}

      <AlertDialog open={pendingRemoval !== null} onOpenChange={(v) => { if (!v) setPendingRemoval(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("kids.dialog.removeAllergen.title", { defaultValue: "Remove allergies?" })}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <ul className="space-y-2">
                {(pendingRemoval ?? []).map((a) => (
                  <li key={a}>
                    {t("kids.dialog.removeAllergen.item", {
                      allergen: allergenLabel(a),
                      name: kidName,
                      defaultValue:
                        "Remove {{allergen}} from {{name}}'s allergies? Meals with {{allergen}} will start appearing in plans.",
                    })}
                  </li>
                ))}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("kids.dialog.removeAllergen.keep", { defaultValue: "Keep them" })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setPendingRemoval(null);
                void commitEdit();
              }}
            >
              {t("kids.dialog.removeAllergen.confirm", { defaultValue: "Remove and save" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("kids.dialog.discard.title", { defaultValue: "Discard changes?" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("kids.dialog.discard.description", { defaultValue: "What you entered here won't be saved." })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("kids.dialog.discard.keep", { defaultValue: "Keep editing" })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDiscard(false);
                finalizeClose();
              }}
            >
              {t("kids.dialog.discard.confirm", { defaultValue: "Discard" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(v) => {
          setDeleteOpen(v);
          if (!v) setDeleteConfirmName("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("kids.dialog.delete.title", { name: base.name, defaultValue: "Delete {{name}}?" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("kids.dialog.delete.description", {
                defaultValue: "This removes the profile from every device in your household.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div role="note" className="flex gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {t("kids.dialog.delete.dataLoss", {
                name: base.name,
                defaultValue:
                  "All meal plans, food tracking and settings for {{name}} will be deleted. This can't be undone.",
              })}
            </span>
          </div>
          {hasPlanEntries && (
            <div className="space-y-2">
              <Label htmlFor={`${uid}-delete-name`}>
                {t("kids.dialog.delete.typeName", { name: base.name, defaultValue: "Type {{name}} to confirm" })}
              </Label>
              <Input
                id={`${uid}-delete-name`}
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                autoComplete="off"
                className="min-h-11"
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("kids.dialog.cancel", { defaultValue: "Cancel" })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Keep this dialog up until the delete settles.
                e.preventDefault();
                void handleDelete();
              }}
              disabled={!deleteNameMatches || deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {t("kids.dialog.delete.confirm", { defaultValue: "Delete profile" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
