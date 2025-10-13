import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, UserCheck, ShoppingBag, Play, StopCircle, Loader2 } from "lucide-react";
import { GroceryItem } from "@/types";

interface ShoppingSession {
  id: string;
  grocery_list_id: string;
  household_id: string;
  started_by_user_id: string;
  started_at: string;
  ended_at: string | null;
  is_active: boolean;
}

interface ActiveShopper {
  user_id: string;
  user_name: string;
  last_seen: string;
  current_item_id?: string;
}

interface CollaborativeShoppingModeProps {
  groceryListId: string | null;
  householdId: string | null;
  userId: string | null;
  groceryItems: GroceryItem[];
  onItemCheck: (itemId: string) => void;
}

export function CollaborativeShoppingMode({
  groceryListId,
  householdId,
  userId,
  groceryItems,
  onItemCheck,
}: CollaborativeShoppingModeProps) {
  const [activeSession, setActiveSession] = useState<ShoppingSession | null>(null);
  const [activeShoppers, setActiveShoppers] = useState<ActiveShopper[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  // Load active session on mount
  useEffect(() => {
    if (!groceryListId || !householdId) return;

    loadActiveSession();
  }, [groceryListId, householdId]);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!activeSession || !householdId) return;

    // Subscribe to shopping session updates
    const channel = supabase
      .channel(`shopping_session_${activeSession.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shopping_sessions',
          filter: `id=eq.${activeSession.id}`
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const updatedSession = payload.new as ShoppingSession;
            setActiveSession(updatedSession);
            
            if (!updatedSession.is_active) {
              toast.info("Shopping session ended");
              setActiveSession(null);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeSession, householdId]);

  const loadActiveSession = async () => {
    if (!groceryListId || !householdId) return;

    try {
      const { data, error } = await supabase
        .from('shopping_sessions')
        .select('*')
        .eq('grocery_list_id', groceryListId)
        .eq('household_id', householdId)
        .eq('is_active', true)
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // Ignore not found error

      setActiveSession(data as ShoppingSession | null);
    } catch (error) {
      console.error('Error loading shopping session:', error);
    }
  };

  const handleStartSession = async () => {
    if (!groceryListId || !householdId || !userId) {
      toast.error("Missing required information");
      return;
    }

    setIsStarting(true);
    try {
      const { data, error } = await supabase
        .from('shopping_sessions')
        .insert([
          {
            grocery_list_id: groceryListId,
            household_id: householdId,
            started_by_user_id: userId,
            is_active: true,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      setActiveSession(data as ShoppingSession);
      toast.success("Shopping session started!", {
        description: "Household members can now see your progress in real-time"
      });
    } catch (error) {
      console.error('Error starting session:', error);
      toast.error("Failed to start shopping session");
    } finally {
      setIsStarting(false);
    }
  };

  const handleEndSession = async () => {
    if (!activeSession) return;

    setIsEnding(true);
    try {
      const { error } = await supabase
        .from('shopping_sessions')
        .update({
          ended_at: new Date().toISOString(),
          is_active: false,
        })
        .eq('id', activeSession.id);

      if (error) throw error;

      setActiveSession(null);
      toast.success("Shopping session ended");
    } catch (error) {
      console.error('Error ending session:', error);
      toast.error("Failed to end shopping session");
    } finally {
      setIsEnding(false);
    }
  };

  const getShoppingProgress = () => {
    const total = groceryItems.length;
    const checked = groceryItems.filter(item => item.checked).length;
    const percentage = total > 0 ? Math.round((checked / total) * 100) : 0;
    
    return { total, checked, percentage };
  };

  const progress = getShoppingProgress();

  if (!groceryListId || !householdId || !userId) {
    return null;
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Collaborative Shopping
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!activeSession ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Start a shopping session to collaborate with household members in real-time.
            </p>
            <Button
              onClick={handleStartSession}
              disabled={isStarting || groceryItems.length === 0}
              className="w-full"
            >
              {isStarting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Start Shopping Session
                </>
              )}
            </Button>
            {groceryItems.length === 0 && (
              <p className="text-xs text-muted-foreground text-center">
                Add items to your list first
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Active Session Badge */}
            <div className="flex items-center justify-between">
              <Badge variant="default" className="gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Shopping in Progress
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={handleEndSession}
                disabled={isEnding}
              >
                {isEnding ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Ending...
                  </>
                ) : (
                  <>
                    <StopCircle className="h-3 w-3 mr-1" />
                    End Session
                  </>
                )}
              </Button>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">
                  {progress.checked} / {progress.total} items
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-300 ease-in-out"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>
              <p className="text-xs text-center text-muted-foreground">
                {progress.percentage}% complete
              </p>
            </div>

            {/* Active Shoppers (simulated for now) */}
            {activeSession.started_by_user_id === userId && (
              <div className="space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  You're shopping
                </p>
                <div className="flex items-center gap-2 p-2 bg-accent/50 rounded-lg">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                      You
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">You</p>
                    <p className="text-xs text-muted-foreground">Shopping now</p>
                  </div>
                  <UserCheck className="h-4 w-4 text-green-600" />
                </div>
              </div>
            )}

            {/* Helpful Tips */}
            <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
              <p className="text-xs text-muted-foreground">
                <strong>💡 Tip:</strong> Check off items as you add them to your cart. 
                Household members will see updates in real-time!
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

