import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import "@/i18n/appLocale";
import { supabase } from "@/integrations/supabase/client";
import { generateId } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { deleteReplacedStorageObject, deleteStorageObject } from "@/lib/storageCleanup";

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Only these are accepted; the stored extension comes from the MIME type, never the file name. */
const PHOTO_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Profile photo uploads for the child editor.
 *
 * Nothing already stored is deleted on upload. An upload that no save ends up
 * pointing at is removed when the editor closes (discardUploads), and the photo
 * a save replaced is removed after that save (settleUploads, US-628).
 */
export function useKidPhotoUpload(onUploaded: (url: string) => void) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const sessionUploads = useRef<string[]>([]);
  // Set once the editor has closed without saving. An upload still in flight
  // at that point lands after discardUploads ran, so it removes itself.
  const discarded = useRef(false);

  const revokePreview = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const previewRef = useRef<string | null>(null);
  previewRef.current = previewUrl;
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const handleFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
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
      setPreviewUrl(typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null);

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

        const {
          data: { publicUrl },
        } = supabase.storage.from("profile-pictures").getPublicUrl(fileName);
        if (discarded.current) {
          void deleteStorageObject(publicUrl);
          return;
        }
        sessionUploads.current.push(publicUrl);
        onUploaded(publicUrl);
      } catch (error) {
        logger.error("Error uploading image:", error);
        toast.error(t("kids.dialog.photo.uploadFailed", { defaultValue: "Failed to upload image" }));
        revokePreview();
      } finally {
        setUploading(false);
      }
    },
    [onUploaded, revokePreview, t],
  );

  /** The editor closed without saving: drop every upload from this session. */
  const discardUploads = useCallback(() => {
    discarded.current = true;
    const orphans = sessionUploads.current;
    sessionUploads.current = [];
    for (const url of orphans) void deleteStorageObject(url);
    revokePreview();
  }, [revokePreview]);

  /** A save landed pointing at `savedUrl`: drop the other uploads and the photo it replaced. */
  const settleUploads = useCallback(
    (previousUrl: string | null, savedUrl: string | null) => {
      const uploads = sessionUploads.current;
      sessionUploads.current = [];
      for (const url of uploads) if (url !== savedUrl) void deleteStorageObject(url);
      if (previousUrl) void deleteReplacedStorageObject(previousUrl, savedUrl);
      revokePreview();
    },
    [revokePreview],
  );

  return { uploading, previewUrl, handleFile, revokePreview, discardUploads, settleUploads };
}
