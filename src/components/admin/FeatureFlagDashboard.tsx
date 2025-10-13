import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Flag,
  Plus,
  Edit,
  Trash2,
  Users,
  TrendingUp,
  RefreshCw,
  BarChart3,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  rollout_percentage: number;
  targeting_rules: Record<string, any>;
  users_last_7d: number;
  enabled_count_7d: number;
  adoption_rate_7d: number | null;
  created_at: string;
  updated_at: string;
}

export function FeatureFlagDashboard() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    key: "",
    name: "",
    description: "",
    enabled: false,
    rollout_percentage: 0,
  });

  useEffect(() => {
    fetchFlags();
  }, []);

  const fetchFlags = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("feature_flag_summary")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setFlags(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading feature flags",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFlag = async (flagId: string, currentEnabled: boolean) => {
    try {
      const { error } = await supabase
        .from("feature_flags")
        .update({ enabled: !currentEnabled })
        .eq("id", flagId);

      if (error) throw error;

      setFlags((prev) =>
        prev.map((flag) => (flag.id === flagId ? { ...flag, enabled: !currentEnabled } : flag))
      );

      toast({
        title: "Feature flag updated",
        description: `Flag has been ${!currentEnabled ? "enabled" : "disabled"}`,
      });
    } catch (error: any) {
      toast({
        title: "Error updating feature flag",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUpdateRollout = async (flagId: string, percentage: number) => {
    try {
      const { error } = await supabase
        .from("feature_flags")
        .update({ rollout_percentage: percentage })
        .eq("id", flagId);

      if (error) throw error;

      setFlags((prev) =>
        prev.map((flag) => (flag.id === flagId ? { ...flag, rollout_percentage: percentage } : flag))
      );

      toast({
        title: "Rollout percentage updated",
        description: `Rollout set to ${percentage}%`,
      });
    } catch (error: any) {
      toast({
        title: "Error updating rollout",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleCreateFlag = async () => {
    try {
      const { data: user } = await supabase.auth.getUser();

      const { error } = await supabase.from("feature_flags").insert({
        key: formData.key.toLowerCase().replace(/\s+/g, "_"),
        name: formData.name,
        description: formData.description,
        enabled: formData.enabled,
        rollout_percentage: formData.rollout_percentage,
        created_by: user.data.user?.id,
      });

      if (error) throw error;

      toast({
        title: "Feature flag created",
        description: "The new feature flag has been created successfully",
      });

      setIsCreateDialogOpen(false);
      setFormData({
        key: "",
        name: "",
        description: "",
        enabled: false,
        rollout_percentage: 0,
      });
      fetchFlags();
    } catch (error: any) {
      toast({
        title: "Error creating feature flag",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteFlag = async (flagId: string) => {
    if (!confirm("Are you sure you want to delete this feature flag?")) {
      return;
    }

    try {
      const { error } = await supabase.from("feature_flags").delete().eq("id", flagId);

      if (error) throw error;

      setFlags((prev) => prev.filter((flag) => flag.id !== flagId));

      toast({
        title: "Feature flag deleted",
        description: "The feature flag has been removed",
      });
    } catch (error: any) {
      toast({
        title: "Error deleting feature flag",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const totalFlags = flags.length;
  const enabledFlags = flags.filter((f) => f.enabled).length;
  const avgAdoptionRate =
    flags.length > 0
      ? flags.reduce((sum, f) => sum + (f.adoption_rate_7d || 0), 0) / flags.length
      : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flag className="h-5 w-5" />
          <h2 className="text-2xl font-bold">Feature Flags</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchFlags} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Flag
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Feature Flag</DialogTitle>
                <DialogDescription>
                  Create a new feature flag for controlled rollout
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="flag-key">Key</Label>
                  <Input
                    id="flag-key"
                    placeholder="my_new_feature"
                    value={formData.key}
                    onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Lowercase letters, numbers, underscores, and hyphens only
                  </p>
                </div>
                <div>
                  <Label htmlFor="flag-name">Name</Label>
                  <Input
                    id="flag-name"
                    placeholder="My New Feature"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="flag-description">Description</Label>
                  <Textarea
                    id="flag-description"
                    placeholder="Describe what this feature does..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="flag-enabled">Enabled</Label>
                  <Switch
                    id="flag-enabled"
                    checked={formData.enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                  />
                </div>
                <div>
                  <Label htmlFor="flag-rollout">Rollout Percentage: {formData.rollout_percentage}%</Label>
                  <Slider
                    id="flag-rollout"
                    min={0}
                    max={100}
                    step={5}
                    value={[formData.rollout_percentage]}
                    onValueChange={([value]) =>
                      setFormData({ ...formData, rollout_percentage: value })
                    }
                    className="mt-2"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateFlag} disabled={!formData.key || !formData.name}>
                  Create Flag
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-2xl font-bold">{totalFlags}</div>
          <div className="text-sm text-muted-foreground">Total Flags</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-green-500">{enabledFlags}</div>
          <div className="text-sm text-muted-foreground">Enabled Flags</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">{avgAdoptionRate.toFixed(1)}%</div>
          <div className="text-sm text-muted-foreground">Avg Adoption Rate</div>
        </Card>
      </div>

      {/* Flags List */}
      <div className="space-y-4">
        {loading ? (
          <Card className="p-8 text-center">
            <RefreshCw className="h-8 w-8 mx-auto mb-2 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading feature flags...</p>
          </Card>
        ) : flags.length === 0 ? (
          <Card className="p-8 text-center">
            <Flag className="h-12 w-12 mx-auto mb-2 opacity-50 text-muted-foreground" />
            <p className="text-muted-foreground">No feature flags yet</p>
            <Button size="sm" className="mt-4" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Flag
            </Button>
          </Card>
        ) : (
          flags.map((flag) => (
            <Card key={flag.id} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold">{flag.name}</h3>
                    <Badge variant={flag.enabled ? "default" : "secondary"}>
                      {flag.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-xs">
                      {flag.key}
                    </Badge>
                  </div>
                  {flag.description && (
                    <p className="text-sm text-muted-foreground">{flag.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={flag.enabled}
                    onCheckedChange={() => handleToggleFlag(flag.id, flag.enabled)}
                  />
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteFlag(flag.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Rollout Control */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Rollout Percentage</Label>
                  <span className="text-sm font-semibold">{flag.rollout_percentage}%</span>
                </div>
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={[flag.rollout_percentage]}
                  onValueChange={([value]) => handleUpdateRollout(flag.id, value)}
                  disabled={!flag.enabled}
                />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-semibold">{flag.users_last_7d || 0}</div>
                    <div className="text-xs text-muted-foreground">Users (7d)</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-semibold">{flag.enabled_count_7d || 0}</div>
                    <div className="text-xs text-muted-foreground">Enabled (7d)</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-semibold">
                      {flag.adoption_rate_7d?.toFixed(1) || 0}%
                    </div>
                    <div className="text-xs text-muted-foreground">Adoption</div>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

