import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Shield, ShieldOff } from "lucide-react";

type UserRole = {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
};

export const UserRolesManager = () => {
  const [roles, setRoles] = useState<UserRole[]>([]);

  useEffect(() => {
    fetchUserRoles();
  }, []);

  const fetchUserRoles = async () => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch user roles",
        variant: "destructive",
      });
    } else {
      setRoles(data || []);
    }
  };

  const handleRemoveAdmin = async (roleId: string) => {
    if (!confirm("Are you sure you want to remove admin access for this user?")) return;

    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("id", roleId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to remove admin role",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Admin role removed successfully",
      });
      fetchUserRoles();
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-muted/50 p-4 rounded-lg">
        <h3 className="font-semibold mb-2">About User Roles</h3>
        <p className="text-sm text-muted-foreground">
          Admin users can manage the nutrition database and assign roles to other users. 
          Regular users can only manage their own data.
        </p>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User ID</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No admin roles assigned yet
                </TableCell>
              </TableRow>
            ) : (
              roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-mono text-sm">{role.user_id}</TableCell>
                  <TableCell>
                    <Badge variant={role.role === "admin" ? "default" : "secondary"}>
                      {role.role === "admin" ? <Shield className="h-3 w-3 mr-1" /> : null}
                      {role.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(role.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {role.role === "admin" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveAdmin(role.id)}
                      >
                        <ShieldOff className="h-4 w-4 mr-2" />
                        Remove Admin
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
