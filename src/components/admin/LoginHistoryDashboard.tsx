/**
 * Admin Login History Dashboard
 *
 * Comprehensive login history management for administrators.
 * Includes filtering, search, export, and per-user drill-down.
 */

import { useState, useEffect, useCallback } from "react";
import { useAdminLoginHistory } from "@/hooks/useLoginHistory";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Search,
  RefreshCw,
  Download,
  Monitor,
  Smartphone,
  Tablet,
  MapPin,
  Clock,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Filter,
  Calendar as CalendarIcon,
  Eye,
  MoreVertical,
  User,
  Globe,
  Chrome,
  Apple,
  Mail,
  Key,
  CheckCircle,
  XCircle,
  TrendingUp,
  Users,
  AlertTriangle,
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { LoginHistoryEntry, LoginMethod, LoginSummary } from "@/lib/login-history";
import { loginHistory as loginHistoryService } from "@/lib/login-history";

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

// Login method icon
function getLoginMethodIcon(method: string) {
  switch (method) {
    case 'google':
      return Chrome;
    case 'apple':
      return Apple;
    case 'otp':
    case 'magic_link':
      return Mail;
    default:
      return Key;
  }
}

// Stats Card Component
function StatsCard({
  title,
  value,
  icon: Icon,
  trend,
  description,
  className,
}: {
  title: string;
  value: string | number;
  icon: typeof Shield;
  trend?: { value: number; isPositive: boolean };
  description?: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {trend && (
          <p className={cn(
            "text-xs mt-1",
            trend.isPositive ? "text-safe-food" : "text-destructive"
          )}>
            {trend.isPositive ? "+" : ""}{trend.value}% from yesterday
          </p>
        )}
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

// User Login Details Dialog
function UserLoginDetailsDialog({
  userId,
  userEmail,
  open,
  onOpenChange,
}: {
  userId: string;
  userEmail: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [history, setHistory] = useState<LoginHistoryEntry[]>([]);
  const [summary, setSummary] = useState<LoginSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (open && userId) {
      setIsLoading(true);
      Promise.all([
        loginHistoryService.getLoginHistoryByUser(userId),
        loginHistoryService.getUserLoginSummary(userId),
      ]).then(([hist, sum]) => {
        setHistory(hist);
        setSummary(sum);
        setIsLoading(false);
      });
    }
  }, [open, userId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Login History for {userEmail}
          </DialogTitle>
          <DialogDescription>
            Complete login history and security information
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
            <Skeleton className="h-64" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Stats */}
            {summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-lg font-bold">{summary.total_logins}</p>
                  <p className="text-xs text-muted-foreground">Total Logins</p>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-lg font-bold text-safe-food">{summary.successful_logins}</p>
                  <p className="text-xs text-muted-foreground">Successful</p>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-lg font-bold text-destructive">{summary.failed_logins}</p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-lg font-bold">{summary.unique_devices}</p>
                  <p className="text-xs text-muted-foreground">Devices</p>
                </div>
              </div>
            )}

            {/* Additional Info */}
            {summary && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Most Used Device</p>
                  <p className="font-medium capitalize">{summary.most_used_device || "N/A"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Most Used Browser</p>
                  <p className="font-medium">{summary.most_used_browser || "N/A"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Most Common Location</p>
                  <p className="font-medium">{summary.most_used_location || "N/A"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">First Login</p>
                  <p className="font-medium">
                    {summary.first_login ? format(new Date(summary.first_login), "PP") : "N/A"}
                  </p>
                </div>
              </div>
            )}

            {/* Recent Logins */}
            <div>
              <h4 className="font-medium mb-3">Recent Logins</h4>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.slice(0, 20).map((entry) => {
                      const DeviceIcon = getDeviceIcon(entry.device_type);
                      return (
                        <TableRow key={entry.id}>
                          <TableCell className="text-sm">
                            {format(new Date(entry.logged_in_at), "PP p")}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <DeviceIcon className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">
                                {entry.browser_name || "Unknown"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {entry.city && entry.country
                              ? `${entry.city}, ${entry.country}`
                              : entry.country || "Unknown"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs capitalize">
                              {entry.login_method}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {entry.success ? (
                              <CheckCircle className="h-4 w-4 text-safe-food" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive" />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Main LoginHistoryDashboard Component
 */
export function LoginHistoryDashboard() {
  const {
    isAdmin,
    allHistory,
    totalCount,
    isLoading,
    fetchHistory,
    dailyStats,
    countryStats,
    platformStats,
    refreshStats,
  } = useAdminLoginHistory();

  // Filter state
  const [searchEmail, setSearchEmail] = useState("");
  const [loginMethod, setLoginMethod] = useState<string>("all");
  const [deviceType, setDeviceType] = useState<string>("all");
  const [successFilter, setSuccessFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);

  // User details dialog
  const [selectedUser, setSelectedUser] = useState<{ id: string; email: string } | null>(null);

  // Apply filters
  const applyFilters = useCallback(() => {
    fetchHistory({
      limit: pageSize,
      offset: page * pageSize,
      startDate: dateRange.from ? startOfDay(dateRange.from) : undefined,
      endDate: dateRange.to ? endOfDay(dateRange.to) : undefined,
      loginMethod: loginMethod !== "all" ? loginMethod as LoginMethod : undefined,
      deviceType: deviceType !== "all" ? deviceType : undefined,
      success: successFilter === "all" ? undefined : successFilter === "success",
      searchEmail: searchEmail || undefined,
    });
  }, [fetchHistory, page, pageSize, dateRange, loginMethod, deviceType, successFilter, searchEmail]);

  // Apply filters when dependencies change
  useEffect(() => {
    if (isAdmin) {
      applyFilters();
    }
  }, [isAdmin, page, dateRange, loginMethod, deviceType, successFilter]);

  // Search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isAdmin && searchEmail !== "") {
        applyFilters();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchEmail]);

  // Export to CSV
  const handleExport = () => {
    const csv = [
      "Email,Time,IP Address,Device,Browser,OS,Location,Method,Status",
      ...allHistory.map((e) =>
        [
          e.email,
          format(new Date(e.logged_in_at), "yyyy-MM-dd HH:mm:ss"),
          e.ip_address || "N/A",
          e.device_type || "Unknown",
          e.browser_name || "Unknown",
          e.os_name || "Unknown",
          [e.city, e.country].filter(Boolean).join(", ") || "Unknown",
          e.login_method,
          e.success ? "Success" : "Failed",
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `login-history-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Login history exported");
  };

  // Calculate quick stats
  const todayLogins = dailyStats[0]?.total_logins || 0;
  const yesterdayLogins = dailyStats[1]?.total_logins || 1;
  const loginTrend = Math.round(((todayLogins - yesterdayLogins) / yesterdayLogins) * 100);

  const todayFailures = dailyStats[0]?.failed_logins || 0;
  const uniqueUsersToday = dailyStats[0]?.unique_users || 0;

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <ShieldAlert className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Admin access required</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          title="Today's Logins"
          value={todayLogins}
          icon={TrendingUp}
          trend={{ value: loginTrend, isPositive: loginTrend >= 0 }}
        />
        <StatsCard
          title="Active Users Today"
          value={uniqueUsersToday}
          icon={Users}
        />
        <StatsCard
          title="Failed Logins (24h)"
          value={todayFailures}
          icon={AlertTriangle}
          className={todayFailures > 10 ? "border-destructive" : ""}
        />
        <StatsCard
          title="Total Records"
          value={totalCount.toLocaleString()}
          icon={Shield}
        />
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>Login History</CardTitle>
              <CardDescription>
                View and analyze user login activity across the platform
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  refreshStats();
                  applyFilters();
                }}
                disabled={isLoading}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-6">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email..."
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Date Range */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="min-w-[200px] justify-start">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {dateRange.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "LLL dd")} - {format(dateRange.to, "LLL dd")}
                      </>
                    ) : (
                      format(dateRange.from, "LLL dd, y")
                    )
                  ) : (
                    "Select date range"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange.from}
                  selected={{ from: dateRange.from, to: dateRange.to }}
                  onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>

            {/* Login Method */}
            <Select value={loginMethod} onValueChange={setLoginMethod}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                <SelectItem value="password">Password</SelectItem>
                <SelectItem value="google">Google</SelectItem>
                <SelectItem value="apple">Apple</SelectItem>
                <SelectItem value="otp">OTP</SelectItem>
              </SelectContent>
            </Select>

            {/* Device Type */}
            <Select value={deviceType} onValueChange={setDeviceType}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Device" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Devices</SelectItem>
                <SelectItem value="desktop">Desktop</SelectItem>
                <SelectItem value="mobile">Mobile</SelectItem>
                <SelectItem value="tablet">Tablet</SelectItem>
              </SelectContent>
            </Select>

            {/* Success Filter */}
            <Select value={successFilter} onValueChange={setSuccessFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="success">Successful</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No login records found
                      </TableCell>
                    </TableRow>
                  ) : (
                    allHistory.map((entry) => {
                      const DeviceIcon = getDeviceIcon(entry.device_type);
                      const MethodIcon = getLoginMethodIcon(entry.login_method);
                      return (
                        <TableRow key={entry.id}>
                          <TableCell>
                            <div className="font-medium truncate max-w-[200px]">
                              {entry.email}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-sm">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              {format(new Date(entry.logged_in_at), "PP p")}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <DeviceIcon className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">
                                {entry.browser_name || "Unknown"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-sm">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              {entry.city && entry.country
                                ? `${entry.city}, ${entry.country_code}`
                                : entry.country || "Unknown"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs gap-1">
                              <MethodIcon className="h-3 w-3" />
                              {entry.login_method}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {entry.success ? (
                              <Badge variant="default" className="bg-safe-food text-xs">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Success
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs">
                                <XCircle className="h-3 w-3 mr-1" />
                                Failed
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {entry.user_id && (
                                  <DropdownMenuItem
                                    onClick={() => setSelectedUser({
                                      id: entry.user_id!,
                                      email: entry.email,
                                    })}
                                  >
                                    <Eye className="h-4 w-4 mr-2" />
                                    View User History
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSearchEmail(entry.email);
                                  }}
                                >
                                  <Search className="h-4 w-4 mr-2" />
                                  Filter by Email
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalCount > pageSize && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, totalCount)} of {totalCount}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={(page + 1) * pageSize >= totalCount}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Details Dialog */}
      {selectedUser && (
        <UserLoginDetailsDialog
          userId={selectedUser.id}
          userEmail={selectedUser.email}
          open={!!selectedUser}
          onOpenChange={(open) => !open && setSelectedUser(null)}
        />
      )}
    </div>
  );
}

export default LoginHistoryDashboard;
