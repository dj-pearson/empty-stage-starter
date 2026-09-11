import { useState, useEffect, useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GroceryList } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { logger } from "@/lib/logger";
import { assertUUID } from "@/lib/query-sanitize";

interface GroceryListSelectorProps {
  userId: string;
  householdId?: string;
  selectedListId?: string | null;
  onListChange: (listId: string) => void;
  onCreateNew: () => void;
  onManageLists: () => void;
  /**
   * US-714: reports which list is the household default, so the page can treat
   * rows with a null grocery_list_id as belonging to it. The selector already
   * fetches the lists; nothing else on the page knows which one is default.
   */
  onDefaultListChange?: (listId: string | null) => void;
}

export function GroceryListSelector({
  userId,
  householdId,
  selectedListId,
  onListChange,
  onCreateNew,
  onManageLists,
  onDefaultListChange,
}: GroceryListSelectorProps) {
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [loading, setLoading] = useState(true);

  /*
   * US-864: this effect used to re-run because of its own side effect.
   *
   * `selectedListId` was in the dependency array, and the effect CHANGES it --
   * it calls onListChange(defaultList.id) to auto-select the default. So every
   * mount fetched the lists, selected one, and fetched them again because the
   * selection had changed. Measured on the built grocery page: 6 x
   * GET /rest/v1/grocery_lists per load (three per instance, and the page
   * renders a mobile tree and a desktop one).
   *
   * Which lists exist has nothing to do with which one is selected. The
   * selection is read through a ref so the effect can see it without being
   * re-triggered by it.
   *
   * THE CALLBACKS ARE HELD IN REFS TOO. `setSelectedListId` and
   * `setDefaultListId` happen to be stable today, so they were not part of the
   * measured problem -- but a caller passing an inline arrow would silently
   * reintroduce a fetch on every parent render, and nothing would catch it.
   * This component cannot control how it is called; it can control what
   * re-triggers its query.
   */
  const selectedListIdRef = useRef(selectedListId);
  selectedListIdRef.current = selectedListId;
  const onListChangeRef = useRef(onListChange);
  onListChangeRef.current = onListChange;
  const onDefaultListChangeRef = useRef(onDefaultListChange);
  onDefaultListChangeRef.current = onDefaultListChange;

  useEffect(() => {
    let cancelled = false;

    const loadLists = async () => {
      setLoading(true);
      try {
        const query = supabase
          .from('grocery_lists')
          .select('*')
          .eq('is_archived', false)
          .order('is_default', { ascending: false })
          .order('name');

        // Filter by user_id or household_id
        if (householdId) {
          query.or(`user_id.eq.${assertUUID(userId, 'userId')},household_id.eq.${assertUUID(householdId, 'householdId')}`);
        } else {
          query.eq('user_id', userId);
        }

        const { data, error } = await query;
        if (cancelled) return;

        if (!error && data) {
          const groceryLists = data as unknown as GroceryList[];
          setLists(groceryLists);

          const defaultList = groceryLists.find(l => l.is_default) || groceryLists[0];
          onDefaultListChangeRef.current?.(defaultList?.id ?? null);

          // Auto-select default list if none selected
          if (!selectedListIdRef.current && defaultList) {
            onListChangeRef.current(defaultList.id);
          }
        }
      } catch (err) {
        logger.error('Error loading grocery lists:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadLists();

    return () => {
      // A household resolving mid-flight would otherwise let the first
      // response land after the second and overwrite it.
      cancelled = true;
    };
  }, [userId, householdId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-10" />
      </div>
    );
  }

  if (lists.length === 0) {
    return (
      <Button onClick={onCreateNew} variant="outline">
        <Plus className="h-4 w-4 mr-2" />
        Create Your First List
      </Button>
    );
  }

  const selectedList = lists.find(l => l.id === selectedListId);

  return (
    <div className="flex items-center gap-2">
      <Select value={selectedListId || undefined} onValueChange={onListChange}>
        {/*
          US-778: the trigger needs its own name, not one borrowed from its
          contents. SelectValue renders the children below only when
          `selectedList` resolves, and shows the placeholder only when no value
          is set -- so a stored list id that is not in the fetched lists gives
          both an empty value and no placeholder, and the button ends up with no
          accessible name at all. axe rates that critical, and it is the state
          CI scans in.
        */}
        <SelectTrigger className="w-64" aria-label="Grocery list">
          <SelectValue placeholder="Select a list">
            {selectedList && (
              <div className="flex items-center gap-2">
                {selectedList.icon && <span>{selectedList.icon}</span>}
                <span>{selectedList.name}</span>
                {selectedList.is_default && (
                  <span className="text-xs text-muted-foreground">(Default)</span>
                )}
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {lists.map((list) => (
            <SelectItem key={list.id} value={list.id}>
              <div className="flex items-center gap-2">
                {list.icon && <span>{list.icon}</span>}
                <span>{list.name}</span>
                {list.is_default && (
                  <span className="text-xs text-muted-foreground ml-2">(Default)</span>
                )}
                {list.store_name && (
                  <span className="text-xs text-muted-foreground ml-2">
                    · {list.store_name}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button onClick={onCreateNew} variant="outline" size="icon" aria-label="Create new list">
        <Plus className="h-4 w-4" />
      </Button>

      <Button onClick={onManageLists} variant="outline" size="icon" aria-label="Manage lists">
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  );
}

