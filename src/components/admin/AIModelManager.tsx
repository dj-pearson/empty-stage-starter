/**
 * AI Model Manager - Centralized AI Configuration UI
 * 
 * Manages AI models and environment configuration from Coolify Team Shared Variables.
 * This component provides a unified interface to:
 * - View and manage AI models (standard and lightweight)
 * - Test AI configuration
 * - Monitor environment variables from Coolify
 * - Configure task-type routing for cost optimization
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  Brain, 
  Sparkles, 
  Zap, 
  Settings, 
  CheckCircle, 
  XCircle, 
  Loader2,
  Copy,
  Server,
  Clock
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AIModel {
  id: string;
  provider: string;
  model_name: string;
  model_display_name: string;
  task_type: 'standard' | 'lightweight';
  is_active: boolean;
  speed_rating: number;
  quality_rating: number;
  cost_rating: number;
}

interface EnvironmentConfig {
  id: string;
  config_key: string;
  coolify_variable: string;
  description: string;
  is_required: boolean;
  default_value: string | null;
}

interface TestResult {
  success: boolean;
  config: {
    defaultProvider: string;
    defaultModel: string;
    lightweightModel: string;
    claudeApiKey?: string;
    openaiApiKey?: string;
  };
  database: {
    connected: boolean;
  };
  tests?: {
    standard?: { success: boolean; latencyMs: number; error?: string };
    lightweight?: { success: boolean; latencyMs: number; error?: string };
  };
  errors: string[];
}

export function AIModelManager() {
  const [models, setModels] = useState<AIModel[]>([]);
  const [envConfig, setEnvConfig] = useState<EnvironmentConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load models
      const { data: modelsData, error: modelsError } = await supabase
        .from('ai_model_configurations')
        .select('*')
        .order('task_type', { ascending: true })
        .order('is_active', { ascending: false });

      if (modelsError) throw modelsError;
      setModels((modelsData as AIModel[]) || []);

      // Load environment config
      const { data: envData, error: envError } = await supabase
        .from('ai_environment_config')
        .select('*')
        .order('is_required', { ascending: false });

      if (envError) throw envError;
      setEnvConfig((envData as EnvironmentConfig[]) || []);

    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load AI configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConfiguration = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const { data, error } = await invokeEdgeFunction<TestResult>('test-ai-configuration', {
        body: { testType: 'full' }
      });

      if (error) throw error;

      setTestResult(data);

      if (data?.success) {
        toast.success('AI configuration test passed!');
      } else {
        toast.error('AI configuration test failed', {
          description: data?.errors.join(', ')
        });
      }
    } catch (error) {
      console.error('Test failed:', error);
      toast.error('Failed to test configuration');
      setTestResult({
        success: false,
        config: { defaultProvider: '', defaultModel: '', lightweightModel: '' },
        database: { connected: false },
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      });
    } finally {
      setIsTesting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const renderModelCard = (model: AIModel) => (
    <Card key={model.id} className="mb-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              {model.task_type === 'lightweight' ? (
                <Zap className="h-5 w-5 text-yellow-500" />
              ) : (
                <Brain className="h-5 w-5 text-blue-500" />
              )}
              {model.model_display_name}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {model.provider} · {model.model_name}
            </CardDescription>
          </div>
          <Badge variant={model.is_active ? "default" : "secondary"}>
            {model.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Speed</div>
            <div className="font-semibold">{model.speed_rating}/10</div>
          </div>
          <div>
            <div className="text-muted-foreground">Quality</div>
            <div className="font-semibold">{model.quality_rating}/10</div>
          </div>
          <div>
            <div className="text-muted-foreground">Cost</div>
            <div className="font-semibold">{model.cost_rating}/10</div>
          </div>
        </div>
        <div className="mt-2">
          <Badge variant="outline" className="text-xs">
            {model.task_type === 'standard' ? 'Complex Tasks' : 'Simple Tasks'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );

  const standardModels = models.filter(m => m.task_type === 'standard');
  const lightweightModels = models.filter(m => m.task_type === 'lightweight');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-8 w-8" />
            AI Model Management
          </h2>
          <p className="text-muted-foreground mt-1">
            Centralized AI configuration powered by Coolify Team Shared Variables
          </p>
        </div>
        <Button onClick={handleTestConfiguration} disabled={isTesting}>
          {isTesting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <Settings className="mr-2 h-4 w-4" />
              Test Configuration
            </>
          )}
        </Button>
      </div>

      {testResult && (
        <Alert variant={testResult.success ? "default" : "destructive"}>
          <AlertDescription>
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                {testResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                {testResult.success ? 'Configuration Test Passed' : 'Configuration Test Failed'}
              </div>
              
              {testResult.tests && (
                <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                  {testResult.tests.standard && (
                    <div className="p-3 bg-secondary/50 rounded">
                      <div className="font-medium">Standard Model</div>
                      <div className="flex items-center gap-2 mt-1">
                        {testResult.tests.standard.success ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span>{testResult.tests.standard.latencyMs}ms</span>
                      </div>
                    </div>
                  )}
                  {testResult.tests.lightweight && (
                    <div className="p-3 bg-secondary/50 rounded">
                      <div className="font-medium">Lightweight Model</div>
                      <div className="flex items-center gap-2 mt-1">
                        {testResult.tests.lightweight.success ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span>{testResult.tests.lightweight.latencyMs}ms</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {testResult.errors.length > 0 && (
                <div className="mt-2 text-sm">
                  <strong>Errors:</strong>
                  <ul className="list-disc list-inside mt-1">
                    {testResult.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">All Models ({models.length})</TabsTrigger>
          <TabsTrigger value="standard">
            <Brain className="h-4 w-4 mr-1" />
            Standard ({standardModels.length})
          </TabsTrigger>
          <TabsTrigger value="lightweight">
            <Zap className="h-4 w-4 mr-1" />
            Lightweight ({lightweightModels.length})
          </TabsTrigger>
          <TabsTrigger value="environment">
            <Server className="h-4 w-4 mr-1" />
            Environment
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-6">
          <div className="grid gap-4 md:grid-cols-2">
            {models.map(renderModelCard)}
          </div>
        </TabsContent>

        <TabsContent value="standard" className="mt-6">
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Standard Models
              </CardTitle>
              <CardDescription>
                For complex tasks: blog posts, code generation, analysis. Higher quality, slower, more expensive.
              </CardDescription>
            </CardHeader>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            {standardModels.map(renderModelCard)}
          </div>
        </TabsContent>

        <TabsContent value="lightweight" className="mt-6">
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-500" />
                Lightweight Models (Haiku)
              </CardTitle>
              <CardDescription>
                For simple tasks: classification, extraction, short summaries. Fast and cost-effective (60-80% savings).
              </CardDescription>
            </CardHeader>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            {lightweightModels.map(renderModelCard)}
          </div>
        </TabsContent>

        <TabsContent value="environment" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Coolify Team Shared Variables
              </CardTitle>
              <CardDescription>
                These variables are managed centrally in Coolify and automatically sync to all projects.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {envConfig.map((config) => (
                  <div key={config.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono bg-secondary px-2 py-1 rounded">
                            {config.config_key}
                          </code>
                          {config.is_required && (
                            <Badge variant="destructive" className="text-xs">Required</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {config.description}
                        </p>
                        {config.default_value && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Default: <code>{config.default_value}</code>
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(`{{ team.${config.coolify_variable} }}`)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Coolify syntax: <code className="bg-secondary px-1 py-0.5 rounded">
                        {'{{ team.' + config.coolify_variable + ' }}'}
                      </code>
                    </div>
                  </div>
                ))}
              </div>

              <Alert className="mt-6">
                <AlertDescription>
                  <strong>How to update variables:</strong>
                  <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
                    <li>Update variable in Coolify Team Settings → Shared Variables</li>
                    <li>Redeploy affected projects in Coolify</li>
                    <li>Changes propagate automatically to all linked projects</li>
                    <li>Test configuration using the button above</li>
                  </ol>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
