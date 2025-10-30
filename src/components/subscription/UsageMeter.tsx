import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, TrendingUp, Infinity } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface UsageMeterProps {
  title: string;
  description?: string;
  current: number;
  limit: number | null;
  percentage: number;
  resetsAt?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function UsageMeter({
  title,
  description,
  current,
  limit,
  percentage,
  resetsAt,
  icon,
  className,
}: UsageMeterProps) {
  const navigate = useNavigate();

  const getColorClass = () => {
    if (limit === null) return "text-green-600 dark:text-green-400";
    if (percentage >= 100) return "text-red-600 dark:text-red-400";
    if (percentage >= 90) return "text-orange-600 dark:text-orange-400";
    if (percentage >= 75) return "text-yellow-600 dark:text-yellow-400";
    return "text-green-600 dark:text-green-400";
  };

  const getProgressColor = () => {
    if (limit === null) return "bg-green-500";
    if (percentage >= 100) return "bg-red-500";
    if (percentage >= 90) return "bg-orange-500";
    if (percentage >= 75) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getStatusBadge = () => {
    if (limit === null) {
      return (
        <Badge variant="outline" className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
          <Infinity className="w-3 h-3 mr-1" />
          Unlimited
        </Badge>
      );
    }
    
    if (percentage >= 100) {
      return (
        <Badge variant="destructive">
          <AlertCircle className="w-3 h-3 mr-1" />
          Limit Reached
        </Badge>
      );
    }
    
    if (percentage >= 90) {
      return (
        <Badge variant="outline" className="bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800">
          Almost Full
        </Badge>
      );
    }
    
    if (percentage >= 75) {
      return (
        <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
          Getting Close
        </Badge>
      );
    }
    
    return (
      <Badge variant="outline" className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
        Available
      </Badge>
    );
  };

  const formatResetTime = () => {
    if (!resetsAt) return null;
    
    const resetDate = new Date(resetsAt);
    const now = new Date();
    const diff = resetDate.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `Resets in ${days} day${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `Resets in ${hours} hour${hours > 1 ? 's' : ''}`;
    } else {
      return 'Resets soon';
    }
  };

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {icon && <div className="text-muted-foreground">{icon}</div>}
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              {description && (
                <CardDescription className="text-sm mt-1">
                  {description}
                </CardDescription>
              )}
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Usage Count */}
        <div className="flex items-baseline justify-between">
          <span className={cn("text-2xl font-bold", getColorClass())}>
            {current}
          </span>
          <span className="text-sm text-muted-foreground">
            {limit === null ? "∞" : `of ${limit}`}
          </span>
        </div>

        {/* Progress Bar */}
        {limit !== null && (
          <div className="space-y-2">
            <Progress 
              value={Math.min(percentage, 100)} 
              className="h-2"
              indicatorClassName={getProgressColor()}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{percentage}% used</span>
              {resetsAt && <span>{formatResetTime()}</span>}
            </div>
          </div>
        )}

        {/* Upgrade CTA */}
        {percentage >= 75 && limit !== null && (
          <div className={cn(
            "flex items-center gap-2 p-3 rounded-lg border mt-3",
            percentage >= 100 
              ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" 
              : percentage >= 90
              ? "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800"
              : "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800"
          )}>
            <AlertCircle className={cn(
              "w-4 h-4 flex-shrink-0",
              percentage >= 100 ? "text-red-600" : percentage >= 90 ? "text-orange-600" : "text-yellow-600"
            )} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {percentage >= 100 
                  ? "You've reached your limit" 
                  : "Approaching your limit"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Upgrade for {limit === null ? "more" : "unlimited"} {title.toLowerCase()}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate("/pricing")}
              className="flex-shrink-0"
            >
              <TrendingUp className="w-3 h-3 mr-1" />
              Upgrade
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

