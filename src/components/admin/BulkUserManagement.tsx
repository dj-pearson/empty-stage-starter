import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Search,
  UserX,
  UserCheck,
  Mail,
  Calendar,
  Clock,
  Download,
  Shield,
  Users,
  Send,
  RefreshCw,
  FileSpreadsheet,
  FileText,
  MoreVertical,
  Eye,
  KeyRound,
  CreditCard,
  Activity,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { logger } from "@/lib/logger";
import { downloadCSV, downloadJSON } from "@/lib/file-utils";

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  last_sign_in_at: string | null;
  onboarding_completed: boolean;
  role: string;
  is_banned: boolean;
}

interface BulkAction {
  type: "ban" | "unban" | "make_admin" | "remove_admin" | "send_email" | "delete" | "export" | "reset_password";
  label: string;
  icon: React.ReactNode;
  variant?: "default" | "destructive" | "outline";
}

interface UserSubscription {
  id: string;
  status: string;
  plan_id: string | null;
  billing_cycle: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  trial_end: string | null;
  created_at: string | null;
}

const PAGE_SIZE = 20;

export function BulkUserManagement() {
  const { isAdmin, isLoading: isAdminLoading } = useAdminCheck();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [showBulkEmailDialog, setShowBulkEmailDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<BulkAction | null>(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [processingProgress, setProcessingProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [userStats, setUserStats] = useState({
    total: 0,
    active: 0,
    onboarded: 0,
    banned: 0,
  });
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showUserDetails, setShowUserDetails] = useState(false);
  const [userSubscription, setUserSubscription] = useState<UserSubscription | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(false);
  const [banConfirmUserId, setBanConfirmUserId] = useState<string | null>(null);

  const bulkActions: BulkAction[] = [
    { type: "ban", label: "Ban Selected", icon: <UserX className="h-4 w-4" />, variant: "destructive" },
    { type: "unban", label: "Unban Selected", icon: <UserCheck className="h-4 w-4" /> },
    { type: "make_admin", label: "Make Admin", icon: <Shield className="h-4 w-4" /> },
    { type: "remove_admin", label: "Remove Admin", icon: <Shield className="h-4 w-4" /> },
    { type: "reset_password", label: "Reset Password", icon: <Mail className="h-4 w-4" /> },
    { type: "send_email", label: "Send Email", icon: <Send className="h-4 w-4" /> },
    { type: "export", label: "Export Selected", icon: <Download className="h-4 w-4" /> },
  ];

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);

      const { data, error } = await invokeEdgeFunction<{ users: UserProfile[] }>('list-users');

      if (error) {
        throw error;
      }

      const combinedUsers: UserProfile[] = data?.users || [];
      setUsers(combinedUsers);

      const stats = {
        total: combinedUsers.length,
        active: combinedUsers.filter((u) => u.last_sign_in_at).length,
        onboarded: combinedUsers.filter((u) => u.onboarding_completed).length,
        banned: combinedUsers.filter((u) => u.is_banned).length,
      };
      setUserStats(stats);
      filterUsers(combinedUsers, searchQuery, statusFilter);
    } catch (error) {
      logger.error("Error loading users:", error);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter]);

  const filterUsers = useCallback((userList: UserProfile[], search: string, status: string) => {
    let filtered = [...userList];

    if (search) {
      filtered = filtered.filter(
        (user) =>
          user.email.toLowerCase().includes(search.toLowerCase()) ||
          user.full_name.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (status === "active") {
      filtered = filtered.filter((u) => u.last_sign_in_at && !u.is_banned);
    } else if (status === "onboarded") {
      filtered = filtered.filter((u) => u.onboarding_completed);
    } else if (status === "not-onboarded") {
      filtered = filtered.filter((u) => !u.onboarding_completed);
    } else if (status === "banned") {
      filtered = filtered.filter((u) => u.is_banned);
    } else if (status === "admin") {
      filtered = filtered.filter((u) => u.role === "admin");
    }

    setFilteredUsers(filtered);
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin]);

  const loadUserSubscription = useCallback(async (userId: string) => {
    setLoadingSubscription(true);
    setUserSubscription(null);
    try {
      const { data, error } = await supabase
        .from("user_subscriptions")
        .select("id, status, plan_id, billing_cycle, current_period_start, current_period_end, cancel_at_period_end, trial_end, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setUserSubscription(data);
    } catch (error) {
      logger.error("Error loading user subscription:", error);
    } finally {
      setLoadingSubscription(false);
    }
  }, []);

  const handleViewUserDetails = (user: UserProfile) => {
    setSelectedUser(user);
    setShowUserDetails(true);
    loadUserSubscription(user.id);
  };

  const handleSingleBanToggle = async (userId: string, ban: boolean) => {
    try {
      const { error } = await invokeEdgeFunction("update-user", {
        body: { userId, action: ban ? "ban" : "unban" },
      });
      if (error) throw error;
      toast.success(ban ? "User account disabled" : "User account enabled");
      setBanConfirmUserId(null);
      loadUsers();
    } catch (error) {
      logger.error("Error toggling user ban:", error);
      toast.error(ban ? "Failed to disable user" : "Failed to enable user");
    }
  };

  const handleSingleResetPassword = async (user: UserProfile) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/auth?reset=true`,
      });
      if (error) throw error;
      toast.success(`Password reset email sent to ${user.email}`);
    } catch (error) {
      logger.error("Error sending password reset:", error);
      toast.error("Failed to send password reset email");
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
    filterUsers(users, value, statusFilter);
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
    filterUsers(users, searchQuery, value);
  };

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / PAGE_SIZE);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const toggleUserSelection = (userId: string) => {
    const newSelection = new Set(selectedUserIds);
    if (newSelection.has(userId)) {
      newSelection.delete(userId);
    } else {
      newSelection.add(userId);
    }
    setSelectedUserIds(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedUserIds.size === filteredUsers.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredUsers.map((u) => u.id)));
    }
  };

  const handleBulkAction = (action: BulkAction) => {
    if (selectedUserIds.size === 0) {
      toast.error("Please select at least one user");
      return;
    }

    if (action.type === "send_email") {
      setShowBulkEmailDialog(true);
      return;
    }

    if (action.type === "export") {
      handleExportSelected();
      return;
    }

    setPendingAction(action);
    setShowConfirmDialog(true);
  };

  const executeBulkAction = async () => {
    if (!pendingAction) return;

    setIsProcessing(true);
    setProcessingProgress(0);

    const selectedUsers = users.filter((u) => selectedUserIds.has(u.id));
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < selectedUsers.length; i++) {
      const user = selectedUsers[i];
      try {
        let actionName: string;

        switch (pendingAction.type) {
          case "ban":
            actionName = "ban";
            break;
          case "unban":
            actionName = "unban";
            break;
          case "make_admin":
            actionName = "make_admin";
            break;
          case "remove_admin":
            actionName = "remove_admin";
            break;
          case "reset_password":
            actionName = "reset_password";
            break;
          default:
            continue;
        }

        if (actionName === "reset_password") {
          const { error: resetError } = await supabase.auth.resetPasswordForEmail(user.email, {
            redirectTo: `${window.location.origin}/auth?reset=true`,
          });
          if (resetError) throw resetError;
          successCount++;
          setProcessingProgress(((i + 1) / selectedUsers.length) * 100);
          continue;
        }

        const { error } = await invokeEdgeFunction("update-user", {
          body: { userId: user.id, action: actionName },
        });

        if (error) throw error;
        successCount++;
      } catch (error) {
        logger.error(`Error processing user ${user.id}:`, error);
        errorCount++;
      }

      setProcessingProgress(((i + 1) / selectedUsers.length) * 100);
    }

    setIsProcessing(false);
    setShowConfirmDialog(false);
    setPendingAction(null);
    setSelectedUserIds(new Set());

    if (successCount > 0) {
      toast.success(`Successfully processed ${successCount} user(s)`);
    }
    if (errorCount > 0) {
      toast.error(`Failed to process ${errorCount} user(s)`);
    }

    loadUsers();
  };

  const handleSendBulkEmail = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) {
      toast.error("Please enter both subject and body");
      return;
    }

    setIsProcessing(true);
    setProcessingProgress(0);

    const selectedUsers = users.filter((u) => selectedUserIds.has(u.id));
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < selectedUsers.length; i++) {
      const user = selectedUsers[i];
      try {
        const { error } = await supabase
          .from("automation_email_queue")
          .insert({
            to_email: user.email,
            subject: emailSubject,
            html_body: emailBody.replace(/\n/g, "<br>"),
            text_body: emailBody,
            status: "pending",
            template_key: "bulk_admin",
            priority: 5,
            scheduled_for: new Date().toISOString(),
          });

        if (error) throw error;
        successCount++;
      } catch (error) {
        logger.error(`Error sending email to ${user.email}:`, error);
        errorCount++;
      }

      setProcessingProgress(((i + 1) / selectedUsers.length) * 100);
    }

    setIsProcessing(false);
    setShowBulkEmailDialog(false);
    setEmailSubject("");
    setEmailBody("");
    setSelectedUserIds(new Set());

    if (successCount > 0) {
      toast.success(`Queued ${successCount} email(s) for sending`);
    }
    if (errorCount > 0) {
      toast.error(`Failed to queue ${errorCount} email(s)`);
    }
  };

  const handleExportSelected = () => {
    const selectedUsers = users.filter((u) => selectedUserIds.has(u.id));

    const exportData = selectedUsers.map((u) => ({
      email: u.email,
      name: u.full_name,
      created_at: format(new Date(u.created_at), "yyyy-MM-dd HH:mm"),
      last_sign_in: u.last_sign_in_at
        ? format(new Date(u.last_sign_in_at), "yyyy-MM-dd HH:mm")
        : "Never",
      onboarded: u.onboarding_completed ? "Yes" : "No",
      role: u.role,
      status: u.is_banned ? "Banned" : "Active",
    }));

    downloadCSV(exportData, `users-export-${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast.success(`Exported ${selectedUsers.length} user(s)`);
  };

  const handleExportAll = (format: "csv" | "json") => {
    const exportData = filteredUsers.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.full_name,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      onboarding_completed: u.onboarding_completed,
      role: u.role,
      is_banned: u.is_banned,
    }));

    if (format === "csv") {
      downloadCSV(exportData, `all-users-${new Date().toISOString().split("T")[0]}.csv`);
    } else {
      downloadJSON(exportData, `all-users-${new Date().toISOString().split("T")[0]}.json`);
    }

    toast.success(`Exported ${filteredUsers.length} user(s) as ${format.toUpperCase()}`);
  };

  if (isAdminLoading || loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-4 text-center">
            <ShieldAlert className="h-12 w-12 text-destructive" />
            <div>
              <h3 className="text-lg font-semibold">Access Denied</h3>
              <p className="text-sm text-muted-foreground">
                You do not have admin permissions to access user management.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Users</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{userStats.total}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Active Users</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-safe-food">{userStats.active}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Onboarded</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">{userStats.onboarded}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Banned</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-destructive">{userStats.banned}</p>
          </CardContent>
        </Card>
      </div>

      {/* Bulk Actions Bar */}
      {selectedUserIds.size > 0 && (
        <Card className="bg-muted/50">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="font-medium">{selectedUserIds.size} user(s) selected</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {bulkActions.map((action) => (
                  <Button
                    key={action.type}
                    variant={action.variant || "outline"}
                    size="sm"
                    onClick={() => handleBulkAction(action)}
                    className="gap-2"
                  >
                    {action.icon}
                    {action.label}
                  </Button>
                ))}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedUserIds(new Set())}
                className="ml-auto"
              >
                Clear Selection
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Bulk User Management</CardTitle>
          <CardDescription>
            Select multiple users to perform batch operations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email or name..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="onboarded">Onboarded</SelectItem>
                <SelectItem value="not-onboarded">Not Onboarded</SelectItem>
                <SelectItem value="admin">Admins</SelectItem>
                <SelectItem value="banned">Banned</SelectItem>
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Download className="h-4 w-4" />
                  Export All
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleExportAll("csv")}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportAll("json")}>
                  <FileText className="h-4 w-4 mr-2" />
                  Export as JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button onClick={loadUsers} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>

          {/* Users Table with Bulk Selection */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedUserIds.size === filteredUsers.length && filteredUsers.length > 0}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all users"
                    />
                  </TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Sign In</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedUsers.map((user) => (
                    <TableRow
                      key={user.id}
                      className={selectedUserIds.has(user.id) ? "bg-muted/50" : ""}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedUserIds.has(user.id)}
                          onCheckedChange={() => toggleUserSelection(user.id)}
                          aria-label={`Select ${user.full_name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={`https://avatar.vercel.sh/${user.email}`} />
                            <AvatarFallback>
                              {user.full_name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{user.full_name}</p>
                            {user.role === "admin" && (
                              <Badge variant="secondary" className="text-xs mt-1">
                                <Shield className="h-2 w-2 mr-1" />
                                Admin
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          {user.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          {format(new Date(user.created_at), "MMM d, yyyy")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          {user.last_sign_in_at
                            ? format(new Date(user.last_sign_in_at), "MMM d, yyyy")
                            : "Never"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {user.is_banned ? (
                            <Badge variant="destructive">Banned</Badge>
                          ) : user.onboarding_completed ? (
                            <Badge variant="default" className="bg-safe-food">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Pending</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Actions for ${user.full_name}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewUserDetails(user)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleSingleResetPassword(user)}>
                              <KeyRound className="h-4 w-4 mr-2" />
                              Reset Password
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {user.is_banned ? (
                              <DropdownMenuItem onClick={() => handleSingleBanToggle(user.id, false)}>
                                <UserCheck className="h-4 w-4 mr-2" />
                                Enable Account
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => setBanConfirmUserId(user.id)}
                                className="text-destructive"
                              >
                                <UserX className="h-4 w-4 mr-2" />
                                Disable Account
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length} users
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm font-medium">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Email Dialog */}
      <Dialog open={showBulkEmailDialog} onOpenChange={setShowBulkEmailDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Send Bulk Email</DialogTitle>
            <DialogDescription>
              Send an email to {selectedUserIds.size} selected user(s)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Email subject..."
              />
            </div>

            <div>
              <Label htmlFor="body">Message</Label>
              <Textarea
                id="body"
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder="Email body..."
                rows={8}
              />
            </div>

            {isProcessing && (
              <div className="space-y-2">
                <Progress value={processingProgress} />
                <p className="text-sm text-muted-foreground text-center">
                  Sending emails... {Math.round(processingProgress)}%
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkEmailDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendBulkEmail} disabled={isProcessing}>
              <Send className="h-4 w-4 mr-2" />
              Send Emails
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Bulk Action</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {pendingAction?.label.toLowerCase()} for{" "}
              {selectedUserIds.size} user(s)? This action cannot be easily undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {isProcessing && (
            <div className="space-y-2 py-4">
              <Progress value={processingProgress} />
              <p className="text-sm text-muted-foreground text-center">
                Processing... {Math.round(processingProgress)}%
              </p>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeBulkAction}
              disabled={isProcessing}
              className={pendingAction?.variant === "destructive" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {isProcessing ? "Processing..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* User Details Dialog */}
      <Dialog open={showUserDetails} onOpenChange={setShowUserDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>
              Profile, subscription, and activity information
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-6">
              {/* Profile Section */}
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={`https://avatar.vercel.sh/${selectedUser.email}`} />
                  <AvatarFallback className="text-2xl">
                    {selectedUser.full_name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-xl font-semibold">{selectedUser.full_name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                  <div className="flex gap-2 mt-1">
                    {selectedUser.role === "admin" && (
                      <Badge variant="secondary">
                        <Shield className="h-3 w-3 mr-1" />
                        Admin
                      </Badge>
                    )}
                    {selectedUser.is_banned ? (
                      <Badge variant="destructive">Disabled</Badge>
                    ) : (
                      <Badge variant="default" className="bg-safe-food">Active</Badge>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Profile Details */}
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <Users className="h-4 w-4" />
                  Profile
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">User ID</Label>
                    <p className="text-sm font-mono break-all">{selectedUser.id}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Role</Label>
                    <p className="text-sm capitalize">{selectedUser.role}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Onboarding</Label>
                    <p className="text-sm">
                      {selectedUser.onboarding_completed ? "Completed" : "Not completed"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Account Status</Label>
                    <p className="text-sm">{selectedUser.is_banned ? "Disabled" : "Active"}</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Subscription Section */}
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <CreditCard className="h-4 w-4" />
                  Subscription
                </h4>
                {loadingSubscription ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                    Loading subscription data...
                  </div>
                ) : userSubscription ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Status</Label>
                      <p className="text-sm">
                        <Badge
                          variant={
                            userSubscription.status === "active" ? "default" :
                            userSubscription.status === "trialing" ? "secondary" :
                            "destructive"
                          }
                          className={userSubscription.status === "active" ? "bg-safe-food" : ""}
                        >
                          {userSubscription.status}
                        </Badge>
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Billing Cycle</Label>
                      <p className="text-sm capitalize">{userSubscription.billing_cycle || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Current Period</Label>
                      <p className="text-sm">
                        {userSubscription.current_period_start
                          ? `${format(new Date(userSubscription.current_period_start), "MMM d")} - ${
                              userSubscription.current_period_end
                                ? format(new Date(userSubscription.current_period_end), "MMM d, yyyy")
                                : "N/A"
                            }`
                          : "N/A"}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Auto-Renew</Label>
                      <p className="text-sm">
                        {userSubscription.cancel_at_period_end ? "Cancels at period end" : "Yes"}
                      </p>
                    </div>
                    {userSubscription.trial_end && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Trial Ends</Label>
                        <p className="text-sm">
                          {format(new Date(userSubscription.trial_end), "PPP")}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No active subscription</p>
                )}
              </div>

              <Separator />

              {/* Activity Section */}
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <Activity className="h-4 w-4" />
                  Activity
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Account Created</Label>
                    <p className="text-sm">
                      {format(new Date(selectedUser.created_at), "PPP 'at' p")}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Last Sign In</Label>
                    <p className="text-sm">
                      {selectedUser.last_sign_in_at
                        ? format(new Date(selectedUser.last_sign_in_at), "PPP 'at' p")
                        : "Never"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUserDetails(false)}>
              Close
            </Button>
            {selectedUser && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedUser) handleSingleResetPassword(selectedUser);
                  }}
                >
                  <KeyRound className="h-4 w-4 mr-2" />
                  Reset Password
                </Button>
                {selectedUser.is_banned ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSingleBanToggle(selectedUser.id, false)}
                  >
                    <UserCheck className="h-4 w-4 mr-2" />
                    Enable Account
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setShowUserDetails(false);
                      setBanConfirmUserId(selectedUser.id);
                    }}
                  >
                    <UserX className="h-4 w-4 mr-2" />
                    Disable Account
                  </Button>
                )}
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single User Ban Confirmation Dialog */}
      <AlertDialog open={!!banConfirmUserId} onOpenChange={() => setBanConfirmUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable User Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will prevent the user from accessing their account. They can be re-enabled later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => banConfirmUserId && handleSingleBanToggle(banConfirmUserId, true)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disable Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
