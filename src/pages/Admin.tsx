import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Users, Database, ArrowLeft } from "lucide-react";
import { NutritionManager } from "@/components/admin/NutritionManager";
import { UserRolesManager } from "@/components/admin/UserRolesManager";

const Admin = () => {
  const { isAdmin, isLoading } = useAdminCheck();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 flex justify-center items-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Verifying permissions...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-heading font-bold text-primary mb-2">Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage nutrition database and user roles</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>

      <Tabs defaultValue="nutrition" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="nutrition" className="gap-2">
            <Database className="h-4 w-4" />
            Nutrition Database
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            User Roles
          </TabsTrigger>
        </TabsList>

        <TabsContent value="nutrition">
          <Card>
            <CardHeader>
              <CardTitle>Community Nutrition Database</CardTitle>
              <CardDescription>
                Manage the shared nutrition information that all users can reference when adding foods
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NutritionManager />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>User Role Management</CardTitle>
              <CardDescription>
                Assign admin roles to trusted users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UserRolesManager />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Admin;
