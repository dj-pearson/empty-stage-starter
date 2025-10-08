import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Users, Database, ArrowLeft, Brain, UserCog, CreditCard, Target, Share2, BookOpen, Mail, Search } from "lucide-react";
import { NutritionManager } from "@/components/admin/NutritionManager";
import { UserRolesManager } from "@/components/admin/UserRolesManager";
import { AISettingsManager } from "@/components/admin/AISettingsManager";
import { UserManagementDashboard } from "@/components/admin/UserManagementDashboard";
import { SubscriptionManagement } from "@/components/admin/SubscriptionManagement";
import { LeadCampaignManager } from "@/components/admin/LeadCampaignManager";
import { SocialMediaManager } from "@/components/admin/SocialMediaManager";
import { BlogCMSManager } from "@/components/admin/BlogCMSManager";
import { EmailMarketingManager } from "@/components/admin/EmailMarketingManager";
import { SEOManager } from "@/components/admin/SEOManager";

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

      <Tabs defaultValue="users" className="space-y-6">
        <TabsList className="grid w-full max-w-7xl grid-cols-5 lg:grid-cols-10 gap-1">
          <TabsTrigger value="users" className="gap-2">
            <UserCog className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Subscriptions
          </TabsTrigger>
          <TabsTrigger value="leads" className="gap-2">
            <Target className="h-4 w-4" />
            Leads
          </TabsTrigger>
          <TabsTrigger value="social" className="gap-2">
            <Share2 className="h-4 w-4" />
            Social
          </TabsTrigger>
          <TabsTrigger value="blog" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Blog
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-2">
            <Mail className="h-4 w-4" />
            Email
          </TabsTrigger>
          <TabsTrigger value="seo" className="gap-2">
            <Search className="h-4 w-4" />
            SEO
          </TabsTrigger>
          <TabsTrigger value="nutrition" className="gap-2">
            <Database className="h-4 w-4" />
            Nutrition
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-2">
            <Users className="h-4 w-4" />
            Roles
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-2">
            <Brain className="h-4 w-4" />
            AI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>
                View, manage, and moderate all platform users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UserManagementDashboard />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscriptions">
          <SubscriptionManagement />
        </TabsContent>

        <TabsContent value="leads">
          <LeadCampaignManager />
        </TabsContent>

        <TabsContent value="social">
          <Card>
            <CardHeader>
              <CardTitle>Social Media Management</CardTitle>
              <CardDescription>
                Schedule and manage posts across multiple social media platforms
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SocialMediaManager />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="blog">
          <Card>
            <CardHeader>
              <CardTitle>Blog Content Management</CardTitle>
              <CardDescription>
                Create, edit, and publish blog posts with AI-powered content generation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BlogCMSManager />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email">
          <Card>
            <CardHeader>
              <CardTitle>Email Marketing</CardTitle>
              <CardDescription>
                Manage subscribers, create campaigns, and track email performance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EmailMarketingManager />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seo">
          <Card>
            <CardHeader>
              <CardTitle>SEO Management</CardTitle>
              <CardDescription>
                Configure SEO settings, generate robots.txt, sitemap.xml, and more
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SEOManager />
            </CardContent>
          </Card>
        </TabsContent>

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

        <TabsContent value="roles">
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

        <TabsContent value="ai">
          <AISettingsManager />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Admin;
