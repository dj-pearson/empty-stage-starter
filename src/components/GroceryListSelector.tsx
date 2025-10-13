import { useState, useEffect } from "react";
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

interface GroceryListSelectorProps {
  userId: string;
  householdId?: string;
  selectedListId?: string | null;
  onListChange: (listId: string) => void;
  onCreateNew: () => void;
  onManageLists: () => void;
}

export function GroceryListSelector({
  userId,
  householdId,
  selectedListId,
  onListChange,
  onCreateNew,
  onManageLists,
}: GroceryListSelectorProps) {
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLists();
  }, [userId, householdId]);

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
        query.or(`user_id.eq.${userId},household_id.eq.${householdId}`);
      } else {
        query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (!error && data) {
        const groceryLists = data as unknown as GroceryList[];
        setLists(groceryLists);

        // Auto-select default list if none selected
        if (!selectedListId && groceryLists.length > 0) {
          const defaultList = groceryLists.find(l => l.is_default) || groceryLists[0];
          onListChange(defaultList.id);
        }
      }
    } catch (err) {
      console.error('Error loading grocery lists:', err);
    } finally {
      setLoading(false);
    }
  };

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
        <SelectTrigger className="w-64">
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

      <Button onClick={onCreateNew} variant="outline" size="icon">
        <Plus className="h-4 w-4" />
      </Button>

      <Button onClick={onManageLists} variant="outline" size="icon">
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  );
}

