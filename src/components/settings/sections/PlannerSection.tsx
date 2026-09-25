import { WeekStartSetting } from "@/components/settings/WeekStartSetting";
import { GroceryAutomationCard } from "@/components/settings/GroceryAutomationCard";

/**
 * Settings > Planner: when the week starts (saved to the account) and grocery
 * automation (this device). Content only; the hub supplies the section and h2.
 */
export function PlannerSection() {
  return (
    <div className="space-y-6">
      <WeekStartSetting />
      <GroceryAutomationCard />
    </div>
  );
}
