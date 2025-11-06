import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ShoppingCart,
  Store,
  MapPin,
  Clock,
  DollarSign,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
  Package,
} from 'lucide-react';
import { Recipe, Food } from '@/types';
import { toast } from 'sonner';
import {
  createInstacartClient,
  trackInstacartUsage,
  type InstacartStore,
  type IngredientMatch,
  type InstacartProduct,
} from '@/lib/integrations/instacart';

interface OrderIngredientsDialogProps {
  recipe: Recipe;
  foods: Food[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * OrderIngredientsDialog Component
 * 
 * Phase 2.1 Implementation
 * Allows users to order recipe ingredients via Instacart
 */
export function OrderIngredientsDialog({
  recipe,
  foods,
  open,
  onOpenChange,
}: OrderIngredientsDialogProps) {
  const [step, setStep] = useState<'store' | 'matching' | 'review' | 'checkout'>('store');
  const [loading, setLoading] = useState(false);
  const [zipCode, setZipCode] = useState('');
  const [stores, setStores] = useState<InstacartStore[]>([]);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [ingredientMatches, setIngredientMatches] = useState<IngredientMatch[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Record<string, InstacartProduct>>({});
  const [cartUrl, setCartUrl] = useState<string | null>(null);

  // Get recipe ingredients
  const recipeIngredients = recipe.food_ids
    .map(id => foods.find(f => f.id === id))
    .filter(Boolean)
    .map(food => `${food?.quantity || 1} ${food?.unit || ''} ${food?.name}`.trim());

  const handleFindStores = async () => {
    if (!zipCode || zipCode.length < 5) {
      toast.error('Please enter a valid ZIP code');
      return;
    }

    setLoading(true);
    try {
      const { api } = await createInstacartClient();
      const foundStores = await api.getStores(zipCode);
      
      setStores(foundStores);
      
      if (foundStores.length === 0) {
        toast.error('No stores found in your area');
      } else {
        toast.success(`Found ${foundStores.length} stores nearby`);
      }
      
      await trackInstacartUsage('search', {
        recipeId: recipe.id,
        zipCode,
        storesFound: foundStores.length,
      });
    } catch (error) {
      logger.error('Error finding stores:', error);
      toast.error('Failed to find stores. Please try again.');
      await trackInstacartUsage('error', { error: 'store_search_failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectStore = async (storeId: string) => {
    setSelectedStore(storeId);
    setStep('matching');
    setLoading(true);

    try {
      const { matcher } = await createInstacartClient();
      const matches = await matcher.matchIngredients(recipeIngredients, storeId);
      
      setIngredientMatches(matches);
      
      // Auto-select best match for each ingredient
      const autoSelected: Record<string, InstacartProduct> = {};
      matches.forEach((match, index) => {
        if (match.matchedProducts.length > 0) {
          autoSelected[`ingredient_${index}`] = match.matchedProducts[0];
        }
      });
      setSelectedProducts(autoSelected);
      
      setStep('review');
      
      toast.success('Ingredients matched to products');
    } catch (error) {
      logger.error('Error matching ingredients:', error);
      toast.error('Failed to match ingredients');
      await trackInstacartUsage('error', { error: 'ingredient_matching_failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleProductSelect = (ingredientIndex: number, product: InstacartProduct) => {
    setSelectedProducts(prev => ({
      ...prev,
      [`ingredient_${ingredientIndex}`]: product,
    }));
  };

  const handleCreateCart = async () => {
    setLoading(true);
    
    try {
      const { api } = await createInstacartClient();
      
      // Build cart items from selected products
      const cartItems = Object.values(selectedProducts).map(product => ({
        productId: product.id,
        quantity: 1, // Could be adjusted based on recipe servings
      }));

      if (!selectedStore) {
        throw new Error('No store selected');
      }

      const order = await api.createCart(selectedStore, cartItems);
      const checkoutUrl = api.getCheckoutUrl(order.cartId);
      
      setCartUrl(checkoutUrl);
      setStep('checkout');
      
      toast.success('Cart created successfully!', {
        description: `Total: $${order.total.toFixed(2)}`,
      });
      
      await trackInstacartUsage('cart_created', {
        recipeId: recipe.id,
        storeId: selectedStore,
        itemCount: cartItems.length,
        total: order.total,
      });
    } catch (error) {
      logger.error('Error creating cart:', error);
      toast.error('Failed to create cart');
      await trackInstacartUsage('error', { error: 'cart_creation_failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = () => {
    if (cartUrl) {
      window.open(cartUrl, '_blank');
      trackInstacartUsage('checkout', {
        recipeId: recipe.id,
      });
      
      // Close dialog after opening checkout
      setTimeout(() => {
        onOpenChange(false);
        resetDialog();
      }, 1000);
    }
  };

  const resetDialog = () => {
    setStep('store');
    setZipCode('');
    setStores([]);
    setSelectedStore(null);
    setIngredientMatches([]);
    setSelectedProducts({});
    setCartUrl(null);
  };

  const selectedStoreInfo = stores.find(s => s.id === selectedStore);
  const totalItems = Object.keys(selectedProducts).length;
  const estimatedTotal = totalItems * 4.99; // Rough estimate

  return (
    <Dialog open={open} onOpenChange={(open) => {
      onOpenChange(open);
      if (!open) resetDialog();
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Order Ingredients: {recipe.name}
          </DialogTitle>
          <DialogDescription>
            {step === 'store' && 'Select a store near you'}
            {step === 'matching' && 'Matching ingredients to products...'}
            {step === 'review' && 'Review and customize your order'}
            {step === 'checkout' && 'Complete your purchase on Instacart'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          {/* Step 1: Select Store */}
          {step === 'store' && (
            <div className="space-y-4">
              <Alert>
                <Store className="h-4 w-4" />
                <AlertDescription>
                  Enter your ZIP code to find nearby stores with delivery or pickup options
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="zipcode">ZIP Code</Label>
                <div className="flex gap-2">
                  <Input
                    id="zipcode"
                    type="text"
                    placeholder="12345"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    maxLength={5}
                    onKeyDown={(e) => e.key === 'Enter' && handleFindStores()}
                  />
                  <Button onClick={handleFindStores} disabled={loading}>
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MapPin className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {stores.length > 0 && (
                <div className="space-y-2">
                  <Label>Available Stores</Label>
                  <div className="space-y-2">
                    {stores.map(store => (
                      <Card
                        key={store.id}
                        className="cursor-pointer hover:border-primary transition-colors"
                        onClick={() => handleSelectStore(store.id)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-semibold">{store.name}</h4>
                              <p className="text-sm text-muted-foreground">{store.address}</p>
                              <div className="flex gap-2 mt-2">
                                {store.deliveryAvailable && (
                                  <Badge variant="secondary" className="text-xs">
                                    <Clock className="h-3 w-3 mr-1" />
                                    Delivery
                                  </Badge>
                                )}
                                {store.pickupAvailable && (
                                  <Badge variant="secondary" className="text-xs">
                                    <Package className="h-3 w-3 mr-1" />
                                    Pickup
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {store.distance && (
                              <div className="text-right text-sm text-muted-foreground">
                                {store.distance.toFixed(1)} mi
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Matching (Loading) */}
          {step === 'matching' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Matching ingredients to products...</p>
            </div>
          )}

          {/* Step 3: Review Products */}
          {step === 'review' && (
            <div className="space-y-4">
              <Alert>
                <Check className="h-4 w-4" />
                <AlertDescription>
                  We've matched your ingredients. You can change products if needed.
                </AlertDescription>
              </Alert>

              {selectedStoreInfo && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Store className="h-4 w-4" />
                  <span>{selectedStoreInfo.name}</span>
                </div>
              )}

              <div className="space-y-3">
                {ingredientMatches.map((match, index) => {
                  const selectedProduct = selectedProducts[`ingredient_${index}`];
                  const hasLowConfidence = match.confidence < 0.6;

                  return (
                    <Card key={index}>
                      <CardContent className="p-4">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium">{match.ingredient}</p>
                              {hasLowConfidence && (
                                <Badge variant="destructive" className="mt-1">
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  Low confidence match
                                </Badge>
                              )}
                            </div>
                            {selectedProduct && (
                              <Badge variant="secondary">
                                ${selectedProduct.price.toFixed(2)}
                              </Badge>
                            )}
                          </div>

                          {match.matchedProducts.length > 0 ? (
                            <Select
                              value={selectedProduct?.id}
                              onValueChange={(productId) => {
                                const product = match.matchedProducts.find(p => p.id === productId);
                                if (product) {
                                  handleProductSelect(index, product);
                                }
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select product..." />
                              </SelectTrigger>
                              <SelectContent>
                                {match.matchedProducts.map(product => (
                                  <SelectItem key={product.id} value={product.id}>
                                    <div className="flex items-center justify-between gap-2">
                                      <span>{product.name}</span>
                                      <span className="text-muted-foreground text-sm">
                                        ${product.price.toFixed(2)}
                                      </span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Alert variant="destructive">
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription>
                                No matching products found. You'll need to add this manually.
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <Card className="bg-muted/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Estimated Subtotal</span>
                    <span className="font-semibold">${estimatedTotal.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    + delivery fees, service fees, and tax calculated at checkout
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 4: Checkout */}
          {step === 'checkout' && (
            <div className="space-y-4">
              <Alert>
                <Check className="h-4 w-4" />
                <AlertDescription>
                  Your cart is ready! Complete your purchase on Instacart.
                </AlertDescription>
              </Alert>

              <Card>
                <CardContent className="p-6 text-center">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-4 text-primary" />
                  <h3 className="font-semibold text-lg mb-2">Cart Created Successfully!</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Click below to complete your order on Instacart
                  </p>
                  <Button size="lg" onClick={handleCheckout} className="w-full">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Go to Instacart Checkout
                  </Button>
                </CardContent>
              </Card>

              <Alert>
                <DollarSign className="h-4 w-4" />
                <AlertDescription>
                  TryEatPal may earn a commission from your purchase at no extra cost to you.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          {step === 'review' && (
            <>
              <Button variant="outline" onClick={() => setStep('store')}>
                Back
              </Button>
              <Button
                onClick={handleCreateCart}
                disabled={loading || totalItems === 0}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ShoppingCart className="h-4 w-4 mr-2" />
                )}
                Create Cart ({totalItems} items)
              </Button>
            </>
          )}
          {step !== 'review' && step !== 'checkout' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

