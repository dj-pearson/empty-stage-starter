import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
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
  MoreVertical,
  UserX,
  UserCheck,
  Mail,
  Calendar,
  Clock,
  Download,
  Shield,
  Eye,
  CheckSquare,
  Square,
  Users,
  Send,
  Trash2,
  RefreshCw,
  FileSpreadsheet,
  FileText,
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
  type: "ban" | "unban" | "make_admin" | "remove_admin" | "send_email" | "delete" | "export";
  label: string;
  icon: React.ReactNode;
  variant?: "default" | "destructive" | "outline";
}

export function BulkUserManagement() {
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
  const [userStats, setUserStats] = useState({
    total: 0,
    active: 0,
    onboarded: 0,
    banned: 0,
  });

  const bulkActions: BulkAction[] = [
    { type: "ban", label: "Ban Selected", icon: <UserX className="h-4 w-4" />, variant: "destructive" },
    { type: "unban", label: "Unban Selected", icon: <UserCheck className="h-4 w-4" /> },
    { type: "make_admin", label: "Make Admin", icon: <Shield className="h-4 w-4" /> },
    { type: "remove_admin", label: "Remove Admin", icon: <Shield className="h-4 w-4" /> },
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

  useState(() => {
    loadUsers();
  });

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    filterUsers(users, value, statusFilter);
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    filterUsers(users, searchQuery, value);
  };

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
          default:
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

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
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
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
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
    </div>
  );
}
