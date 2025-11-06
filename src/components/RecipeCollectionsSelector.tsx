import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { RecipeCollection } from "@/types";
import { Folder, ChevronDown, Plus, Settings, Star, Heart, Zap, Pizza, Clock, Users, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

const ICON_MAP: Record<string, any> = {
  folder: Folder,
  star: Star,
  heart: Heart,
  zap: Zap,
  pizza: Pizza,
  clock: Clock,
  users: Users,
  sparkles: Sparkles,
};

const COLOR_CLASS_MAP: Record<string, string> = {
  primary: "text-primary",
  green: "text-green-600",
  red: "text-red-600",
  yellow: "text-yellow-600",
  purple: "text-purple-600",
  pink: "text-pink-600",
  orange: "text-orange-600",
  gray: "text-gray-600",
};

interface RecipeCollectionsSelectorProps {
  userId: string;
  householdId?: string;
  selectedCollectionId: string | null;
  onCollectionChange: (collectionId: string | null) => void;
  onCreateNew: () => void;
  onManageCollections: () => void;
  recipeCountsByCollection?: Record<string, number>;
}

export function RecipeCollectionsSelector({
  userId,
  householdId,
  selectedCollectionId,
  onCollectionChange,
  onCreateNew,
  onManageCollections,
  recipeCountsByCollection = {},
}: RecipeCollectionsSelectorProps) {
  const [collections, setCollections] = useState<RecipeCollection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCollections();
  }, [userId, householdId]);

  const loadCollections = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('recipe_collections')
        .select('*')
        .or(`user_id.eq.${userId}${householdId ? `,household_id.eq.${householdId}` : ''}`)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;

      setCollections(data as unknown as RecipeCollection[] || []);
    } catch (error) {
      logger.error('Error loading collections:', error);
      toast.error("Failed to load recipe collections");
    } finally {
      setLoading(false);
    }
  };

  const selectedCollection = selectedCollectionId
    ? collections.find(c => c.id === selectedCollectionId)
    : null;

  const SelectedIcon = selectedCollection?.icon 
    ? ICON_MAP[selectedCollection.icon] || Folder 
    : Folder;
  
  const selectedColorClass = selectedCollection?.color 
    ? COLOR_CLASS_MAP[selectedCollection.color] || "text-primary"
    : "text-primary";

  const totalRecipes = Object.values(recipeCountsByCollection).reduce((sum, count) => sum + count, 0);

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="min-w-[200px] justify-between">
            <div className="flex items-center gap-2">
              {selectedCollection ? (
                <>
                  <SelectedIcon className={`h-4 w-4 ${selectedColorClass}`} />
                  <span>{selectedCollection.name}</span>
                  {recipeCountsByCollection[selectedCollection.id] !== undefined && (
                    <Badge variant="secondary" className="ml-2">
                      {recipeCountsByCollection[selectedCollection.id]}
                    </Badge>
                  )}
                </>
              ) : (
                <>
                  <Folder className="h-4 w-4" />
                  <span>All Recipes</span>
                  {totalRecipes > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {totalRecipes}
                    </Badge>
                  )}
                </>
              )}
            </div>
            <ChevronDown className="h-4 w-4 ml-2 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[240px]">
          {/* All Recipes option */}
          <DropdownMenuItem onClick={() => onCollectionChange(null)}>
            <Folder className="h-4 w-4 mr-2" />
            <span className="flex-1">All Recipes</span>
            {totalRecipes > 0 && (
              <Badge variant="secondary" className="ml-2">
                {totalRecipes}
              </Badge>
            )}
          </DropdownMenuItem>

          {collections.length > 0 && <DropdownMenuSeparator />}

          {/* Collection list */}
          {collections.map((collection) => {
            const Icon = collection.icon ? ICON_MAP[collection.icon] || Folder : Folder;
            const colorClass = collection.color ? COLOR_CLASS_MAP[collection.color] || "text-primary" : "text-primary";
            const count = recipeCountsByCollection[collection.id] || 0;

            return (
              <DropdownMenuItem
                key={collection.id}
                onClick={() => onCollectionChange(collection.id)}
              >
                <Icon className={`h-4 w-4 mr-2 ${colorClass}`} />
                <span className="flex-1">{collection.name}</span>
                {count > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {count}
                  </Badge>
                )}
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator />

          {/* Actions */}
          <DropdownMenuItem onClick={onCreateNew}>
            <Plus className="h-4 w-4 mr-2" />
            Create Collection
          </DropdownMenuItem>

          {collections.length > 0 && (
            <DropdownMenuItem onClick={onManageCollections}>
              <Settings className="h-4 w-4 mr-2" />
              Manage Collections
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

