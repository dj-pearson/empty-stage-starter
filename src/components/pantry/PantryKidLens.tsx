import { memo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Kid } from "@/types";
import "@/i18n/appLocale";

/** Which foods to show for the selected kid(s). "all" means no fit filter. */
export type PantryFitFilter = "all" | "eats" | "trying" | "avoid";

export interface PantryKidLensProps {
  kids: ReadonlyArray<Pick<Kid, "id" | "name">>;
  /** null is "All kids". */
  selectedKidId: string | null;
  onSelect: (kidId: string | null) => void;
  fitFilter: PantryFitFilter;
  onFitFilter: (f: PantryFitFilter) => void;
}

const chipClass = (pressed: boolean) =>
  cn(
    "inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 text-sm font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    pressed
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-background text-foreground hover:bg-muted"
  );

/**
 * "Whose pantry am I looking at": All kids or one kid, then what that kid
 * eats, is trying, or should avoid. Renders nothing without kids.
 */
export const PantryKidLens = memo(function PantryKidLens({
  kids,
  selectedKidId,
  onSelect,
  fitFilter,
  onFitFilter,
}: PantryKidLensProps) {
  const { t } = useTranslation();
  if (kids.length === 0) return null;

  const fits: { value: Exclude<PantryFitFilter, "all">; label: string }[] = [
    { value: "eats", label: t("pantry.lens.eats", "Eats it") },
    { value: "trying", label: t("pantry.lens.trying", "Trying") },
    { value: "avoid", label: t("pantry.lens.avoid", "Avoid") },
  ];

  return (
    <div className="flex items-center gap-2 overflow-x-auto py-1">
      <div
        role="group"
        aria-label={t("pantry.lens.kidsLabel", "Show foods for")}
        className="flex shrink-0 items-center gap-1.5"
      >
        <button
          type="button"
          aria-pressed={selectedKidId === null}
          onClick={() => onSelect(null)}
          className={chipClass(selectedKidId === null)}
        >
          {t("pantry.lens.allKids", "All kids")}
        </button>
        {kids.map((kid) => (
          <button
            key={kid.id}
            type="button"
            aria-pressed={selectedKidId === kid.id}
            onClick={() => onSelect(kid.id)}
            className={chipClass(selectedKidId === kid.id)}
          >
            {kid.name}
          </button>
        ))}
      </div>
      <span className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />
      <div
        role="group"
        aria-label={t("pantry.lens.fitLabel", "Filter by fit")}
        className="flex shrink-0 items-center gap-1.5"
      >
        {fits.map((f) => {
          const pressed = fitFilter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              aria-pressed={pressed}
              onClick={() => onFitFilter(pressed ? "all" : f.value)}
              className={chipClass(pressed)}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
});
