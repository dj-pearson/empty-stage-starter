import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { getStorage } from "@/lib/platform";
import { logger } from "@/lib/logger";
import { aislePromptDismissedKey, sortAislesByWalk, type StoreAisleRow } from "@/lib/storeLayouts";
import "@/i18n/appLocale";

interface PlaceInAisleChipsProps {
  aisles: StoreAisleRow[];
  onPick: (aisleName: string, aisleId: string) => void;
  onDismiss: () => void;
}

/**
 * "Which aisle is this in?" for an item the list's store has no place for.
 * One tap on a chip files it; "Not here" stops asking for this store, and that
 * choice survives a reload.
 */
export function PlaceInAisleChips({ aisles, onPick, onDismiss }: PlaceInAisleChipsProps) {
  const { t } = useTranslation();
  const storeId = aisles[0]?.store_layout_id ?? null;
  // Unknown until storage answers, so a dismissed prompt never flashes.
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    setDismissed(null);
    void (async () => {
      try {
        const storage = await getStorage();
        const value = await storage.getItem(aislePromptDismissedKey(storeId));
        if (!cancelled) setDismissed(value !== null);
      } catch (err) {
        logger.warn("Could not read the aisle prompt setting", err);
        if (!cancelled) setDismissed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  if (!storeId || dismissed !== false) return null;

  const handleNotHere = () => {
    setDismissed(true);
    void (async () => {
      try {
        const storage = await getStorage();
        await storage.setItem(aislePromptDismissedKey(storeId), new Date().toISOString());
      } catch (err) {
        logger.warn("Could not save the aisle prompt setting", err);
      }
    })();
    onDismiss();
  };

  return (
    <div
      role="group"
      aria-label={t("grocery.stores.place.label", "Which aisle is it in?")}
      className="flex gap-2 overflow-x-auto pb-1"
    >
      {sortAislesByWalk(aisles).map((aisle) => (
        <Button
          key={aisle.id}
          type="button"
          variant="outline"
          className="h-11 shrink-0 rounded-full px-4"
          onClick={() => onPick(aisle.aisle_name, aisle.id)}
        >
          {aisle.aisle_number?.trim()
            ? t("grocery.stores.place.numbered", {
                defaultValue: "{{number}} - {{name}}",
                number: aisle.aisle_number.trim(),
                name: aisle.aisle_name,
              })
            : aisle.aisle_name}
        </Button>
      ))}
      <Button type="button" variant="ghost" className="h-11 shrink-0 rounded-full px-4" onClick={handleNotHere}>
        {t("grocery.stores.place.notHere", "Not here")}
      </Button>
    </div>
  );
}
