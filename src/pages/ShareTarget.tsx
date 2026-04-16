import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { parseGroceryText, type ParsedGroceryItem } from '@/lib/parse-grocery-text';
import { ParsedItemsPreview } from '@/components/grocery/ParsedItemsPreview';
import { Loader2, Share2, ShoppingCart, LogIn, ChefHat, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import type { FoodCategory } from '@/types';

const SHARE_CACHE = 'share-target-cache';
const SESSION_KEY = 'share-target-pending';

interface ShareData {
  title?: string;
  text?: string;
  url?: string;
  imageBase64?: string;
  imageType?: string;
}

export default function ShareTarget() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addGroceryItem } = useApp();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedGroceryItem[] | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [sharedUrl, setSharedUrl] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'choose' | 'grocery' | 'recipe' | null>(null);
  const [recipeImporting, setRecipeImporting] = useState(false);

  useEffect(() => {
    loadShareData();
  }, []);

  async function loadShareData() {
    try {
      // Check authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Store a flag so we know to come back
        sessionStorage.setItem('returnTo', '/share?source=resume');
        setNeedsAuth(true);
        setLoading(false);
        return;
      }

      let shareData: ShareData | null = null;

      // Source 1: Service worker cache (from PWA share target)
      if (searchParams.get('source') === 'sw' || searchParams.get('source') === 'resume') {
        try {
          const cache = await caches.open(SHARE_CACHE);
          const response = await cache.match(new Request('/share-data'));
          if (response) {
            shareData = await response.json();
            // Clean up cache
            await cache.delete(new Request('/share-data'));
          }
        } catch {
          // Cache API may not be available
        }
      }

      // Source 2: URL query params (from GET-based share)
      if (!shareData) {
        const title = searchParams.get('title');
        const text = searchParams.get('text');
        const url = searchParams.get('url');
        if (title || text || url) {
          shareData = { title, text, url } as ShareData;
        }
      }

      // Source 3: sessionStorage (from pre-auth stash)
      if (!shareData) {
        const stashed = sessionStorage.getItem(SESSION_KEY);
        if (stashed) {
          shareData = JSON.parse(stashed);
          sessionStorage.removeItem(SESSION_KEY);
        }
      }

      if (!shareData) {
        toast.error('No shared content received');
        navigate('/dashboard/grocery');
        return;
      }

      // Process the shared data
      setProcessing(true);

      const detectedUrl = shareData.url || (shareData.text?.match(/https?:\/\/[^\s]+/)?.[0]);

      if (shareData.imageBase64) {
        setImportMode('choose');
        setSharedUrl(null);
      } else if (detectedUrl) {
        setSharedUrl(detectedUrl);
        setImportMode('choose');
      } else {
        setImportMode('grocery');
        const textContent = [shareData.title, shareData.text]
          .filter(Boolean)
          .join('\n');

        const items = parseGroceryText(textContent);
        if (items.length > 0) {
          setParsedItems(items);
        } else {
          toast.error('No items could be parsed from the shared text');
        }
      }
    } catch (err) {
      console.error('ShareTarget error:', err);
      toast.error('Something went wrong processing shared content');
    } finally {
      setLoading(false);
      setProcessing(false);
    }
  }

  const handleImportAsRecipe = async () => {
    if (!sharedUrl) return;
    setRecipeImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-recipe-grocery', {
        body: { url: sharedUrl },
      });
      if (error) throw error;
      if (data?.recipe) {
        navigate('/dashboard/recipes', { state: { importedRecipe: data.recipe, sourceUrl: sharedUrl } });
        toast.success('Recipe imported! Review and save it.');
      } else {
        toast.error('Could not extract a recipe from that URL');
      }
    } catch {
      toast.error('Failed to import recipe. Try opening it manually.');
    } finally {
      setRecipeImporting(false);
    }
  };

  const handleAddSelected = async (items: ParsedGroceryItem[]) => {
    setIsAdding(true);
    try {
      for (const item of items) {
        addGroceryItem({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          added_via: 'import',
        } as any);
      }
      toast.success(`Added ${items.length} item${items.length !== 1 ? 's' : ''} to grocery list`);
      navigate('/dashboard/grocery');
    } catch {
      toast.error('Failed to add items');
    } finally {
      setIsAdding(false);
    }
  };

  if (needsAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Helmet>
          <title>Sign In Required - EatPal</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <Card className="p-6 max-w-sm w-full text-center space-y-4">
          <LogIn className="h-10 w-10 mx-auto text-primary" />
          <h2 className="text-lg font-semibold">Sign in to continue</h2>
          <p className="text-sm text-muted-foreground">
            Sign in to add shared items to your grocery list.
          </p>
          <Button onClick={() => navigate('/auth')} className="w-full">
            Sign In
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Helmet>
        <title>Add to Grocery List - EatPal</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Card className="p-6 max-w-lg w-full space-y-4">
        <div className="flex items-center gap-3">
          <Share2 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Add to Grocery List</h1>
            <p className="text-sm text-muted-foreground">
              Review items from your shared content
            </p>
          </div>
        </div>

        {(loading || processing || recipeImporting) && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {loading ? 'Loading shared content...' : recipeImporting ? 'Importing recipe...' : 'Processing items...'}
            </p>
          </div>
        )}

        {!loading && !processing && !recipeImporting && importMode === 'choose' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">What would you like to do with this?</p>
            {sharedUrl && (
              <p className="text-xs text-muted-foreground truncate">{sharedUrl}</p>
            )}
            <button
              onClick={handleImportAsRecipe}
              className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-primary/20 hover:border-primary/40 bg-primary/5 transition-colors text-left"
            >
              <ChefHat className="h-6 w-6 text-primary shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-sm">Import as Recipe</p>
                <p className="text-xs text-muted-foreground">Extract ingredients, instructions, and more</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              onClick={() => {
                setImportMode('grocery');
                if (sharedUrl) {
                  toast.info('Paste items from the recipe into your grocery list');
                  navigate('/dashboard/grocery');
                }
              }}
              className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-border hover:border-primary/30 transition-colors text-left"
            >
              <ShoppingCart className="h-6 w-6 text-green-600 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-sm">Add to Grocery List</p>
                <p className="text-xs text-muted-foreground">Add ingredients as grocery items</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        )}

        {!loading && !processing && !recipeImporting && importMode === 'grocery' && parsedItems && (
          <ParsedItemsPreview
            items={parsedItems}
            onAddSelected={handleAddSelected}
            isAdding={isAdding}
          />
        )}

        {!loading && !processing && !recipeImporting && importMode !== 'choose' && !parsedItems && (
          <div className="text-center py-6 space-y-3">
            <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No items to display. Head to your grocery list to add items manually.
            </p>
            <Button onClick={() => navigate('/dashboard/grocery')} variant="outline">
              Go to Grocery List
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
