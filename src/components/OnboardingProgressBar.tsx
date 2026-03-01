import { useApp } from "@/contexts/AppContext";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function OnboardingProgressBar() {
  const { kids, foods, planEntries, groceryItems } = useApp();
  const [dismissed, setDismissed] = useLocalStorage("onboarding-dismissed", false);

  if (dismissed) return null;

  const safeFoods = foods.filter(f => f.is_safe);
  const steps = [
    { label: "Create child profile", done: kids.length > 0, href: "/dashboard/kids" },
    { label: "Add 5+ safe foods", done: safeFoods.length >= 5, href: "/dashboard/pantry" },
    { label: "Generate meal plan", done: planEntries.length > 0, href: "/dashboard/planner" },
    { label: "Create grocery list", done: groceryItems.length > 0, href: "/dashboard/grocery" },
  ];

  const completed = steps.filter(s => s.done).length;
  if (completed === steps.length) return null;

  return (
    <div className="bg-card border rounded-lg p-4 mx-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Getting Started ({completed}/{steps.length})</h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDismissed(true)} aria-label="Dismiss onboarding">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="w-full bg-muted rounded-full h-2 mb-3">
        <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${(completed / steps.length) * 100}%` }} />
      </div>
      <div className="flex flex-wrap gap-3">
        {steps.map((step, i) => (
          <Link key={i} to={step.href} className="flex items-center gap-1.5 text-xs">
            {step.done ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
            <span className={step.done ? "text-muted-foreground line-through" : "text-foreground"}>{step.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
