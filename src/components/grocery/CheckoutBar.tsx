import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CheckoutBarProps {
  /** Rows checked off on the list on screen. */
  done: number;
  /** All rows on the list on screen. */
  total: number;
  /** The CTA text, already chosen for the mode checkout runs in. */
  ctaLabel: string;
  busy: boolean;
  onCheckout: () => void;
}

/**
 * The one checkout control on the Grocery page.
 *
 * It replaced three: an h-7 button in the Purchased header, a fixed pill at
 * bottom-24 that floated over the last row of a pb-20 page, and a button in
 * the all-bought card. Sticky rather than fixed, so it sits in the flow at the
 * foot of the list and the page's bottom padding never has to guess its
 * height. On a phone it parks above the 64px bottom tab bar and the home
 * indicator; above md there is no tab bar, so it sits on the edge.
 *
 * One elevation cue: a top border, no shadow.
 */
export const CheckoutBar = memo(function CheckoutBar({
  done,
  total,
  ctaLabel,
  busy,
  onCheckout,
}: CheckoutBarProps) {
  const { t } = useTranslation();
  return (
    <div
      data-testid="grocery-checkout-bar"
      className="sticky bottom-[calc(theme(spacing.16)+env(safe-area-inset-bottom))] md:bottom-0 z-20 -mx-4 mt-4 flex items-center justify-between gap-3 border-t border-border bg-background px-4 py-2 print:hidden"
    >
      <span className="text-sm text-muted-foreground tabular-nums">
        {t("grocery.checkout.progress", {
          defaultValue: "{{done}} of {{total}}",
          done,
          total,
        })}
      </span>
      <Button
        type="button"
        className="h-11"
        onClick={onCheckout}
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 mr-1.5 motion-safe:animate-spin" aria-hidden="true" />
        ) : (
          <Check className="h-4 w-4 mr-1.5" aria-hidden="true" />
        )}
        {ctaLabel}
      </Button>
    </div>
  );
});
