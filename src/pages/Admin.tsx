import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
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
import { PromotionalCampaignManager } from "@/components/admin/PromotionalCampaignManager";
import { ComplementarySubscriptionManager } from "@/components/admin/ComplementarySubscriptionManager";
import { ReferralProgramManager } from "@/components/admin/ReferralProgramManager";
import { BarcodeEnrichmentTool } from "@/components/admin/BarcodeEnrichmentTool";
import { FeatureFlagDashboard } from "@/components/admin/FeatureFlagDashboard";
import { TicketQueue } from "@/components/admin/TicketQueue";

const Admin = () => {
  const { isAdmin, isLoading } = useAdminCheck();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState("users");

  useEffect(() => {
    // Check if this is an OAuth callback
    const urlParams = new URLSearchParams(location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    if (error) {
      toast.error(`OAuth error: ${error}`);
      return;
    }

    if (code && state) {
      console.log('Admin - OAuth callback detected');
      
      // Add immediate popup close attempt for safety
      if (window.opener && window.opener !== window) {
        console.log('Admin - Attempting immediate popup close...');
        
        // Try multiple methods to close the popup
        setTimeout(() => {
          try {
            // First try same-origin
            window.opener.postMessage({ 
              type: 'GSC_OAUTH_SUCCESS', 
              code, 
              state 
            }, window.location.origin);
            
            // Then try wildcard as fallback
            setTimeout(() => {
              window.opener.postMessage({ 
                type: 'GSC_OAUTH_SUCCESS', 
                code, 
                state 
              }, '*');
              
              // Force close after message attempts
              setTimeout(() => {
                try {
                  window.close();
                } catch (e) {
                  console.log('Admin - Window close blocked, but message sent');
                }
              }, 100);
            }, 50);
          } catch (e) {
            console.error('Admin - Immediate close failed:', e);
          }
        }, 100);
      }
      
      // Handle OAuth callback
      handleOAuthCallback(code, state);
    }
  }, [location]);

  const handleOAuthCallback = async (code: string, state: string) => {
    console.log('Admin OAuth callback detected:', { code: code?.substring(0, 10) + '...', state: state?.substring(0, 10) + '...' });
    
    try {
      // Check if this is running in a popup window
      const isPopup = window.opener && window.opener !== window;
      console.log('Admin - Is popup window:', isPopup);
      
      if (isPopup) {
        // If this is a popup, communicate with parent and close
        try {
          console.log('Admin - Sending message to parent window...');
          
          // Send success message to parent window
          window.opener.postMessage({ 
            type: 'GSC_OAUTH_SUCCESS', 
            code, 
            state 
          }, window.location.origin);
          
          console.log('Admin - Message sent, closing popup...');
          
          // Add a small delay to ensure message is sent
          setTimeout(() => {
            window.close();
          }, 100);
          return;
        } catch (e) {
          console.error('Admin - Error communicating with parent window:', e);
        }
      }

      console.log('Admin - Handling OAuth callback directly...');

      // If not a popup or communication failed, handle callback directly
      const response = await fetch(`${supabase.supabaseUrl}/functions/v1/gsc-oauth?action=callback&code=${code}&state=${state}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${supabase.supabaseKey}`,
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'OAuth callback failed');
      }

      const data = await response.json();
      
      if (data.success) {
        toast.success("Successfully connected to Google Search Console!");
        
        // Clear URL parameters and switch to SEO tab
        window.history.replaceState({}, document.title, '/admin');
        setActiveTab("seo");
      } else {
        throw new Error(data.error || 'OAuth callback failed');
      }
    } catch (error: any) {
      console.error('Admin - OAuth callback error:', error);
      toast.error(`Failed to complete OAuth: ${error.message}`);
      
      // Clear URL parameters even on error
      window.history.replaceState({}, document.title, '/admin');
    }
  };

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

  // Check if this is an OAuth callback popup
  const urlParams = new URLSearchParams(location.search);
  const isOAuthCallback = urlParams.has('code') && urlParams.has('state');
  const isPopup = window.opener && window.opener !== window;

  if (isOAuthCallback && isPopup) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center p-8 max-w-md">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold mb-2">Completing Authorization...</h2>
          <p className="text-muted-foreground mb-4">
            Please wait while we complete your Google Search Console connection.
          </p>
          <button 
            onClick={() => window.close()} 
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Close Window
          </button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full">
        <AdminSidebar activeTab={activeTab} onTabChange={setActiveTab} />
        
        <main className="flex-1 overflow-auto">
          <div className="border-b bg-background sticky top-0 z-10">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <div>
                  <h1 className="text-2xl md:text-4xl font-heading font-bold text-primary">Admin Dashboard</h1>
                  <p className="text-sm text-muted-foreground hidden md:block">Manage nutrition database and user roles</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Back to Dashboard</span>
                <span className="sm:hidden">Back</span>
              </Button>
            </div>
          </div>

          <div className="p-4 md:p-6">
            {activeTab === "users" && (
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
            )}

            {activeTab === "subscriptions" && <SubscriptionManagement />}

            {activeTab === "complementary" && (
              <Card>
                <CardHeader>
                  <CardTitle>Complementary Subscriptions</CardTitle>
                  <CardDescription>
                    Grant free subscriptions to specific users
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ComplementarySubscriptionManager />
                </CardContent>
              </Card>
            )}

            {activeTab === "referrals" && <ReferralProgramManager />}

            {activeTab === "campaigns" && (
              <Card>
                <CardHeader>
                  <CardTitle>Promotional Campaigns</CardTitle>
                  <CardDescription>
                    Create discount campaigns and special offers
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PromotionalCampaignManager />
                </CardContent>
              </Card>
            )}

            {activeTab === "leads" && <LeadCampaignManager />}

            {activeTab === "social" && (
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
            )}

            {activeTab === "blog" && (
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
            )}

            {activeTab === "email" && (
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
            )}

            {activeTab === "seo" && (
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
            )}

            {activeTab === "nutrition" && (
              <div className="space-y-4">
                <BarcodeEnrichmentTool />
                
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
              </div>
            )}

            {activeTab === "roles" && (
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
            )}

            {activeTab === "ai" && <AISettingsManager />}
            
            {activeTab === "flags" && (
              <Card>
                <CardHeader>
                  <CardTitle>Feature Flags</CardTitle>
                  <CardDescription>
                    Control feature rollout and conduct A/B tests
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FeatureFlagDashboard />
                </CardContent>
              </Card>
            )}
            
            {activeTab === "tickets" && (
              <Card>
                <CardHeader>
                  <CardTitle>Support Tickets</CardTitle>
                  <CardDescription>
                    Manage user support requests and tickets
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <TicketQueue />
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Admin;
