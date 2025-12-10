import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from '@/lib/edge-functions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Loader2, CreditCard, Lock, AlertCircle } from "lucide-react";

interface AddPaymentMethodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// Stripe types for dynamically loaded library
interface StripeInstance {
  elements: (options: Record<string, unknown>) => StripeElements;
  confirmSetup: (options: Record<string, unknown>) => Promise<{
    error?: { message: string };
    setupIntent?: { status: string };
  }>;
}

interface StripeElements {
  create: (type: string) => StripeElement;
}

interface StripeElement {
  mount: (selector: string) => void;
  unmount: () => void;
}

declare global {
  interface Window {
    Stripe?: (key: string) => StripeInstance;
  }
}

export function AddPaymentMethodDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddPaymentMethodDialogProps) {
  const [loading, setLoading] = useState(false);
  const [stripeLoaded, setStripeLoaded] = useState(false);
  const [stripe, setStripe] = useState<StripeInstance | null>(null);
  const [elements, setElements] = useState<StripeElements | null>(null);
  const [cardElement, setCardElement] = useState<StripeElement | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ref to track cardElement for cleanup without triggering effect
  const cardElementRef = useRef<StripeElement | null>(null);

  // Load Stripe.js
  useEffect(() => {
    if (typeof window !== "undefined" && !window.Stripe) {
      const script = document.createElement("script");
      script.src = "https://js.stripe.com/v3/";
      script.async = true;
      script.onload = () => {
        setStripeLoaded(true);
      };
      document.body.appendChild(script);
    } else if (window.Stripe) {
      setStripeLoaded(true);
    }
  }, []);

  // Initialize Stripe when dialog opens
  useEffect(() => {
    const initializeStripe = async () => {
      if (!open || !stripeLoaded) return;

      try {
        setLoading(true);
        setError(null);

        // Get publishable key from environment
        const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
        if (!publishableKey) {
          throw new Error("Stripe is not configured");
        }

        // Initialize Stripe
        const stripeInstance = window.Stripe(publishableKey);
        setStripe(stripeInstance);

        // Create SetupIntent
        const { data, error: intentError } = await invokeEdgeFunction(
          "manage-payment-methods",
          {
            body: { action: "create-setup-intent" },
          }
        );

        if (intentError) throw intentError;
        if (!data.clientSecret) throw new Error("Failed to create setup intent");

        setClientSecret(data.clientSecret);

        // Create card element
        const elementsInstance = stripeInstance.elements({
          clientSecret: data.clientSecret,
          appearance: {
            theme: document.documentElement.classList.contains("dark") ? "night" : "stripe",
            variables: {
              colorPrimary: "#4f46e5",
              colorBackground: document.documentElement.classList.contains("dark")
                ? "#1a1a1a"
                : "#ffffff",
              colorText: document.documentElement.classList.contains("dark")
                ? "#ffffff"
                : "#1a1a1a",
              colorDanger: "#dc2626",
              fontFamily: "system-ui, sans-serif",
              spacingUnit: "4px",
              borderRadius: "8px",
            },
          },
        });

        setElements(elementsInstance);

        // Create and mount card element
        const card = elementsInstance.create("payment");
        setCardElement(card);
        cardElementRef.current = card;

        // Wait for container to be available
        setTimeout(() => {
          const container = document.getElementById("card-element");
          if (container) {
            card.mount("#card-element");
          }
        }, 100);
      } catch (err) {
        console.error("Error initializing Stripe:", err);
        setError(err instanceof Error ? err.message : "Failed to initialize payment form");
      } finally {
        setLoading(false);
      }
    };

    initializeStripe();

    // Cleanup on close
    return () => {
      if (cardElementRef.current) {
        cardElementRef.current.unmount();
      }
      cardElementRef.current = null;
      setCardElement(null);
      setElements(null);
      setClientSecret(null);
    };
  }, [open, stripeLoaded]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || !clientSecret) {
      setError("Payment form not ready. Please try again.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Confirm the SetupIntent
      const { error: confirmError, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: "if_required",
      });

      if (confirmError) {
        throw new Error(confirmError.message);
      }

      if (setupIntent && setupIntent.status === "succeeded") {
        toast.success("Payment method added successfully");
        onSuccess();
      } else {
        throw new Error("Failed to add payment method");
      }
    } catch (err) {
      console.error("Error adding payment method:", err);
      setError(err instanceof Error ? err.message : "Failed to add payment method");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Add Payment Method
          </DialogTitle>
          <DialogDescription>
            Add a new card for subscription payments. Your payment information is securely processed by Stripe.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="min-h-[120px]">
            {loading && !cardElement ? (
              <div className="flex items-center justify-center h-[120px]">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div
                id="card-element"
                className="p-4 border rounded-lg bg-background min-h-[60px]"
              />
            )}
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" />
            <span>Secured by Stripe. We never store your card details.</span>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !cardElement}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                "Add Card"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
