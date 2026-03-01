import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { toast } from "@/hooks/use-toast";
import { Brain, Plus, Trash2, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { logger } from "@/lib/logger";

type AIModel = {
  id: string;
  name: string;
  provider: string;
  model_name: string;
  api_key_env_var: string;
  auth_type: string;
  endpoint_url: string;
  is_active: boolean;
  temperature?: number;
  max_tokens?: number;
  additional_params?: Record<string, unknown>;
};

export function AISettingsManager() {
  const [models, setModels] = useState<AIModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteModelId, setDeleteModelId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    provider: "claude",
    model_name: "",
    api_key_env_var: "",
    auth_type: "x-api-key",
    endpoint_url: "",
    temperature: 0.7,
    max_tokens: 4096,
  });

  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_settings')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setModels((data as unknown as AIModel[]) || []);
    } catch (error) {
      logger.error('Error fetching AI models:', error);
      toast({
        title: "Error",
        description: "Failed to load AI model settings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetActive = async (id: string) => {
    try {
      // Deactivate all models
      await supabase
        .from('ai_settings')
        .update({ is_active: false })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Update all

      // Activate selected model
      const { error } = await supabase
        .from('ai_settings')
        .update({ is_active: true })
        .eq('id', id);

      if (error) throw error;

      await fetchModels();
      toast({
        title: "Model activated",
        description: "AI model has been set as active",
      });
    } catch (error) {
      logger.error('Error setting active model:', error);
      toast({
        title: "Error",
        description: "Failed to activate model",
        variant: "destructive",
      });
    }
  };

  const handleTestModel = async () => {
    const activeModel = models.find(m => m.is_active);
    if (!activeModel) {
      toast({
        title: "No active model",
        description: "Please select an active model first",
        variant: "destructive",
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      // Call edge function to test the AI model
      const { data, error } = await invokeEdgeFunction('test-ai-model', {
        body: { prompt: 'Hello! Please respond with "Test successful" to confirm you are working.' }
      });

      if (error) throw error;

      if (data.error) {
        setTestResult({ success: false, message: data.error });
        toast({
          title: "Test failed",
          description: data.error,
          variant: "destructive",
        });
      } else {
        setTestResult({ success: true, message: data.response });
        toast({
          title: "Test successful",
          description: "AI model is responding correctly",
        });
      }
    } catch (error: unknown) {
      logger.error('Error testing model:', error);
      const msg = error instanceof Error ? error.message : 'Failed to test AI model';
      setTestResult({ success: false, message: msg });
      toast({
        title: "Test failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleAddModel = async () => {
    try {
      const { error } = await supabase.from('ai_settings').insert({
        ...formData,
        temperature: Number(formData.temperature),
        max_tokens: Number(formData.max_tokens),
      });

      if (error) throw error;

      await fetchModels();
      setIsDialogOpen(false);
      setFormData({
        name: "",
        provider: "claude",
        model_name: "",
        api_key_env_var: "",
        auth_type: "x-api-key",
        endpoint_url: "",
        temperature: 0.7,
        max_tokens: 4096,
      });

      toast({
        title: "Model added",
        description: "AI model configuration has been saved",
      });
    } catch (error: unknown) {
      logger.error('Error adding model:', error);
      const msg = error instanceof Error ? error.message : 'Failed to add model';
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
    }
  };

  const handleDeleteModel = async (id: string) => {
    try {
      const { error } = await supabase
        .from('ai_settings')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchModels();
      toast({
        title: "Model deleted",
        description: "AI model configuration has been removed",
      });
    } catch (error: unknown) {
      logger.error('Error deleting model:', error);
      const msg = error instanceof Error ? error.message : 'Failed to delete model';
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
    }
  };

  const activeModel = models.find(m => m.is_active);

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6" />
            AI Model Settings
          </h2>
          <p className="text-muted-foreground mt-1">
            Configure and manage AI models for intelligent features
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Model
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add AI Model Configuration</DialogTitle>
              <DialogDescription>
                Configure a new AI model provider for use in the application
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Model Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Claude Sonnet 4.5"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="provider">Provider</Label>
                  <Select value={formData.provider} onValueChange={(v) => setFormData({ ...formData, provider: v })}>
                    <SelectTrigger id="provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="claude">Claude (Anthropic)</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="gemini">Google Gemini</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="model_name">Model Identifier</Label>
                <Input
                  id="model_name"
                  value={formData.model_name}
                  onChange={(e) => setFormData({ ...formData, model_name: e.target.value })}
                  placeholder="e.g., claude-sonnet-4-5-20250929"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endpoint_url">API Endpoint URL</Label>
                <Input
                  id="endpoint_url"
                  value={formData.endpoint_url}
                  onChange={(e) => setFormData({ ...formData, endpoint_url: e.target.value })}
                  placeholder="e.g., https://api.anthropic.com/v1/messages"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="api_key_env_var">API Key Secret Name</Label>
                  <Input
                    id="api_key_env_var"
                    value={formData.api_key_env_var}
                    onChange={(e) => setFormData({ ...formData, api_key_env_var: e.target.value })}
                    placeholder="e.g., CLAUDE_API_KEY"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="auth_type">Authentication Type</Label>
                  <Select value={formData.auth_type} onValueChange={(v) => setFormData({ ...formData, auth_type: v })}>
                    <SelectTrigger id="auth_type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="x-api-key">X-Api-Key Header</SelectItem>
                      <SelectItem value="bearer">Bearer Token</SelectItem>
                      <SelectItem value="api-key">API-Key Header</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="temperature">Temperature (0-1)</Label>
                  <Input
                    id="temperature"
                    type="number"
                    min="0"
                    max="1"
                    step="0.1"
                    value={formData.temperature}
                    onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_tokens">Max Tokens</Label>
                  <Input
                    id="max_tokens"
                    type="number"
                    value={formData.max_tokens}
                    onChange={(e) => setFormData({ ...formData, max_tokens: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddModel}>
                Add Model
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Active Model Card */}
      {activeModel && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Active AI Model
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Model</p>
                <p className="font-medium">{activeModel.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Provider</p>
                <Badge variant="outline">{activeModel.provider}</Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Model ID</p>
                <p className="font-mono text-sm">{activeModel.model_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Auth Type</p>
                <Badge variant="secondary">{activeModel.auth_type}</Badge>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleTestModel} disabled={isTesting} className="gap-2">
                {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Test Model
              </Button>
            </div>

            {testResult && (
              <Alert variant={testResult.success ? "default" : "destructive"}>
                <AlertDescription>
                  <strong>{testResult.success ? "✅ Success:" : "❌ Error:"}</strong> {testResult.message}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Available Models List */}
      <Card>
        <CardHeader>
          <CardTitle>Available Models ({models.length})</CardTitle>
          <CardDescription>Select which AI model to use for intelligent features</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {models.map((model) => (
              <div
                key={model.id}
                className={`flex items-center justify-between p-4 border rounded-lg ${
                  model.is_active ? 'border-primary bg-primary/5' : ''
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{model.name}</p>
                    {model.is_active && <Badge variant="default">Active</Badge>}
                  </div>
                  <div className="flex gap-4 mt-1">
                    <span className="text-sm text-muted-foreground">Provider: {model.provider}</span>
                    <span className="text-sm text-muted-foreground">Model: {model.model_name}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {!model.is_active && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSetActive(model.id)}
                    >
                      Set Active
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteModelId(model.id)}
                    disabled={model.is_active}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteModelId !== null} onOpenChange={(open) => { if (!open) setDeleteModelId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete AI model?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the "{models.find(m => m.id === deleteModelId)?.name}" model configuration. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteModelId) {
                  handleDeleteModel(deleteModelId);
                  setDeleteModelId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
