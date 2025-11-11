import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ShoppingCart,
  Truck,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  Package,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface GroceryDeliveryPanelProps {
  householdId: string;
  className?: string;
}

interface Provider {
  id: string;
  provider_name: string;
  display_name: string;
  logo_url: string;
  delivery_fee: number;
  min_order_amount: number;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  item_count: number;
  total_amount: number;
  estimated_amount: number;
  delivery_window_start: string;
  delivery_window_end: string;
  provider_name: string;
  created_at: string;
}

const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  draft: { label: "Draft", icon: Package, color: "bg-gray-100 text-gray-700" },
  pending: { label: "Ready", icon: Clock, color: "bg-blue-100 text-blue-700" },
  submitted: { label: "Submitted", icon: Truck, color: "bg-purple-100 text-purple-700" },
  confirmed: { label: "Confirmed", icon: CheckCircle, color: "bg-green-100 text-green-700" },
  shopping: { label: "Shopping", icon: ShoppingCart, color: "bg-yellow-100 text-yellow-700" },
  out_for_delivery: { label: "Out for Delivery", icon: Truck, color: "bg-blue-100 text-blue-700" },
  delivered: { label: "Delivered", icon: CheckCircle, color: "bg-green-100 text-green-700" },
  cancelled: { label: "Cancelled", icon: XCircle, color: "bg-red-100 text-red-700" },
  failed: { label: "Failed", icon: AlertCircle, color: "bg-red-100 text-red-700" },
};

export function GroceryDeliveryPanel({ householdId, className }: GroceryDeliveryPanelProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showEstimate, setShowEstimate] = useState(false);
  const [estimate, setEstimate] = useState<any>(null);
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => {
    loadData();
  }, [householdId]);

  const loadData = async () => {
    try {
      setIsLoading(true);

      // Load providers
      // @ts-ignore - delivery_providers table exists but not in generated types yet
      const { data: providersData, error: providersError } = await supabase
        .from('delivery_providers')
        .select('*')
        .eq('is_active', true)
        .order('display_name');

      if (providersError) throw providersError;

      setProviders(providersData || []);

      // Load recent orders
      // @ts-ignore - grocery_delivery_orders table exists but not in generated types yet
      const { data: ordersData, error: ordersError } = await supabase
        .from('grocery_delivery_orders')
        .select(`
          id,
          order_number,
          status,
          item_count,
          total_amount,
          estimated_amount,
          delivery_window_start,
          delivery_window_end,
          created_at,
          delivery_providers(display_name)
        `)
        .eq('household_id', householdId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (ordersError) throw ordersError;

      setOrders(
        ordersData?.map((o: any) => ({
          ...o,
          provider_name: o.delivery_providers?.display_name,
        })) || []
      );
    } catch (error) {
      console.error('Error loading delivery data:', error);
      toast.error('Failed to load delivery options');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGetEstimate = async () => {
    if (!selectedProvider) {
      toast.error('Please select a delivery provider');
      return;
    }

    try {
      setIsCreating(true);

      // Get grocery list items
      // @ts-ignore - grocery_list columns exist but not in generated types yet
      const { data: groceryItems } = await supabase
        .from('grocery_list')
        .select(`
          quantity,
          foods(id, name, price, unit, category)
        `)
        .eq('household_id', householdId)
        .eq('purchased', false);

      if (!groceryItems || groceryItems.length === 0) {
        toast.error('No items in grocery list');
        return;
      }

      const items = groceryItems.map((item: any) => ({
        food_id: item.foods.id,
        name: item.foods.name,
        quantity: item.quantity,
        unit: item.foods.unit,
        category: item.foods.category,
        estimated_price: item.foods.price || 3.99,
      }));

      // Get estimate
      const response = await fetch(
        `https://tbuszxkevkpjcjapbrir.supabase.co/functions/v1/process-delivery-order`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({
            action: 'estimate',
            providerId: selectedProvider,
            items,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to get estimate');
      }

      const estimateData = await response.json();
      setEstimate(estimateData);
      setShowEstimate(true);
    } catch (error) {
      console.error('Error getting estimate:', error);
      toast.error('Failed to get cost estimate');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateOrder = async () => {
    try {
      setIsCreating(true);

      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        toast.error('Please sign in to create an order');
        return;
      }

      const response = await fetch(
        `https://tbuszxkevkpjcjapbrir.supabase.co/functions/v1/process-delivery-order`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({
            action: 'create',
            householdId,
            userId: user.id,
            providerId: selectedProvider,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to create order');
      }

      const { order } = await response.json();

      toast.success('Order created! Review and submit when ready.');
      setShowEstimate(false);
      await loadData();

      // Show the new order
      setSelectedOrder(order);
      setShowOrderDialog(true);
    } catch (error) {
      console.error('Error creating order:', error);
      toast.error('Failed to create order');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSubmitOrder = async (orderId: string) => {
    try {
      const response = await fetch(
        `https://tbuszxkevkpjcjapbrir.supabase.co/functions/v1/process-delivery-order`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({
            action: 'submit',
            orderId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to submit order');
      }

      const result = await response.json();

      toast.success(`Order submitted! Order #${result.order_number}`);
      setShowOrderDialog(false);
      await loadData();
    } catch (error) {
      console.error('Error submitting order:', error);
      toast.error('Failed to submit order');
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Grocery Delivery</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Grocery Delivery
              </CardTitle>
              <CardDescription>
                Order groceries from your meal plan
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Provider Selection */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Select Delivery Service</h3>
            <Select value={selectedProvider} onValueChange={setSelectedProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    <div className="flex items-center justify-between w-full">
                      <span>{provider.display_name}</span>
                      <span className="text-xs text-muted-foreground ml-4">
                        ${provider.delivery_fee} delivery
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              onClick={handleGetEstimate}
              disabled={!selectedProvider || isCreating}
              className="w-full"
            >
              <DollarSign className="h-4 w-4 mr-2" />
              {isCreating ? 'Getting Estimate...' : 'Get Cost Estimate'}
            </Button>
          </div>

          {/* Recent Orders */}
          {orders.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Recent Orders</h3>
                <div className="space-y-2">
                  {orders.slice(0, 5).map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onClick={() => {
                        setSelectedOrder(order);
                        setShowOrderDialog(true);
                      }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Estimate Dialog */}
      <Dialog open={showEstimate} onOpenChange={setShowEstimate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cost Estimate</DialogTitle>
            <DialogDescription>
              Estimated costs for your grocery delivery
            </DialogDescription>
          </DialogHeader>

          {estimate && (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Subtotal ({estimate.items_count} items)</span>
                <span className="font-medium">${estimate.subtotal}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Delivery Fee</span>
                <span className="font-medium">${estimate.delivery_fee}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Service Fee</span>
                <span className="font-medium">${estimate.service_fee}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Estimated Tax</span>
                <span className="font-medium">${estimate.tax}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Estimated Total</span>
                <span>${estimate.total}</span>
              </div>
              <p className="text-xs text-muted-foreground">{estimate.note}</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEstimate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateOrder} disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <Dialog open={showOrderDialog} onOpenChange={setShowOrderDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            {selectedOrder && (
              <DialogDescription>
                Order #{selectedOrder.order_number || 'Draft'}
              </DialogDescription>
            )}
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <OrderStatusBadge status={selectedOrder.status} />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Provider</span>
                <span className="font-medium">{selectedOrder.provider_name}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Items</span>
                <span className="font-medium">{selectedOrder.item_count}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-medium text-lg">
                  ${(selectedOrder.total_amount || selectedOrder.estimated_amount)?.toFixed(2)}
                </span>
              </div>

              {selectedOrder.status === 'draft' && (
                <Button
                  onClick={() => handleSubmitOrder(selectedOrder.id)}
                  className="w-full"
                >
                  Submit Order
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function OrderCard({ order, onClick }: { order: Order; onClick: () => void }) {
  const statusInfo = statusConfig[order.status] || statusConfig.draft;
  const Icon = statusInfo.icon;

  return (
    <div
      className="p-3 border rounded-lg hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm">
              {order.order_number || 'Draft Order'}
            </span>
            <OrderStatusBadge status={order.status} />
          </div>
          <div className="text-xs text-muted-foreground">
            {order.provider_name} · {order.item_count} items · $
            {(order.total_amount || order.estimated_amount)?.toFixed(2)}
          </div>
        </div>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
    </div>
  );
}

function OrderStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.draft;
  const Icon = config.icon;

  return (
    <Badge className={cn("flex items-center gap-1", config.color)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}
