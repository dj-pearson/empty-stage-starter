/**
 * Analytics and tracking-related TypeScript types
 */

export interface AIUsageMetrics {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  timestamp: string;
  userId?: string;
  operation: string;
}

export interface UserAnalytics {
  userId: string;
  sessionCount: number;
  totalTimeSpent: number;
  lastActive: string;
  featureUsage: Record<string, number>;
  conversionEvents: string[];
}

export interface FeatureFlag {
  id: string;
  name: string;
  key: string;
  description?: string;
  isEnabled: boolean;
  rolloutPercentage: number;
  targetUserIds?: string[];
  createdAt: string;
}

export interface AdminTicket {
  id: string;
  userId: string;
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  uptime: number;
  responseTime: number;
  errorRate: number;
  activeUsers: number;
  databaseStatus: 'healthy' | 'slow' | 'down';
  apiStatus: 'healthy' | 'slow' | 'down';
  timestamp: string;
}

export interface ChartDataPoint {
  name: string;
  value: number;
  label?: string;
  color?: string;
}

export interface TimeSeriesData {
  timestamp: string;
  value: number;
  metric: string;
}

export interface AdminDashboardStats {
  totalUsers: number;
  activeUsers: number;
  newSignups: number;
  revenue: number;
  conversionRate: number;
  averageSessionDuration: number;
  topFeatures: Array<{ name: string; usage: number }>;
}
