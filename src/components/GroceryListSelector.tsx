import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, RotateCw, Settings } from "lucide-react";
import type { GroceryListRow } from "@/hooks/useGroceryLists";

/** Select values that are actions, not lists. Never a uuid, so never a list id. */
const NEW_LIST = "__new_list__";
const MANAGE_LISTS = "__manage_lists__";

interface GroceryListSelectorProps {
  lists: GroceryListRow[];
  selectedListId: string | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onListChange: (listId: string) => void;
  onCreateNew: () => void;
  onManageLists: () => void;
  /** Second line under the list name, e.g. "6 left". */
  summary?: string;
}

/**
 * The list picker in the grocery toolbar. Presentational: the lists, the
 * selection and the fetch live in useGroceryLists, which is where the US-864
 * query-count guarantee now sits.
 */
export function GroceryListSelector({
  lists,
  selectedListId,
  loading,
  error,
  onRetry,
  onListChange,
  onCreateNew,
  onManageLists,
  summary,
}: GroceryListSelectorProps) {
  const { t } = useTranslation();

  if (lists.length === 0) {
    // A failed fetch is not an empty household: offering "Create your first
    // list" there would put a duplicate list on an account that already has one.
    if (error) {
      return (
        <div className="flex w-full items-center justify-between gap-2" role="status">
          <span className="text-sm text-muted-foreground">
            {t("grocery.lists.selector.loadFailed", "Couldn't load your lists")}
          </span>
          <Button variant="outline" className="h-11" onClick={onRetry}>
            <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("grocery.lists.selector.retry", "Try again")}
          </Button>
        </div>
      );
    }
    if (loading) {
      return <Skeleton className="h-12 w-full" aria-label={t("grocery.lists.selector.loading", "Loading lists")} />;
    }
    return (
      <Button onClick={onCreateNew} variant="outline" className="h-11 w-full">
        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
        {t("grocery.lists.selector.createFirst", "Create your first list")}
      </Button>
    );
  }

  const selectedList = lists.find((l) => l.id === selectedListId);

  const handleValueChange = (value: string) => {
    if (value === NEW_LIST) onCreateNew();
    else if (value === MANAGE_LISTS) onManageLists();
    else onListChange(value);
  };

  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <Select value={selectedListId ?? undefined} onValueChange={handleValueChange}>
        {/*
          US-778: the trigger carries its own name. A stored list id missing from
          the fetched lists leaves SelectValue with neither children nor a
          placeholder, and the button would otherwise have no accessible name.
        */}
        <SelectTrigger
          className="h-auto min-h-12 w-full min-w-0 py-1.5 text-left"
          aria-label={t("grocery.lists.selector.label", "Grocery list")}
        >
          <SelectValue placeholder={t("grocery.lists.selector.placeholder", "Select a list")}>
            {selectedList && (
              <span className="flex min-w-0 flex-col">
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  {selectedList.icon && <span aria-hidden="true">{selectedList.icon}</span>}
                  <span className="truncate">{selectedList.name}</span>
                </span>
                {summary && <span className="truncate text-xs text-muted-foreground">{summary}</span>}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {lists.map((list) => (
              <SelectItem key={list.id} value={list.id} className="min-h-11">
                <span className="flex items-center gap-2">
                  {list.icon && <span aria-hidden="true">{list.icon}</span>}
                  <span>{list.name}</span>
                  {list.is_default && (
                    <span className="text-xs text-muted-foreground">
                      {t("grocery.lists.selector.defaultTag", "(Default)")}
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectItem value={NEW_LIST} className="min-h-11">
              <span className="flex items-center gap-2">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("grocery.lists.selector.newList", "New list...")}
              </span>
            </SelectItem>
            <SelectItem value={MANAGE_LISTS} className="min-h-11">
              <span className="flex items-center gap-2">
                <Settings className="h-4 w-4" aria-hidden="true" />
                {t("grocery.lists.selector.manageLists", "Manage lists...")}
              </span>
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      {error && (
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={onRetry}
          aria-label={t("grocery.lists.selector.retryStale", "Lists may be out of date. Try again")}
        >
          <RotateCw className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
