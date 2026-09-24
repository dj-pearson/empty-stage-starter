import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { useKids } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserCircle, ChevronDown, Users, UserPlus } from "lucide-react";
import { calculateAge } from "@/lib/utils";

const FAMILY = "family";

/**
 * Whose view the dashboard is showing: one child, or the whole family.
 *
 * A brand-new account has no children, and this used to render nothing at all
 * in that state, which left the one control in the header that is about
 * children silent at exactly the moment the parent needs to add one. It is a
 * link to the add-child form instead, once the kids load has settled (before
 * that, "no kids" is not yet known and the button would flash for everyone).
 */
export function KidSelector() {
  const { t } = useTranslation();
  const { kids, activeKidId, setActiveKid, kidsHydrated } = useKids();
  const activeKid = kids.find((k) => k.id === activeKidId);

  if (kids.length === 0) {
    if (!kidsHydrated) return null;
    return (
      <Button asChild variant="outline" size="sm" className="gap-2">
        <Link to="/dashboard/kids?new=1">
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          <span>{t("shell.kidSelector.addChild", { defaultValue: "Add your child" })}</span>
        </Link>
      </Button>
    );
  }

  const isFamilyMode = activeKidId === null;
  const familyLabel = t("shell.kidSelector.family", { defaultValue: "Family" });
  const displayName = isFamilyMode
    ? familyLabel
    : activeKid?.name || t("shell.kidSelector.selectChild", { defaultValue: "Select child" });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 w-full justify-between"
          aria-label={t("shell.viewingAs", { defaultValue: "Viewing as {{name}}", name: displayName })}
        >
          {isFamilyMode ? (
            <Users className="h-4 w-4" aria-hidden="true" />
          ) : (
            <UserCircle className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="flex-1 truncate text-left">{displayName}</span>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 z-50 bg-popover">
        <DropdownMenuLabel>{t("shell.kidSelector.showFor", { defaultValue: "Showing" })}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={activeKidId ?? FAMILY}
          onValueChange={(value) => setActiveKid(value === FAMILY ? null : value)}
        >
          <DropdownMenuRadioItem value={FAMILY}>
            <Users className="h-4 w-4 mr-2" aria-hidden="true" />
            {familyLabel}
            {kids.length > 1 && (
              <span className="ml-auto text-xs text-muted-foreground">
                {t("shell.kidSelector.kidCount", {
                  defaultValue: "{{count}} kids",
                  count: kids.length,
                })}
              </span>
            )}
          </DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          {kids.map((kid) => {
            const age = calculateAge(kid.date_of_birth);
            return (
              <DropdownMenuRadioItem key={kid.id} value={kid.id}>
                <UserCircle className="h-4 w-4 mr-2" aria-hidden="true" />
                <span className="truncate">{kid.name}</span>
                {age !== null && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {t("shell.kidSelector.age", { defaultValue: "Age {{age}}", age })}
                  </span>
                )}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
