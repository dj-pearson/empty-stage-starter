import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

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

export function UserManagementDashboard() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showUserDetails, setShowUserDetails] = useState(false);
  const [banUserId, setBanUserId] = useState<string | null>(null);
  const [userStats, setUserStats] = useState({
    total: 0,
    active: 0,
    onboarded: 0,
    banned: 0,
  });

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [users, searchQuery, statusFilter]);

  const loadUsers = async () => {
    try {
      setLoading(true);

      // Get all profiles with user roles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select(`
          id,
          full_name,
          onboarding_completed,
          created_at
        `)
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Get auth users (admin only)
      const { data: { users: authUsers }, error: authError } = await supabase.auth.admin.listUsers();

      if (authError) throw authError;

      // Get user roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Combine data
      const combinedUsers: UserProfile[] = profiles?.map((profile) => {
        const authUser = authUsers?.find((u: any) => u.id === profile.id);
        const userRole = roles?.find((r: any) => r.user_id === profile.id);

        return {
          id: profile.id,
          email: authUser?.email || "N/A",
          full_name: profile.full_name || "Unknown",
          created_at: profile.created_at,
          last_sign_in_at: authUser?.last_sign_in_at || null,
          onboarding_completed: profile.onboarding_completed || false,
          role: userRole?.role || "user",
          is_banned: (authUser as any)?.banned_until ? new Date((authUser as any).banned_until) > new Date() : false,
        };
      }) || [];

      setUsers(combinedUsers);

      // Calculate stats
      const stats = {
        total: combinedUsers.length,
        active: combinedUsers.filter((u) => u.last_sign_in_at).length,
        onboarded: combinedUsers.filter((u) => u.onboarding_completed).length,
        banned: combinedUsers.filter((u) => u.is_banned).length,
      };
      setUserStats(stats);
    } catch (error) {
      console.error("Error loading users:", error);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const filterUsers = () => {
    let filtered = [...users];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (user) =>
          user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          user.full_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter === "active") {
      filtered = filtered.filter((u) => u.last_sign_in_at && !u.is_banned);
    } else if (statusFilter === "onboarded") {
      filtered = filtered.filter((u) => u.onboarding_completed);
    } else if (statusFilter === "not-onboarded") {
      filtered = filtered.filter((u) => !u.onboarding_completed);
    } else if (statusFilter === "banned") {
      filtered = filtered.filter((u) => u.is_banned);
    } else if (statusFilter === "admin") {
      filtered = filtered.filter((u) => u.role === "admin");
    }

    setFilteredUsers(filtered);
  };

  const handleBanUser = async (userId: string, ban: boolean) => {
    try {
      if (ban) {
        // Ban for 100 years (effectively permanent)
        const banUntil = new Date();
        banUntil.setFullYear(banUntil.getFullYear() + 100);

        const { error } = await supabase.auth.admin.updateUserById(userId, {
          ban_duration: "876000h", // 100 years in hours
        });

        if (error) throw error;
        toast.success("User banned successfully");
      } else {
        // Unban user
        const { error } = await supabase.auth.admin.updateUserById(userId, {
          ban_duration: "none",
        });

        if (error) throw error;
        toast.success("User unbanned successfully");
      }

      setBanUserId(null);
      loadUsers();
    } catch (error) {
      console.error("Error banning/unbanning user:", error);
      toast.error(ban ? "Failed to ban user" : "Failed to unban user");
    }
  };

  const handleMakeAdmin = async (userId: string) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .upsert({ user_id: userId, role: "admin" });

      if (error) throw error;

      toast.success("User promoted to admin");
      loadUsers();
    } catch (error) {
      console.error("Error making admin:", error);
      toast.error("Failed to promote user");
    }
  };

  const handleRemoveAdmin = async (userId: string) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "admin");

      if (error) throw error;

      toast.success("Admin role removed");
      loadUsers();
    } catch (error) {
      console.error("Error removing admin:", error);
      toast.error("Failed to remove admin role");
    }
  };

  const handleViewUser = (user: UserProfile) => {
    setSelectedUser(user);
    setShowUserDetails(true);
  };

  const handleExportUsers = () => {
    const csv = [
      "Email,Name,Created At,Last Sign In,Onboarded,Role,Status",
      ...filteredUsers.map((u) =>
        [
          u.email,
          u.full_name,
          format(new Date(u.created_at), "yyyy-MM-dd HH:mm"),
          u.last_sign_in_at ? format(new Date(u.last_sign_in_at), "yyyy-MM-dd HH:mm") : "Never",
          u.onboarding_completed ? "Yes" : "No",
          u.role,
          u.is_banned ? "Banned" : "Active",
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `users-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Users exported successfully");
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

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>View and manage all platform users</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
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

            <Button onClick={handleExportUsers} variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>

          {/* Users Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Sign In</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                    <TableRow key={user.id}>
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
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewUser(user)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {user.role === "admin" ? (
                              <DropdownMenuItem onClick={() => handleRemoveAdmin(user.id)}>
                                <Shield className="h-4 w-4 mr-2" />
                                Remove Admin
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => handleMakeAdmin(user.id)}>
                                <Shield className="h-4 w-4 mr-2" />
                                Make Admin
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {user.is_banned ? (
                              <DropdownMenuItem onClick={() => handleBanUser(user.id, false)}>
                                <UserCheck className="h-4 w-4 mr-2" />
                                Unban User
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => setBanUserId(user.id)}
                                className="text-destructive"
                              >
                                <UserX className="h-4 w-4 mr-2" />
                                Ban User
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
        </CardContent>
      </Card>

      {/* User Details Dialog */}
      <Dialog open={showUserDetails} onOpenChange={setShowUserDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>Complete information for this user</DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-6">
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
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">User ID</Label>
                  <p className="text-sm font-mono">{selectedUser.id}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Role</Label>
                  <p className="text-sm capitalize">{selectedUser.role}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Account Created</Label>
                  <p className="text-sm">{format(new Date(selectedUser.created_at), "PPP")}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Last Sign In</Label>
                  <p className="text-sm">
                    {selectedUser.last_sign_in_at
                      ? format(new Date(selectedUser.last_sign_in_at), "PPP")
                      : "Never"}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Onboarding Status</Label>
                  <p className="text-sm">
                    {selectedUser.onboarding_completed ? "Completed" : "Pending"}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Account Status</Label>
                  <p className="text-sm">{selectedUser.is_banned ? "Banned" : "Active"}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Ban Confirmation Dialog */}
      <AlertDialog open={!!banUserId} onOpenChange={() => setBanUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ban User?</AlertDialogTitle>
            <AlertDialogDescription>
              This will prevent the user from accessing their account. They can be unbanned later if
              needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => banUserId && handleBanUser(banUserId, true)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ban User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
