// Central Admin Control Panel for all automation, pSEO, and workflow orchestration
// Location: src/components/admin/AdminControlPanel.tsx

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PseoAdminDashboard } from './pseo/PseoAdminDashboard';
import { EmailMarketingManager } from './EmailMarketingManager';
import { LeadCampaignManager } from './LeadCampaignManager';
import { SEOManager } from './SEOManager';
import { BlogCMSManager } from './BlogCMSManager';
import { SocialMediaManager } from './SocialMediaManager';
import { PromotionalCampaignManager } from './PromotionalCampaignManager';
import { FeatureFlagDashboard } from './FeatureFlagDashboard';
import { SupportPerformanceDashboard } from './SupportPerformanceDashboard';
import { AnalyticsDashboard } from './BudgetAnalyticsDashboard';
import { WorkflowBuilder } from './WorkflowBuilder';
import { SystemHealthDashboard } from './SystemHealthDashboard';
import { UserManagementDashboard } from './UserManagementDashboard';
import { SubscriptionManagement } from './SubscriptionManagement';
import { AISettingsManager } from './AISettingsManager';

export function AdminControlPanel() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">EatPal Admin Control Panel</h1>
      <Tabs defaultValue="pseo" className="w-full">
        <TabsList className="flex flex-wrap gap-2 mb-4">
          <TabsTrigger value="pseo">pSEO</TabsTrigger>
          <TabsTrigger value="email">Email Marketing</TabsTrigger>
          <TabsTrigger value="leads">Lead Campaigns</TabsTrigger>
          <TabsTrigger value="seo">SEO Manager</TabsTrigger>
          <TabsTrigger value="blog">Blog CMS</TabsTrigger>
          <TabsTrigger value="social">Social Media</TabsTrigger>
          <TabsTrigger value="promo">Promotions</TabsTrigger>
          <TabsTrigger value="flags">Feature Flags</TabsTrigger>
          <TabsTrigger value="support">Support</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="workflow">Workflow Builder</TabsTrigger>
          <TabsTrigger value="system">System Health</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="ai">AI Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="pseo"><PseoAdminDashboard /></TabsContent>
        <TabsContent value="email"><EmailMarketingManager /></TabsContent>
        <TabsContent value="leads"><LeadCampaignManager /></TabsContent>
        <TabsContent value="seo"><SEOManager /></TabsContent>
        <TabsContent value="blog"><BlogCMSManager /></TabsContent>
        <TabsContent value="social"><SocialMediaManager /></TabsContent>
        <TabsContent value="promo"><PromotionalCampaignManager /></TabsContent>
        <TabsContent value="flags"><FeatureFlagDashboard /></TabsContent>
        <TabsContent value="support"><SupportPerformanceDashboard /></TabsContent>
        <TabsContent value="analytics"><AnalyticsDashboard /></TabsContent>
        <TabsContent value="workflow"><WorkflowBuilder /></TabsContent>
        <TabsContent value="system"><SystemHealthDashboard /></TabsContent>
        <TabsContent value="users"><UserManagementDashboard /></TabsContent>
        <TabsContent value="subscriptions"><SubscriptionManagement /></TabsContent>
        <TabsContent value="ai"><AISettingsManager /></TabsContent>
      </Tabs>
    </div>
  );
}
