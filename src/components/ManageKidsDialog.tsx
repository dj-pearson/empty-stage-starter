import { useState, useImperativeHandle, forwardRef, useRef, useEffect, useMemo, useCallback, useId } from "react";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { useKids, usePlan } from "@/contexts/AppContext";
import type { KidPatch } from "@/contexts/KidsContext";
import type { Kid } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { KidAvatarImage } from "@/components/KidAvatarImage";
import { Trash2, AlertTriangle, UserCircle, CalendarIcon, Heart, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInYears } from "date-fns";
import { cn, generateId } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { parseIsoDate } from "@/lib/date-utils";
import { deleteReplacedStorageObject, deleteStorageObject } from "@/lib/storageCleanup";
import {
  KID_ALLERGEN_PICKER,
  canonicalAllergen,
  normalizeKidAllergenInput,
  pruneAllergenSeverity,
} from "@/lib/allergens";
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

const NAME_MAX = 100;
const NOTES_MAX = 1000;
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const FORM_ID = "manage-kid-form";

/** Only these are accepted; the stored extension comes from the MIME type, never the file name. */
const PHOTO_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Common foods kids enjoy, tagged with the picker allergens they usually
 * contain. A tagged food is disabled while the child is allergic to one of
 * them, so the favorites list cannot contradict the allergy list.
 */
const COMMON_FOODS: readonly { name: string; allergens?: readonly string[] }[] = [
  { name: "Apple" }, { name: "Banana" }, { name: "Grapes" }, { name: "Strawberries" },
  { name: "Blueberries" }, { name: "Watermelon" }, { name: "Carrots" }, { name: "Broccoli" },
  { name: "Cucumber" }, { name: "Sweet Potato" }, { name: "Corn" }, { name: "Peas" },
  { name: "Chicken" }, { name: "Turkey" }, { name: "Fish", allergens: ["fish"] },
  { name: "Eggs", allergens: ["eggs"] }, { name: "Beef" }, { name: "Pork" },
  { name: "Pasta", allergens: ["wheat"] }, { name: "Rice" }, { name: "Bread", allergens: ["wheat"] },
  { name: "Oatmeal" }, { name: "Pancakes", allergens: ["eggs"] }, { name: "Waffles" },
  { name: "Cheese", allergens: ["milk"] }, { name: "Yogurt", allergens: ["milk"] },
  { name: "Milk", allergens: ["milk"] }, { name: "Ice Cream", allergens: ["milk"] },
  { name: "Pizza" }, { name: "Nuggets" }, { name: "Mac & Cheese", allergens: ["milk"] },
  { name: "Sandwiches" }, { name: "Burgers" }, { name: "Hot Dogs" },
  { name: "Crackers", allergens: ["wheat"] }, { name: "Pretzels" }, { name: "Cookies" },
  { name: "Fruit Snacks" },
];

const PICKER_VALUES = new Set(KID_ALLERGEN_PICKER.map((p) => p.value));

/** has = a list, none = confirmed no known allergies ([]), unknown = not recorded (null / key omitted). */
export type AllergenStatus = "has" | "none" | "unknown";

interface KidFormState {
  name: string;
  date_of_birth: Date | undefined;
  notes: string;
  allergenStatus: AllergenStatus;
  allergens: string[];
  profile_picture_url: string | null;
  favorite_foods: string[];
}

const EMPTY_FORM: KidFormState = {
  name: "",
  date_of_birth: undefined,
  notes: "",
  allergenStatus: "unknown",
  allergens: [],
  profile_picture_url: null,
  favorite_foods: [],
};

function formFromKid(kid: Kid): KidFormState {
  const allergens = kid.allergens;
  return {
    name: kid.name,
    // Local midnight. new Date('2019-05-10') is UTC midnight, which is May 9 west of UTC.
    date_of_birth: kid.date_of_birth ? parseIsoDate(kid.date_of_birth) : undefined,
    notes: kid.notes ?? "",
    allergenStatus: allergens == null ? "unknown" : allergens.length > 0 ? "has" : "none",
    allergens: allergens ? [...allergens] : [],
    profile_picture_url: kid.profile_picture_url || null,
    favorite_foods: kid.favorite_foods ? [...kid.favorite_foods] : [],
  };
}

/** The allergen list the form would save, or null for "not recorded". */
function effectiveAllergens(form: KidFormState): string[] | null {
  if (form.allergenStatus === "unknown") return null;
  if (form.allergenStatus === "none") return [];
  return normalizeKidAllergenInput(form.allergens);
}

function isoDob(date: Date | undefined): string | null {
  return date ? format(date, "yyyy-MM-dd") : null;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function sameForm(a: KidFormState, b: KidFormState): boolean {
  const la = effectiveAllergens(a);
  const lb = effectiveAllergens(b);
  return (
    a.name.trim() === b.name.trim() &&
    isoDob(a.date_of_birth) === isoDob(b.date_of_birth) &&
    a.notes.trim() === b.notes.trim() &&
    (la === null ? lb === null : lb !== null && sameList(la, lb)) &&
    (a.profile_picture_url ?? null) === (b.profile_picture_url ?? null) &&
    sameList(a.favorite_foods, b.favorite_foods)
  );
}

/** Allergens on the snapshot that the form no longer lists. "Not sure yet" in edit mode leaves the list alone. */
function removedAllergens(snapshot: KidFormState, form: KidFormState): string[] {
  const before = effectiveAllergens(snapshot);
  const after = effectiveAllergens(form);
  if (!before || after === null) return [];
  const kept = new Set(after.map((a) => canonicalAllergen(a)));
  return before.filter((a) => !kept.has(canonicalAllergen(a)));
}

function threeYearsAgoMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear() - 3, now.getMonth(), 1);
}

export interface ManageKidsDialogRef {
  openForAdd: () => void;
  /** An empty id opens the Add form (kept for older callers). */
  openForEdit: (kidId: string) => void;
}

const ManageKidsDialogComponent = forwardRef<ManageKidsDialogRef>((_props, ref) => {
  const { t, i18n } = useTranslation();
  const { kids, addKid, updateKid, deleteKid } = useKids();
  const { planEntries } = usePlan();
  const uid = useId();
  const ids = {
    name: `${uid}-name`,
    nameError: `${uid}-name-error`,
    dob: `${uid}-dob`,
    notes: `${uid}-notes`,
    notesCount: `${uid}-notes-count`,
    photo: `${uid}-photo`,
    photoHint: `${uid}-photo-hint`,
    otherAllergen: `${uid}-other-allergen`,
    allergenError: `${uid}-allergen-error`,
    saveError: `${uid}-save-error`,
    month: `${uid}-month`,
    year: `${uid}-year`,
    deleteName: `${uid}-delete-name`,
  };

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingKid, setEditingKid] = useState<Kid | null>(null);
  const [snapshot, setSnapshot] = useState<KidFormState>(EMPTY_FORM);
  const [formData, setFormData] = useState<KidFormState>(EMPTY_FORM);
  const [otherAllergen, setOtherAllergen] = useState("");
  const [uploading, setUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameError, setNameError] = useState("");
  const [allergenError, setAllergenError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<string[] | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<Date>(threeYearsAgoMonth);
  const [dobOpen, setDobOpen] = useState(false);

  // Photos uploaded during this open session that no saved record points at yet.
  const sessionUploads = useRef<string[]>([]);

  const isEdit = editingId !== null;
  const dirty = !sameForm(formData, snapshot);

  const monthNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, { month: "long" });
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2000, i, 1)));
  }, [i18n.language]);

  const dobFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" }),
    [i18n.language],
  );

  const allergenLabel = useCallback(
    (value: string) => {
      const picker = KID_ALLERGEN_PICKER.find((p) => p.value === value);
      return picker ? t(picker.labelKey, { defaultValue: value }) : value;
    },
    [t],
  );

  const revokePreview = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  // Revoke any preview left when the component unmounts.
  const previewRef = useRef<string | null>(null);
  previewRef.current = previewUrl;
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  const resetState = useCallback(() => {
    setFormData(EMPTY_FORM);
    setSnapshot(EMPTY_FORM);
    setEditingId(null);
    setEditingKid(null);
    setOtherAllergen("");
    setNameError("");
    setAllergenError("");
    setSaveError("");
    setPendingRemoval(null);
    setConfirmDiscard(false);
    setDeleteOpen(false);
    setDeleteConfirmName("");
    setCalendarMonth(threeYearsAgoMonth());
    revokePreview();
  }, [revokePreview]);

  /** Close for real: drop unsaved uploads, reset, hide. */
  const finalizeClose = useCallback(() => {
    const orphans = sessionUploads.current;
    sessionUploads.current = [];
    for (const url of orphans) void deleteStorageObject(url);
    setOpen(false);
    resetState();
  }, [resetState]);

  const requestClose = useCallback(() => {
    if (isSubmitting) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    finalizeClose();
  }, [dirty, finalizeClose, isSubmitting]);

  const handleOpenChange = (next: boolean) => {
    if (next) setOpen(true);
    else requestClose();
  };

  const openForAdd = useCallback(() => {
    resetState();
    setOpen(true);
  }, [resetState]);

  const openForEdit = useCallback(
    (kidId: string) => {
      if (!kidId) {
        openForAdd();
        return;
      }
      const kid = kids.find((k) => k.id === kidId);
      if (!kid) {
        toast.error(t("kids.dialog.notFound", { defaultValue: "That child profile couldn't be found." }));
        return;
      }
      resetState();
      const form = formFromKid(kid);
      setEditingId(kid.id);
      setEditingKid(kid);
      setSnapshot(form);
      setFormData(form);
      const dob = form.date_of_birth;
      setCalendarMonth(dob ? new Date(dob.getFullYear(), dob.getMonth(), 1) : threeYearsAgoMonth());
      setOpen(true);
    },
    [kids, openForAdd, resetState, t],
  );

  useImperativeHandle(ref, () => ({ openForAdd, openForEdit }), [openForAdd, openForEdit]);

  const calculateAge = (dob: Date) => differenceInYears(new Date(), dob);

  const buildAddPayload = (form: KidFormState): Omit<Kid, "id" | "allergens"> & { allergens?: string[] | null } => {
    const payload: Omit<Kid, "id" | "allergens"> & { allergens?: string[] | null } = {
      name: form.name.trim().slice(0, NAME_MAX),
      // "Not sure yet" is recorded as null; the column default would say "none".
      allergens: effectiveAllergens(form),
    };
    const dob = isoDob(form.date_of_birth);
    if (dob) payload.date_of_birth = dob;
    const notes = form.notes.trim().slice(0, NOTES_MAX);
    if (notes) payload.notes = notes;
    if (form.profile_picture_url) payload.profile_picture_url = form.profile_picture_url;
    if (form.favorite_foods.length > 0) payload.favorite_foods = [...form.favorite_foods];
    return payload;
  };

  /** Only the fields that differ from the snapshot. A cleared field is sent as null or []. */
  const buildEditPatch = (form: KidFormState, base: KidFormState): KidPatch => {
    const patch: KidPatch = {};
    const name = form.name.trim().slice(0, NAME_MAX);
    if (name !== base.name.trim()) patch.name = name;
    const dob = isoDob(form.date_of_birth);
    if (dob !== isoDob(base.date_of_birth)) patch.date_of_birth = dob;
    const notes = form.notes.trim().slice(0, NOTES_MAX);
    if (notes !== base.notes.trim()) patch.notes = notes || null;
    if ((form.profile_picture_url ?? null) !== (base.profile_picture_url ?? null)) {
      patch.profile_picture_url = form.profile_picture_url ?? null;
    }
    if (!sameList(form.favorite_foods, base.favorite_foods)) patch.favorite_foods = [...form.favorite_foods];
    // "Not sure yet" in edit mode omits the key: it never erases a recorded answer.
    const next = effectiveAllergens(form);
    const prev = effectiveAllergens(base);
    if (next !== null && (prev === null || !sameList(next, prev))) {
      patch.allergens = next;
      const severity = editingKid?.allergen_severity;
      if (severity && Object.keys(severity).length > 0) {
        const pruned = pruneAllergenSeverity(next, severity);
        if (Object.keys(pruned).length !== Object.keys(severity).length) patch.allergen_severity = pruned;
      }
    }
    return patch;
  };

  const cleanupPhotosAfterSave = (savedUrl: string | null) => {
    const uploads = sessionUploads.current;
    sessionUploads.current = [];
    for (const url of uploads) {
      if (url !== savedUrl) void deleteStorageObject(url);
    }
    if (isEdit) void deleteReplacedStorageObject(snapshot.profile_picture_url, savedUrl);
  };

  const commit = async () => {
    setSaveError("");
    setIsSubmitting(true);
    const form = formData;
    const displayName = form.name.trim();
    try {
      const ok = editingId
        ? await updateKid(editingId, buildEditPatch(form, snapshot))
        : await addKid(buildAddPayload(form));
      if (!ok) {
        // Keep the dialog open with everything the parent entered.
        setSaveError(
          t("kids.dialog.saveFailed", {
            defaultValue: "Couldn't save. Your changes are still here, so try again.",
          }),
        );
        return;
      }
      cleanupPhotosAfterSave(form.profile_picture_url);
      toast.success(
        editingId
          ? t("kids.dialog.toast.updated", { name: displayName, defaultValue: "{{name}}'s profile saved" })
          : t("kids.dialog.toast.added", { name: displayName, defaultValue: "{{name}} added" }),
      );
      setOpen(false);
      resetState();
    } catch (error) {
      logger.error("Error saving child:", error);
      setSaveError(
        t("kids.dialog.saveFailed", {
          defaultValue: "Couldn't save. Your changes are still here, so try again.",
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (uploading || isSubmitting) return;
    let invalid = false;
    if (!formData.name.trim()) {
      setNameError(t("kids.dialog.name.required", { defaultValue: "Please enter a name" }));
      invalid = true;
    } else {
      setNameError("");
    }
    const list = effectiveAllergens(formData);
    const removed = isEdit ? removedAllergens(snapshot, formData) : [];
    // "Has allergies" with nothing picked only makes sense as removing the last one.
    if (formData.allergenStatus === "has" && list && list.length === 0 && removed.length === 0) {
      setAllergenError(
        t("kids.dialog.allergens.pickOne", {
          defaultValue: "Pick at least one allergen, or choose No known allergies.",
        }),
      );
      invalid = true;
    } else {
      setAllergenError("");
    }
    if (invalid) return;
    if (removed.length > 0) {
      setPendingRemoval(removed);
      return;
    }
    void commit();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    // Allow picking the same file again after a failure or removal.
    input.value = "";
    if (!file) return;

    const ext = PHOTO_EXTENSIONS[file.type];
    if (!ext) {
      toast.error(t("kids.dialog.photo.badType", { defaultValue: "Please choose a JPEG, PNG or WebP image" }));
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      toast.error(t("kids.dialog.photo.tooBig", { defaultValue: "Image must be less than 5MB" }));
      return;
    }

    revokePreview();
    const preview = typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null;
    setPreviewUrl(preview);

    try {
      setUploading(true);
      const user = await supabase.auth.getUser();
      if (!user.data.user) throw new Error("Not authenticated");

      // US-627: a random object name instead of a timestamp. The bucket is still
      // public-read by URL for shipped iOS builds, so the path itself has to be
      // unguessable now that it can no longer be enumerated.
      const fileName = `${user.data.user.id}/${generateId()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("profile-pictures")
        .upload(fileName, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("profile-pictures").getPublicUrl(fileName);

      // US-628: nothing is deleted here. The original is removed only once a
      // save points the record elsewhere, and unsaved uploads on close.
      sessionUploads.current.push(publicUrl);
      setFormData((prev) => ({ ...prev, profile_picture_url: publicUrl }));
    } catch (error) {
      logger.error("Error uploading image:", error);
      toast.error(t("kids.dialog.photo.uploadFailed", { defaultValue: "Failed to upload image" }));
      revokePreview();
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = () => {
    revokePreview();
    setFormData((prev) => ({ ...prev, profile_picture_url: null }));
  };

  const setAllergenStatus = (status: AllergenStatus) => {
    setAllergenError("");
    setFormData((prev) => ({ ...prev, allergenStatus: status }));
  };

  const toggleAllergen = (allergen: string) => {
    setAllergenError("");
    setFormData((prev) => ({
      ...prev,
      allergenStatus: "has",
      allergens: prev.allergens.includes(allergen)
        ? prev.allergens.filter((a) => a !== allergen)
        : [...prev.allergens, allergen],
    }));
  };

  const addOtherAllergen = () => {
    const text = otherAllergen.trim();
    if (!text) return;
    setAllergenError("");
    setFormData((prev) => ({
      ...prev,
      allergenStatus: "has",
      allergens: normalizeKidAllergenInput([...prev.allergens, text]),
    }));
    setOtherAllergen("");
  };

  const toggleFavoriteFood = (food: string) => {
    setFormData((prev) => ({
      ...prev,
      favorite_foods: prev.favorite_foods.includes(food)
        ? prev.favorite_foods.filter((f) => f !== food)
        : [...prev.favorite_foods, food],
    }));
  };

  const hasPlanEntries = useMemo(
    () => (editingId ? planEntries.some((e) => e.kid_id === editingId) : false),
    [planEntries, editingId],
  );
  const deleteNameMatches =
    !hasPlanEntries || deleteConfirmName.trim().toLowerCase() === snapshot.name.trim().toLowerCase();

  const handleDelete = async () => {
    if (!editingId || !deleteNameMatches) return;
    const name = snapshot.name.trim();
    setIsDeleting(true);
    try {
      const ok = await deleteKid(editingId);
      setDeleteOpen(false);
      setDeleteConfirmName("");
      if (ok) {
        toast.success(t("kids.dialog.toast.removed", { name, defaultValue: "{{name}} removed" }));
        finalizeClose();
      }
      // On failure KidsContext has already rolled back and said so.
    } finally {
      setIsDeleting(false);
    }
  };

  const currentAllergens = effectiveAllergens(formData) ?? [];
  const allergenCanon = new Set(currentAllergens.map((a) => canonicalAllergen(a)));
  const customAllergens = formData.allergens.filter((a) => !PICKER_VALUES.has(a));
  const avatarSrc = previewUrl ?? formData.profile_picture_url ?? undefined;
  const currentYear = new Date().getFullYear();

  const statusOptions: { value: AllergenStatus; label: string }[] = [
    { value: "has", label: t("kids.dialog.allergens.status.has", { defaultValue: "Has allergies" }) },
    { value: "none", label: t("kids.dialog.allergens.status.none", { defaultValue: "No known allergies" }) },
    { value: "unknown", label: t("kids.dialog.allergens.status.unknown", { defaultValue: "Not sure yet" }) },
  ];

  const kidName = formData.name.trim() || snapshot.name.trim();

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[90dvh] overflow-hidden flex flex-col gap-0 p-0">
          <DialogHeader className="px-4 pt-6 pb-3 sm:px-6">
            <DialogTitle>
              {isEdit
                ? t("kids.dialog.title.edit", { defaultValue: "Edit child" })
                : t("kids.dialog.title.add", { defaultValue: "Add child" })}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? t("kids.dialog.description.edit", { defaultValue: "Update this child's details" })
                : t("kids.dialog.description.add", {
                    defaultValue: "Add a child so meal plans fit what they can and will eat",
                  })}
            </DialogDescription>
          </DialogHeader>

          <form
            id={FORM_ID}
            onSubmit={handleSubmit}
            noValidate
            className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6"
          >
            <div className="space-y-5 px-1">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor={ids.name}>{t("kids.dialog.name.label", { defaultValue: "Child's name" })}</Label>
                <Input
                  id={ids.name}
                  value={formData.name}
                  maxLength={NAME_MAX}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData((prev) => ({ ...prev, name: value }));
                    if (nameError && value.trim()) setNameError("");
                  }}
                  placeholder={t("kids.dialog.name.placeholder", { defaultValue: "Enter name" })}
                  autoFocus={!isEdit}
                  autoComplete="off"
                  aria-invalid={!!nameError}
                  aria-describedby={nameError ? ids.nameError : undefined}
                  className={nameError ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {nameError && (
                  <p id={ids.nameError} className="text-sm text-destructive">{nameError}</p>
                )}
              </div>

              {/* Allergens */}
              <fieldset className="space-y-3" aria-describedby={allergenError ? ids.allergenError : undefined}>
                <legend className="text-sm font-medium leading-none mb-3">
                  {t("kids.dialog.allergens.legend", { defaultValue: "Food allergies" })}
                </legend>
                <div className="grid grid-cols-3 gap-1 rounded-lg border bg-muted p-1">
                  {statusOptions.map((opt) => (
                    <label key={opt.value} htmlFor={`${uid}-allergen-status-${opt.value}`} className="relative flex">
                      <input
                        id={`${uid}-allergen-status-${opt.value}`}
                        type="radio"
                        name={`${uid}-allergen-status`}
                        value={opt.value}
                        checked={formData.allergenStatus === opt.value}
                        onChange={() => setAllergenStatus(opt.value)}
                        className="peer sr-only"
                      />
                      <span
                        className={cn(
                          "flex min-h-11 w-full cursor-pointer items-center justify-center rounded-md px-2 text-center text-xs font-medium text-muted-foreground transition-colors sm:text-sm",
                          "peer-checked:bg-background peer-checked:text-foreground peer-checked:shadow-sm",
                          "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
                        )}
                      >
                        {opt.label}
                      </span>
                    </label>
                  ))}
                </div>

                {formData.allergenStatus === "has" && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {KID_ALLERGEN_PICKER.map(({ value }) => {
                        const pressed = formData.allergens.includes(value);
                        return (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={pressed}
                            onClick={() => toggleAllergen(value)}
                            className={cn(
                              "inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-sm capitalize transition-colors",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                              pressed
                                ? "border-destructive bg-destructive text-destructive-foreground"
                                : "border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
                            )}
                          >
                            {pressed && <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
                            {allergenLabel(value)}
                          </button>
                        );
                      })}
                      {customAllergens.map((value) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={true}
                          onClick={() => toggleAllergen(value)}
                          className={cn(
                            "inline-flex min-h-11 items-center gap-1 rounded-full border border-destructive bg-destructive px-3 text-sm text-destructive-foreground transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          )}
                        >
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          {value}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={ids.otherAllergen} className="text-xs text-muted-foreground">
                        {t("kids.dialog.allergens.otherLabel", { defaultValue: "Other allergen" })}
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id={ids.otherAllergen}
                          value={otherAllergen}
                          maxLength={50}
                          onChange={(e) => setOtherAllergen(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addOtherAllergen();
                            }
                          }}
                          placeholder={t("kids.dialog.allergens.otherPlaceholder", {
                            defaultValue: "For example kiwi or mustard",
                          })}
                          className="min-h-11"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          onClick={addOtherAllergen}
                          disabled={!otherAllergen.trim()}
                        >
                          <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                          {t("kids.dialog.allergens.add", { defaultValue: "Add" })}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                {allergenError && (
                  <p id={ids.allergenError} className="text-sm text-destructive">{allergenError}</p>
                )}
              </fieldset>

              {/* Date of birth */}
              <div className="space-y-2">
                <Label id={`${ids.dob}-label`} htmlFor={ids.dob}>
                  {t("kids.dialog.dob.label", { defaultValue: "Date of birth" })}
                </Label>
                <Popover open={dobOpen} onOpenChange={setDobOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id={ids.dob}
                      type="button"
                      variant="outline"
                      aria-labelledby={`${ids.dob}-label ${ids.dob}`}
                      className={cn(
                        "w-full min-h-11 justify-start text-left font-normal",
                        !formData.date_of_birth && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                      {formData.date_of_birth ? (
                        <>
                          <span data-testid="kid-dob-value">{dobFormatter.format(formData.date_of_birth)}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {t("kids.dialog.dob.age", {
                              age: calculateAge(formData.date_of_birth),
                              defaultValue: "(Age {{age}})",
                            })}
                          </span>
                        </>
                      ) : (
                        <span>{t("kids.dialog.dob.placeholder", { defaultValue: "Pick a date" })}</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="p-3 border-b space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label id={ids.month} className="text-xs">
                            {t("kids.dialog.dob.month", { defaultValue: "Month" })}
                          </Label>
                          <Select
                            value={calendarMonth.getMonth().toString()}
                            onValueChange={(value) =>
                              setCalendarMonth((prev) => new Date(prev.getFullYear(), parseInt(value, 10), 1))
                            }
                          >
                            <SelectTrigger className="h-9" aria-labelledby={ids.month}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {monthNames.map((label, i) => (
                                <SelectItem key={i} value={i.toString()}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label id={ids.year} className="text-xs">
                            {t("kids.dialog.dob.year", { defaultValue: "Year" })}
                          </Label>
                          <Select
                            value={calendarMonth.getFullYear().toString()}
                            onValueChange={(value) =>
                              setCalendarMonth((prev) => new Date(parseInt(value, 10), prev.getMonth(), 1))
                            }
                          >
                            <SelectTrigger className="h-9" aria-labelledby={ids.year}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-[200px]">
                              {Array.from({ length: currentYear - 1999 }, (_, i) => {
                                const year = currentYear - i;
                                return (
                                  <SelectItem key={year} value={year.toString()}>
                                    {year}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                    <Calendar
                      mode="single"
                      selected={formData.date_of_birth}
                      onSelect={(date) => {
                        setFormData((prev) => ({ ...prev, date_of_birth: date ?? undefined }));
                        if (date) setDobOpen(false);
                      }}
                      disabled={(date) => date > new Date() || date < new Date(1900, 0, 1)}
                      month={calendarMonth}
                      onMonthChange={(m) => setCalendarMonth(new Date(m.getFullYear(), m.getMonth(), 1))}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                {formData.date_of_birth && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-11 px-2 text-muted-foreground"
                    onClick={() => setFormData((prev) => ({ ...prev, date_of_birth: undefined }))}
                  >
                    {t("kids.dialog.dob.clear", { defaultValue: "Clear date of birth" })}
                  </Button>
                )}
              </div>

              {/* Photo */}
              <div className="space-y-2">
                <Label htmlFor={ids.photo}>{t("kids.dialog.photo.label", { defaultValue: "Profile picture" })}</Label>
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16 shrink-0">
                    {/* US-634: a stored object needs signing; KidAvatarImage passes a blob: preview through untouched. */}
                    <KidAvatarImage src={avatarSrc} />
                    <AvatarFallback>
                      <UserCircle className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 space-y-1">
                    <Input
                      id={ids.photo}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleImageUpload}
                      disabled={uploading}
                      aria-describedby={ids.photoHint}
                      className="cursor-pointer"
                    />
                    <p id={ids.photoHint} className="text-xs text-muted-foreground">
                      {uploading
                        ? t("kids.dialog.photo.uploading", { defaultValue: "Uploading..." })
                        : t("kids.dialog.photo.hint", { defaultValue: "JPEG, PNG or WebP, up to 5MB" })}
                    </p>
                    {(formData.profile_picture_url || previewUrl) && !uploading && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-11 px-2 text-muted-foreground"
                        onClick={removePhoto}
                      >
                        <X className="h-4 w-4 mr-1" aria-hidden="true" />
                        {t("kids.dialog.photo.remove", { defaultValue: "Remove photo" })}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor={ids.notes}>{t("kids.dialog.notes.label", { defaultValue: "Notes (optional)" })}</Label>
                <Textarea
                  id={ids.notes}
                  value={formData.notes}
                  maxLength={NOTES_MAX}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData((prev) => ({ ...prev, notes: value }));
                  }}
                  placeholder={t("kids.dialog.notes.placeholder", {
                    defaultValue: "Dietary needs, textures, anything a caregiver should know",
                  })}
                  rows={3}
                  aria-describedby={ids.notesCount}
                />
                <p id={ids.notesCount} className="text-right text-xs text-muted-foreground tabular-nums">
                  {t("kids.dialog.notes.count", {
                    used: formData.notes.length,
                    max: NOTES_MAX,
                    defaultValue: "{{used}}/{{max}}",
                  })}
                </p>
              </div>

              {/* Favorite foods */}
              <fieldset className="space-y-3">
                <legend className="flex items-center gap-2 text-sm font-medium leading-none mb-1">
                  <Heart className="h-4 w-4 text-primary" aria-hidden="true" />
                  {t("kids.dialog.favorites.legend", { defaultValue: "Favorite foods" })}
                </legend>
                <p className="text-xs text-muted-foreground">
                  {t("kids.dialog.favorites.help", {
                    defaultValue: "Pick foods your child enjoys to personalize meal suggestions",
                  })}
                </p>
                <div className="flex flex-wrap gap-2">
                  {COMMON_FOODS.map((food) => {
                    const pressed = formData.favorite_foods.includes(food.name);
                    const conflict = (food.allergens ?? []).find((a) => allergenCanon.has(canonicalAllergen(a)));
                    const disabled = !!conflict && !pressed;
                    return (
                      <button
                        key={food.name}
                        type="button"
                        aria-pressed={pressed}
                        disabled={disabled}
                        onClick={() => toggleFavoriteFood(food.name)}
                        className={cn(
                          "inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-sm transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          "disabled:cursor-not-allowed disabled:opacity-60",
                          pressed
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
                        )}
                      >
                        {pressed && <Heart className="h-3 w-3" aria-hidden="true" />}
                        {food.name}
                        {conflict && (
                          <span className={cn("text-xs", pressed ? "text-primary-foreground" : "text-destructive")}>
                            {t("kids.dialog.favorites.contains", {
                              allergen: allergenLabel(conflict),
                              defaultValue: "Contains {{allergen}}",
                            })}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          </form>

          <DialogFooter className="border-t bg-background px-4 py-3 sm:px-6 flex-col gap-2 sm:flex-row sm:items-center sm:space-x-0">
            {saveError && (
              <p id={ids.saveError} role="alert" className="text-sm text-destructive sm:mr-auto">
                {saveError}
              </p>
            )}
            {isEdit && !saveError && (
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 text-destructive hover:text-destructive sm:mr-auto"
                onClick={() => setDeleteOpen(true)}
                disabled={isSubmitting}
              >
                <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("kids.dialog.delete.button", { defaultValue: "Delete" })}
              </Button>
            )}
            <div className="flex gap-2 sm:ml-auto">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-1 sm:flex-none"
                onClick={requestClose}
                disabled={isSubmitting}
              >
                {t("kids.dialog.cancel", { defaultValue: "Cancel" })}
              </Button>
              <Button
                type="submit"
                form={FORM_ID}
                className="min-h-11 flex-1 sm:flex-none"
                disabled={isSubmitting || uploading}
                aria-describedby={saveError ? ids.saveError : undefined}
              >
                {(isSubmitting || uploading) && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />}
                {isSubmitting
                  ? t("kids.dialog.saving", { defaultValue: "Saving..." })
                  : isEdit
                    ? t("kids.dialog.save", { defaultValue: "Save changes" })
                    : t("kids.dialog.add", { defaultValue: "Add child" })}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Allergen removal confirmation */}
      <AlertDialog open={pendingRemoval !== null} onOpenChange={(v) => { if (!v) setPendingRemoval(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("kids.dialog.removeAllergen.title", { defaultValue: "Remove allergies?" })}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <ul className="space-y-2">
                {(pendingRemoval ?? []).map((a) => {
                  const label = allergenLabel(a);
                  return (
                    <li key={a}>
                      {t("kids.dialog.removeAllergen.item", {
                        allergen: label,
                        name: kidName,
                        defaultValue:
                          "Remove {{allergen}} from {{name}}'s allergies? Meals with {{allergen}} will start appearing in plans.",
                      })}
                    </li>
                  );
                })}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("kids.dialog.removeAllergen.keep", { defaultValue: "Keep them" })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setPendingRemoval(null);
                void commit();
              }}
            >
              {t("kids.dialog.removeAllergen.confirm", { defaultValue: "Remove and save" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Discard unsaved changes */}
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

      {/* Delete child */}
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
              {t("kids.dialog.delete.title", { name: snapshot.name, defaultValue: "Delete {{name}}?" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("kids.dialog.delete.description", {
                defaultValue: "This removes the profile from every device in your household.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div role="note" className="flex gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              {t("kids.dialog.delete.dataLoss", {
                name: snapshot.name,
                defaultValue:
                  "All meal plans, food tracking and settings for {{name}} will be deleted. This can't be undone.",
              })}
            </span>
          </div>
          {hasPlanEntries && (
            <div className="space-y-2">
              <Label htmlFor={ids.deleteName}>
                {t("kids.dialog.delete.typeName", {
                  name: snapshot.name,
                  defaultValue: "Type {{name}} to confirm",
                })}
              </Label>
              <Input
                id={ids.deleteName}
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                autoComplete="off"
                className="min-h-11"
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("kids.dialog.cancel", { defaultValue: "Cancel" })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Keep this dialog up until the delete settles.
                e.preventDefault();
                void handleDelete();
              }}
              disabled={!deleteNameMatches || isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />}
              {t("kids.dialog.delete.confirm", { defaultValue: "Delete profile" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

ManageKidsDialogComponent.displayName = "ManageKidsDialog";

export const ManageKidsDialog = ManageKidsDialogComponent;
