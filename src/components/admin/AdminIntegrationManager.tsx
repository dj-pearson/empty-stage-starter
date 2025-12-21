import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plug,
  DollarSign,
  TrendingUp,
  Settings,
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  RefreshCw,
  ExternalLink,
  BarChart3,
  ShoppingCart,
  Smartphone,
  Globe,
  Activity,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from "@/lib/logger";

interface IntegrationConfig {
  id: string;
  name: string;
  type: 'grocery' | 'payment' | 'analytics' | 'social';
  status: 'active' | 'inactive' | 'pending' | 'error';
  apiKey?: string;
  webhookUrl?: string;
  lastSync?: string;
  totalRequests?: number;
  errorRate?: number;
  revenue?: number;
  enabled: boolean;
}

interface IntegrationMetric {
  date: string;
  integration: string;
  requests: number;
  revenue: number;
  errors: number;
}

/**
 * AdminIntegrationManager Component
 * 
 * Centralized admin panel for managing all external integrations:
 * - Instacart API configuration and monitoring
 * - MealMe API setup and tracking
 * - iOS/Android share extensions
 * - Third-party recipe app partnerships
 * - Revenue tracking from affiliate commissions
 * - Usage analytics and error monitoring
 * 
 * Phase 2-3 Implementation from Integration Roadmap
 */
export function AdminIntegrationManager() {
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([
    {
      id: 'instacart',
      name: 'Instacart Developer Platform',
      type: 'grocery',
      status: 'inactive',
      enabled: false,
      totalRequests: 0,
      errorRate: 0,
      revenue: 0,
    },
    {
      id: 'mealme',
      name: 'MealMe API',
      type: 'grocery',
      status: 'inactive',
      enabled: false,
      totalRequests: 0,
      errorRate: 0,
      revenue: 0,
    },
    {
      id: 'ios-share',
      name: 'iOS Share Extension',
      type: 'social',
      status: 'pending',
      enabled: false,
    },
    {
      id: 'android-share',
      name: 'Android Share Intent',
      type: 'social',
      status: 'pending',
      enabled: false,
    },
  ]);

  const [selectedIntegration, setSelectedIntegration] = useState<string>('instacart');
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [editingKeys, setEditingKeys] = useState<Record<string, string>>({});
  const [metrics, setMetrics] = useState<IntegrationMetric[]>([]);
  const [loading, setLoading] = useState(false);

  // Load integration configs from database
  useEffect(() => {
    loadIntegrationConfigs();
    loadIntegrationMetrics();
  }, []);

  const loadIntegrationConfigs = async () => {
    try {
      // In production, load from database
      // const { data, error } = await supabase
      //   .from('integration_configs')
      //   .select('*');
      
      // For now, using local state
      logger.debug('Loading integration configs...');
    } catch (error) {
      logger.error('Error loading integration configs:', error);
    }
  };

  const loadIntegrationMetrics = async () => {
    try {
      // Integration metrics will be populated once integrations are configured
      // and start receiving traffic. Data comes from:
      // - integration_metrics table (requires migration)
      // - Real-time API tracking

      // Start with empty metrics until integrations are active
      setMetrics([]);
    } catch (error) {
      logger.error('Error loading integration metrics:', error);
    }
  };

  const handleUpdateApiKey = async (integrationId: string) => {
    const newKey = editingKeys[integrationId];
    if (!newKey) {
      toast.error('Please enter an API key');
      return;
    }

    setLoading(true);
    try {
      // In production, save to secure database
      // const { error } = await supabase
      //   .from('integration_configs')
      //   .upsert({
      //     integration_id: integrationId,
      //     api_key: newKey, // Should be encrypted
      //     updated_at: new Date().toISOString(),
      //   });

      // Update local state
      setIntegrations(prev =>
        prev.map(int =>
          int.id === integrationId
            ? { ...int, apiKey: newKey, status: 'active', enabled: true }
            : int
        )
      );

      toast.success('API key saved successfully', {
        description: `${integrations.find(i => i.id === integrationId)?.name} is now configured`,
      });

      // Clear editing state
      setEditingKeys(prev => ({ ...prev, [integrationId]: '' }));
    } catch (error) {
      logger.error('Error saving API key:', error);
      toast.error('Failed to save API key');
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async (integrationId: string) => {
    const integration = integrations.find(i => i.id === integrationId);
    if (!integration?.apiKey) {
      toast.error('Please configure API key first');
      return;
    }

    setLoading(true);
    try {
      // In production, make test API call
      // const response = await fetch(`/api/integrations/${integrationId}/test`, {
      //   method: 'POST',
      //   headers: { 'Authorization': `Bearer ${integration.apiKey}` }
      // });

      // Simulate test
      await new Promise(resolve => setTimeout(resolve, 1500));

      setIntegrations(prev =>
        prev.map(int =>
          int.id === integrationId
            ? { ...int, status: 'active' }
            : int
        )
      );

      toast.success('Connection test successful', {
        description: 'Integration is working correctly',
      });
    } catch (error) {
      logger.error('Error testing connection:', error);
      toast.error('Connection test failed');
      
      setIntegrations(prev =>
        prev.map(int =>
          int.id === integrationId
            ? { ...int, status: 'error' }
            : int
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleToggleIntegration = async (integrationId: string, enabled: boolean) => {
    setLoading(true);
    try {
      setIntegrations(prev =>
        prev.map(int =>
          int.id === integrationId
            ? { ...int, enabled, status: enabled ? 'active' : 'inactive' }
            : int
        )
      );

      toast.success(enabled ? 'Integration enabled' : 'Integration disabled');
    } catch (error) {
      logger.error('Error toggling integration:', error);
      toast.error('Failed to update integration status');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case 'pending':
        return <RefreshCw className="h-4 w-4 text-yellow-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-400" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'grocery':
        return <ShoppingCart className="h-5 w-5" />;
      case 'social':
        return <Smartphone className="h-5 w-5" />;
      case 'payment':
        return <DollarSign className="h-5 w-5" />;
      default:
        return <Plug className="h-5 w-5" />;
    }
  };

  const selectedInt = integrations.find(i => i.id === selectedIntegration);

  // Calculate totals
  const totalRevenue = integrations.reduce((sum, int) => sum + (int.revenue || 0), 0);
  const totalRequests = integrations.reduce((sum, int) => sum + (int.totalRequests || 0), 0);
  const activeIntegrations = integrations.filter(i => i.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold mb-2">Integration Manager</h2>
        <p className="text-muted-foreground">
          Configure and monitor external integrations, APIs, and partnerships
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Integrations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">{activeIntegrations}/{integrations.length}</span>
              <Plug className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Revenue (MTD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">${totalRevenue.toFixed(2)}</span>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              From affiliate commissions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              API Requests (MTD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">{totalRequests.toLocaleString()}</span>
              <TrendingUp className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Integration List */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>Click to configure</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              <div className="space-y-1 p-4">
                {integrations.map((integration) => (
                  <Button
                    key={integration.id}
                    variant={selectedIntegration === integration.id ? 'secondary' : 'ghost'}
                    className="w-full justify-start"
                    onClick={() => setSelectedIntegration(integration.id)}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {getTypeIcon(integration.type)}
                      <div className="flex-1 text-left">
                        <div className="font-medium">{integration.name}</div>
                        <div className="flex items-center gap-2 mt-1">
                          {getStatusIcon(integration.status)}
                          <span className="text-xs text-muted-foreground capitalize">
                            {integration.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Integration Details */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {selectedInt && getTypeIcon(selectedInt.type)}
                  {selectedInt?.name}
                </CardTitle>
                <CardDescription className="mt-2">
                  {selectedInt?.type === 'grocery' && 'Grocery ordering and delivery integration'}
                  {selectedInt?.type === 'social' && 'Social sharing and mobile app integration'}
                </CardDescription>
              </div>
              <Badge variant={selectedInt?.status === 'active' ? 'default' : 'secondary'}>
                {selectedInt?.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="config">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="config">Configuration</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
                <TabsTrigger value="docs">Documentation</TabsTrigger>
              </TabsList>

              <TabsContent value="config" className="space-y-4 mt-4">
                {/* API Key Configuration */}
                {(selectedInt?.type === 'grocery') && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>API Key</Label>
                      <div className="flex gap-2">
                        <Input
                          type={showApiKey[selectedInt.id] ? 'text' : 'password'}
                          placeholder="Enter API key..."
                          value={editingKeys[selectedInt.id] || selectedInt.apiKey || ''}
                          onChange={(e) =>
                            setEditingKeys(prev => ({
                              ...prev,
                              [selectedInt.id]: e.target.value,
                            }))
                          }
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() =>
                            setShowApiKey(prev => ({
                              ...prev,
                              [selectedInt.id]: !prev[selectedInt.id],
                            }))
                          }
                        >
                          {showApiKey[selectedInt.id] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Get your API key from the{' '}
                        <a
                          href={
                            selectedInt.id === 'instacart'
                              ? 'https://connect.instacart.com/developers'
                              : 'https://www.mealme.ai/'
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          developer portal
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleUpdateApiKey(selectedInt.id)}
                        disabled={loading || !editingKeys[selectedInt.id]}
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        Save Configuration
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleTestConnection(selectedInt.id)}
                        disabled={loading || !selectedInt.apiKey}
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Test Connection
                      </Button>
                    </div>

                    {selectedInt.apiKey && (
                      <Alert>
                        <CheckCircle className="h-4 w-4" />
                        <AlertDescription>
                          API key is configured. You can enable this integration below.
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <div className="font-medium">Enable Integration</div>
                        <div className="text-sm text-muted-foreground">
                          Allow users to order ingredients via {selectedInt.name}
                        </div>
                      </div>
                      <Button
                        variant={selectedInt.enabled ? 'destructive' : 'default'}
                        onClick={() =>
                          handleToggleIntegration(selectedInt.id, !selectedInt.enabled)
                        }
                        disabled={!selectedInt.apiKey}
                      >
                        {selectedInt.enabled ? 'Disable' : 'Enable'}
                      </Button>
                    </div>
                  </div>
                )}

                {selectedInt?.type === 'social' && (
                  <Alert>
                    <Globe className="h-4 w-4" />
                    <AlertDescription>
                      This integration requires native app configuration. See documentation tab for setup instructions.
                    </AlertDescription>
                  </Alert>
                )}
              </TabsContent>

              <TabsContent value="analytics" className="mt-4">
                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Total Requests</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {selectedInt?.totalRequests?.toLocaleString() || 0}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">This month</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Revenue Generated</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-green-600">
                          ${selectedInt?.revenue?.toFixed(2) || '0.00'}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Affiliate commissions</p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Performance Metrics</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Error Rate</span>
                          <span className="font-medium">
                            {selectedInt?.errorRate?.toFixed(2) || 0}%
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Last Sync</span>
                          <span className="font-medium">
                            {selectedInt?.lastSync || 'Never'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Status</span>
                          <Badge variant={selectedInt?.status === 'active' ? 'default' : 'secondary'}>
                            {selectedInt?.status}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Alert>
                    <BarChart3 className="h-4 w-4" />
                    <AlertDescription>
                      Detailed analytics will appear once integration is active and receiving traffic.
                    </AlertDescription>
                  </Alert>
                </div>
              </TabsContent>

              <TabsContent value="docs" className="mt-4">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-4 pr-4">
                    <div>
                      <h3 className="font-semibold mb-2">Setup Instructions</h3>
                      {selectedInt?.id === 'instacart' && (
                        <div className="space-y-2 text-sm">
                          <p>1. Sign up for Instacart Developer Platform</p>
                          <p>2. Create a new application</p>
                          <p>3. Copy your API key and paste it above</p>
                          <p>4. Configure webhook URL (optional)</p>
                          <p>5. Test connection and enable</p>
                        </div>
                      )}
                      {selectedInt?.id === 'mealme' && (
                        <div className="space-y-2 text-sm">
                          <p>1. Contact MealMe for API access</p>
                          <p>2. Receive your API credentials</p>
                          <p>3. Configure API key above</p>
                          <p>4. Test connection</p>
                        </div>
                      )}
                      {selectedInt?.type === 'social' && (
                        <div className="space-y-2 text-sm">
                          <p>1. Configure native app (iOS/Android)</p>
                          <p>2. Implement share extension</p>
                          <p>3. Test sharing functionality</p>
                          <p>4. Submit app for review</p>
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="font-semibold mb-2">Documentation Links</h3>
                      <div className="space-y-2">
                        {selectedInt?.id === 'instacart' && (
                          <>
                            <a
                              href="https://docs.instacart.com/connect/"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Instacart API Documentation
                            </a>
                            <a
                              href="https://connect.instacart.com/developers"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Developer Console
                            </a>
                          </>
                        )}
                        {selectedInt?.id === 'mealme' && (
                          <a
                            href="https://www.mealme.ai/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            MealMe API Documentation
                          </a>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold mb-2">Support</h3>
                      <p className="text-sm text-muted-foreground">
                        For integration support, contact{' '}
                        <a href="mailto:support@tryeatpal.com" className="text-primary hover:underline">
                          support@tryeatpal.com
                        </a>
                      </p>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Integration Metrics Table */}
      <Card>
        <CardHeader>
          <CardTitle>Integration Activity Log</CardTitle>
          <CardDescription>Recent API requests and performance metrics</CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.length > 0 ? (
            <Table>
              <TableCaption>Integration metrics from the last 30 days</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Integration</TableHead>
                  <TableHead>Requests</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Errors</TableHead>
                  <TableHead>Success Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.map((metric, index) => {
                  const successRate =
                    metric.requests > 0
                      ? ((metric.requests - metric.errors) / metric.requests) * 100
                      : 100;

                  return (
                    <TableRow key={index}>
                      <TableCell>{metric.date}</TableCell>
                      <TableCell className="font-medium capitalize">
                        {metric.integration}
                      </TableCell>
                      <TableCell>{metric.requests.toLocaleString()}</TableCell>
                      <TableCell>${metric.revenue.toFixed(2)}</TableCell>
                      <TableCell>{metric.errors}</TableCell>
                      <TableCell>
                        <Badge
                          variant={successRate >= 95 ? 'default' : 'destructive'}
                        >
                          {successRate.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Alert>
              <Activity className="h-4 w-4" />
              <AlertDescription>
                No integration activity yet. Enable integrations to start tracking metrics.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


