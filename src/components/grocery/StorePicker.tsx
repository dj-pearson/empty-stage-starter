import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isCatalogStore, storeDisplayName, type StoreLayoutRow } from "@/lib/storeLayouts";

/** The "no store" choice. Never a uuid, so never a store id. */
const TYPICAL_STORE = "__typical_store__";

interface StorePickerProps {
  stores: StoreLayoutRow[];
  selectedId: string | null;
  onChange: (storeId: string | null) => void;
}

/**
 * Which store this list is walked in. Changing it re-sorts the aisles; picking
 * "Typical store" clears it and falls back to the universal walk order.
 */
export function StorePicker({ stores, selectedId, onChange }: StorePickerProps) {
  const { t } = useTranslation();
  const labelId = useId();
  const own = stores.filter((s) => !isCatalogStore(s));
  const chains = stores.filter(isCatalogStore);
  const value = selectedId && stores.some((s) => s.id === selectedId) ? selectedId : TYPICAL_STORE;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span id={labelId} className="shrink-0 text-sm text-muted-foreground">
        {t("grocery.stores.picker.label", "Store")}
      </span>
      <Select value={value} onValueChange={(next) => onChange(next === TYPICAL_STORE ? null : next)}>
        <SelectTrigger className="h-11 min-w-0 flex-1" aria-labelledby={labelId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TYPICAL_STORE} className="min-h-11">
            {t("grocery.stores.picker.typical", "Typical store")}
          </SelectItem>
          {own.length > 0 && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>{t("grocery.stores.picker.yourStores", "Your stores")}</SelectLabel>
                {own.map((store) => (
                  <SelectItem key={store.id} value={store.id} className="min-h-11">
                    {storeDisplayName(store)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          )}
          {chains.length > 0 && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>{t("grocery.stores.picker.commonChains", "Common chains")}</SelectLabel>
                {chains.map((store) => (
                  <SelectItem key={store.id} value={store.id} className="min-h-11">
                    {storeDisplayName(store)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
