import { memo } from "react";
import { Package, AlertTriangle, PackageOpen, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface PantryStatsBarProps {
  totalCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  safeCount: number;
  tryBiteCount: number;
  onFilterLowStock?: () => void;
  onFilterOutOfStock?: () => void;
}

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: number;
  color?: string;
  onClick?: () => void;
  highlight?: boolean;
}

function StatCard({ icon: Icon, label, value, color, onClick, highlight }: StatCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "bg-card rounded-xl p-3.5 border text-left transition-all duration-200",
        onClick && "cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-[0.98]",
        !onClick && "cursor-default",
        highlight && value > 0 && "ring-2 ring-amber-400/50 border-amber-300 dark:ring-amber-500/30 dark:border-amber-700"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <div
          className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
            color || "bg-muted"
          )}
        >
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide truncate">
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold tabular-nums leading-none mt-1">{value}</p>
    </button>
  );
}

export const PantryStatsBar = memo(function PantryStatsBar({
  totalCount,
  lowStockCount,
  outOfStockCount,
  safeCount,
  tryBiteCount,
  onFilterLowStock,
  onFilterOutOfStock,
}: PantryStatsBarProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
      <StatCard
        icon={Package}
        label="Total"
        value={totalCount}
        color="bg-primary"
      />
      <StatCard
        icon={AlertTriangle}
        label="Low Stock"
        value={lowStockCount}
        color="bg-amber-500"
        onClick={lowStockCount > 0 ? onFilterLowStock : undefined}
        highlight={lowStockCount > 0}
      />
      <StatCard
        icon={PackageOpen}
        label="Out of Stock"
        value={outOfStockCount}
        color="bg-destructive"
        onClick={outOfStockCount > 0 ? onFilterOutOfStock : undefined}
        highlight={outOfStockCount > 0}
      />
      <StatCard
        icon={ShieldCheck}
        label="Safe Foods"
        value={safeCount}
        color="bg-safe-food"
      />
    </div>
  );
});
