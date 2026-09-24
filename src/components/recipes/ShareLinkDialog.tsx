import { useId } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, Link2, Link2Off, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useRecipeShareLink } from "@/hooks/useRecipeShareLink";
import { analytics } from "@/lib/analytics";
import type { Recipe } from "@/types";
import "@/i18n/appLocale";

interface ShareLinkDialogProps {
  recipe: Pick<Recipe, "id" | "name">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  return false;
}

/** Make, copy and revoke a recipe's public link. */
export function ShareLinkDialog({ recipe, open, onOpenChange }: ShareLinkDialogProps) {
  const { t } = useTranslation();
  const uid = useId();
  const { householdId } = useAuth();
  const { link, status, busy, ensure, revoke } = useRecipeShareLink(recipe.id, householdId, open);

  const copy = async (url: string) => {
    if (await copyText(url)) {
      toast.success(t("recipes.shareLink.copied", { defaultValue: "Link copied" }));
    } else {
      toast(t("recipes.shareLink.copyManually", { defaultValue: "Copy this link:" }), { description: url });
    }
  };

  const create = async () => {
    const next = await ensure();
    if (!next) {
      toast.error(t("recipes.shareLink.createFailed", { defaultValue: "Couldn't make a link. Please try again." }));
      return;
    }
    analytics.trackEvent("recipe_share_link_created", { recipe_id: recipe.id });
    await copy(next.url);
  };

  const stop = async () => {
    if (await revoke()) {
      analytics.trackEvent("recipe_share_link_revoked", { recipe_id: recipe.id });
      toast.success(t("recipes.shareLink.revoked", { defaultValue: "Link turned off. It no longer opens the recipe." }));
    } else {
      toast.error(t("recipes.shareLink.revokeFailed", { defaultValue: "Couldn't turn the link off. Please try again." }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("recipes.shareLink.title", { defaultValue: "Share a link" })}</DialogTitle>
          <DialogDescription>
            {t("recipes.shareLink.description", {
              defaultValue:
                "Anyone with the link sees {{name}}: the photo, ingredients and steps. Never your kids, allergies or notes.",
              name: recipe.name,
            })}
          </DialogDescription>
        </DialogHeader>

        {status === "loading" || status === "idle" ? (
          <div className="flex justify-center py-6" role="status">
            <Loader2 className="h-5 w-5 motion-safe:animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">{t("recipes.shareLink.loading", { defaultValue: "Checking for a link" })}</span>
          </div>
        ) : status === "error" ? (
          <p className="text-sm text-muted-foreground" role="alert">
            {t("recipes.shareLink.loadFailed", { defaultValue: "Couldn't check this recipe's link. Try again when you're online." })}
          </p>
        ) : link ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-url`}>{t("recipes.shareLink.label", { defaultValue: "Public link" })}</Label>
              <Input id={`${uid}-url`} readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="h-11 flex-1" onClick={() => void copy(link.url)} disabled={busy}>
                <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("recipes.shareLink.copy", { defaultValue: "Copy link" })}
              </Button>
              <Button variant="outline" className="h-11 flex-1" onClick={() => void stop()} disabled={busy}>
                <Link2Off className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("recipes.shareLink.revoke", { defaultValue: "Turn off link" })}
              </Button>
            </div>
          </div>
        ) : (
          <Button className="h-11 w-full" onClick={() => void create()} disabled={busy || !householdId}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
            ) : (
              <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {t("recipes.shareLink.create", { defaultValue: "Create and copy link" })}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
