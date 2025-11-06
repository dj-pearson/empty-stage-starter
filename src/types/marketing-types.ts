/**
 * Email and marketing-related TypeScript types
 */

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables?: string[];
  category?: string;
  isActive: boolean;
}

export interface EmailCampaign {
  id: string;
  name: string;
  templateId: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused';
  scheduledAt?: string;
  sentAt?: string;
  recipientCount: number;
  openRate?: number;
  clickRate?: number;
}

export interface EmailStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  openRate: number;
  clickRate: number;
}

export interface LeadCapture {
  id: string;
  email: string;
  name?: string;
  source: string;
  metadata?: Record<string, unknown>;
  capturedAt: string;
  status: 'new' | 'contacted' | 'converted' | 'lost';
}

export interface PromotionalCampaign {
  id: string;
  name: string;
  description?: string;
  discount_code?: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  usageCount: number;
  maxUsage?: number;
}

export interface ReferralData {
  id: string;
  referrerId: string;
  refereeId?: string;
  code: string;
  status: 'pending' | 'completed' | 'expired';
  createdAt: string;
  completedAt?: string;
  reward?: number;
}

export interface SocialMediaPost {
  id: string;
  platform: 'facebook' | 'twitter' | 'instagram' | 'linkedin';
  content: string;
  imageUrl?: string;
  scheduledAt?: string;
  postedAt?: string;
  status: 'draft' | 'scheduled' | 'posted' | 'failed';
  engagementCount?: number;
}
