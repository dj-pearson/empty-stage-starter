/**
 * User Login History Component
 *
 * Displays login history for the current user in their profile/settings.
 * Shows recent logins with device, location, and timestamp information.
 */

import { useState } from "react";
import { useLoginHistory } from "@/hooks/useLoginHistory";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  MapPin,
  Clock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  ChevronRight,
  Chrome,
  Apple,
  Mail,
  Key,
  AlertTriangle,
  Check,
  X,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import type { LoginHistoryEntry } from "@/lib/login-history";

// Device icon mapping
function getDeviceIcon(deviceType: string | null) {
  switch (deviceType) {
    case 'mobile':
      return Smartphone;
    case 'tablet':
      return Tablet;
    case 'desktop':
    default:
      return Monitor;
  }
}

// Login method badge
function LoginMethodBadge({ method }: { method: string }) {
  const config: Record<string, { label: string; icon: typeof Key; variant: "default" | "secondary" | "outline" }> = {
    password: { label: "Password", icon: Key, variant: "secondary" },
    google: { label: "Google", icon: Chrome, variant: "outline" },
    apple: { label: "Apple", icon: Apple, variant: "outline" },
    otp: { label: "OTP", icon: Mail, variant: "secondary" },
    magic_link: { label: "Magic Link", icon: Mail, variant: "secondary" },
    unknown: { label: "Unknown", icon: Key, variant: "secondary" },
  };

  const { label, icon: Icon, variant } = config[method] || config.unknown;

  return (
    <Badge variant={variant} className="text-xs gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

// Location display
function LocationDisplay({ entry }: { entry: LoginHistoryEntry }) {
  if (!entry.city && !entry.country) {
    return <span className="text-muted-foreground">Unknown location</span>;
  }

  const parts = [entry.city, entry.region, entry.country].filter(Boolean);
  return <span>{parts.join(", ")}</span>;
}

// Login entry row
function LoginEntryRow({
  entry,
  onViewDetails,
  isCurrentSession,
}: {
  entry: LoginHistoryEntry;
  onViewDetails: () => void;
  isCurrentSession: boolean;
}) {
  const DeviceIcon = getDeviceIcon(entry.device_type);
  const timeAgo = formatDistanceToNow(new Date(entry.logged_in_at), { addSuffix: true });

  return (
    <div
      className={cn(
        "flex items-center gap-4 p-4 rounded-lg border transition-colors hover:bg-muted/50 cursor-pointer",
        isCurrentSession && "border-primary/50 bg-primary/5",
        !entry.success && "border-destructive/30 bg-destructive/5"
      )}
      onClick={onViewDetails}
    >
      {/* Device Icon */}
      <div className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
        entry.success ? "bg-muted" : "bg-destructive/10"
      )}>
        <DeviceIcon className={cn(
          "h-5 w-5",
          entry.success ? "text-muted-foreground" : "text-destructive"
        )} />
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">
            {entry.browser_name || "Unknown browser"}
            {entry.browser_version && ` ${entry.browser_version.split('.')[0]}`}
          </span>
          {isCurrentSession && (
            <Badge variant="default" className="text-xs bg-primary">
              Current
            </Badge>
          )}
          {!entry.success && (
            <Badge variant="destructive" className="text-xs">
              Failed
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
          <span>{entry.os_name || "Unknown OS"}</span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            <LocationDisplay entry={entry} />
          </span>
        </div>
      </div>

      {/* Login Method & Time */}
      <div className="text-right shrink-0">
        <LoginMethodBadge method={entry.login_method} />
        <div className="text-xs text-muted-foreground mt-1">
          {timeAgo}
        </div>
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </div>
  );
}

// Login details dialog
function LoginDetailsDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: LoginHistoryEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!entry) return null;

  const DeviceIcon = getDeviceIcon(entry.device_type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {entry.success ? (
              <ShieldCheck className="h-5 w-5 text-safe-food" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-destructive" />
            )}
            Login Details
          </DialogTitle>
          <DialogDescription>
            {entry.success ? "Successful login" : "Failed login attempt"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            {entry.success ? (
              <Check className="h-5 w-5 text-safe-food" />
            ) : (
              <X className="h-5 w-5 text-destructive" />
            )}
            <div>
              <p className="font-medium">
                {entry.success ? "Login Successful" : "Login Failed"}
              </p>
              {entry.failure_reason && (
                <p className="text-sm text-muted-foreground">{entry.failure_reason}</p>
              )}
            </div>
          </div>

          {/* Device Info */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Device</h4>
            <div className="flex items-center gap-3">
              <DeviceIcon className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium capitalize">{entry.device_type || "Unknown"}</p>
                <p className="text-sm text-muted-foreground">
                  {entry.browser_name} {entry.browser_version} on {entry.os_name} {entry.os_version}
                </p>
              </div>
            </div>
          </div>

          {/* Location Info */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Location</h4>
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">
                  <LocationDisplay entry={entry} />
                </p>
                {entry.ip_address && (
                  <p className="text-sm text-muted-foreground font-mono">{entry.ip_address}</p>
                )}
              </div>
            </div>
          </div>

          {/* Timestamp */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Time</h4>
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">
                  {format(new Date(entry.logged_in_at), "PPP 'at' p")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(entry.logged_in_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          </div>

          {/* Session Duration */}
          {entry.session_duration_seconds && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Session Duration</h4>
              <p className="font-medium">
                {Math.floor(entry.session_duration_seconds / 3600)}h{" "}
                {Math.floor((entry.session_duration_seconds % 3600) / 60)}m
              </p>
            </div>
          )}

          {/* Login Method */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Authentication Method</h4>
            <LoginMethodBadge method={entry.login_method} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Summary stats card
function SummaryStats({
  summary,
}: {
  summary: {
    total_logins: number;
    successful_logins: number;
    failed_logins: number;
    unique_devices: number;
    unique_locations: number;
  } | null;
}) {
  if (!summary) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="p-4 rounded-lg bg-muted/50">
        <p className="text-2xl font-bold">{summary.total_logins}</p>
        <p className="text-sm text-muted-foreground">Total Logins</p>
      </div>
      <div className="p-4 rounded-lg bg-muted/50">
        <p className="text-2xl font-bold text-safe-food">{summary.successful_logins}</p>
        <p className="text-sm text-muted-foreground">Successful</p>
      </div>
      <div className="p-4 rounded-lg bg-muted/50">
        <p className="text-2xl font-bold">{summary.unique_devices}</p>
        <p className="text-sm text-muted-foreground">Devices</p>
      </div>
      <div className="p-4 rounded-lg bg-muted/50">
        <p className="text-2xl font-bold">{summary.unique_locations}</p>
        <p className="text-sm text-muted-foreground">Locations</p>
      </div>
    </div>
  );
}

// Loading skeleton
function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-60" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

/**
 * Main UserLoginHistory Component
 */
export function UserLoginHistory() {
  const { loginHistory, isLoading, refreshHistory, summary } = useLoginHistory(50);
  const [selectedEntry, setSelectedEntry] = useState<LoginHistoryEntry | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Get current session ID to highlight current session
  const currentSessionId = typeof sessionStorage !== 'undefined'
    ? sessionStorage.getItem('login_session_id')
    : null;

  const handleViewDetails = (entry: LoginHistoryEntry) => {
    setSelectedEntry(entry);
    setShowDetails(true);
  };

  // Check for suspicious activity
  const hasFailedLogins = loginHistory.some(e => !e.success);
  const recentFailures = loginHistory.filter(
    e => !e.success && new Date(e.logged_in_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
  ).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Login History
          </CardTitle>
          <CardDescription>
            Review your recent account activity and logins
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshHistory}
          disabled={isLoading}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </CardHeader>

      <CardContent>
        {/* Security Alert */}
        {recentFailures > 0 && (
          <div className="flex items-start gap-3 p-4 mb-6 rounded-lg border border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-700 dark:text-amber-400">
                {recentFailures} failed login attempt{recentFailures !== 1 ? 's' : ''} in the last 24 hours
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                If you don't recognize these attempts, consider changing your password.
              </p>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <SummaryStats summary={summary} />

        {/* Login History List */}
        {isLoading ? (
          <LoadingSkeleton />
        ) : loginHistory.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No login history available</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {loginHistory.map((entry) => (
                <LoginEntryRow
                  key={entry.id}
                  entry={entry}
                  onViewDetails={() => handleViewDetails(entry)}
                  isCurrentSession={entry.session_id === currentSessionId}
                />
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Details Dialog */}
        <LoginDetailsDialog
          entry={selectedEntry}
          open={showDetails}
          onOpenChange={setShowDetails}
        />
      </CardContent>
    </Card>
  );
}

export default UserLoginHistory;
