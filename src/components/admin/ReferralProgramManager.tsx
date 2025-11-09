// @ts-nocheck
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Gift, TrendingUp, Users, Award } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { logger } from "@/lib/logger";

interface ReferralConfig {
  id: string;
  tier: string;
  referrer_reward_type: string;
  referrer_reward_value: number;
  referrer_reward_duration_months: number;
  referred_reward_type: string;
  referred_reward_value: number;
  referred_reward_duration_months: number;
  is_active: boolean;
  min_referrals_for_reward: number;
  max_rewards_per_user: number | null;
}

interface ReferralStats {
  total_referrals: number;
  pending_referrals: number;
  completed_referrals: number;
  total_rewards_issued: number;
  top_referrers: Array<{
    user_id: string;
    full_name: string;
    referral_count: number;
  }>;
}

export function ReferralProgramManager() {
  const [configs, setConfigs] = useState<ReferralConfig[]>([]);
  const [selectedTier, setSelectedTier] = useState<string>("standard");
  const [editingConfig, setEditingConfig] = useState<ReferralConfig | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfigs();
    loadStats();
  }, []);

  const loadConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from("referral_program_config")
        .select("*")
        .order("tier");

      if (error) throw error;
      setConfigs(data || []);
      
      if (data && data.length > 0) {
        const config = data.find(c => c.tier === selectedTier) || data[0];
        setEditingConfig(config);
      }
    } catch (error: unknown) {
      logger.error("Error loading configs:", error);
      toast({ title: "Error loading configs", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const { data: referrals } = await supabase
        .from("referrals")
        .select("*");

      const { data: rewards } = await supabase
        .from("referral_rewards")
        .select("*");

      const { data: topReferrers } = await supabase
        .from("referrals")
        .select(`
          referrer_id,
          profiles!referrals_referrer_id_fkey(full_name)
        `)
        .not("referrer_id", "is", null);

      const referrerCounts = new Map<string, { name: string; count: number }>();
      topReferrers?.forEach((ref) => {
        if (ref.referrer_id) {
          const current = referrerCounts.get(ref.referrer_id) || { name: ref.profiles?.full_name || "Unknown", count: 0 };
          referrerCounts.set(ref.referrer_id, { ...current, count: current.count + 1 });
        }
      });

      const topReferrersArray = Array.from(referrerCounts.entries())
        .map(([user_id, data]) => ({ user_id, full_name: data.name, referral_count: data.count }))
        .sort((a, b) => b.referral_count - a.referral_count)
        .slice(0, 10);

      setStats({
        total_referrals: referrals?.length || 0,
        pending_referrals: referrals?.filter(r => r.status === "pending").length || 0,
        completed_referrals: referrals?.filter(r => r.status === "completed" || r.status === "rewarded").length || 0,
        total_rewards_issued: rewards?.length || 0,
        top_referrers: topReferrersArray,
      });
    } catch (error: unknown) {
      logger.error("Error loading stats:", error);
    }
  };

  const handleSaveConfig = async () => {
    if (!editingConfig) return;

    try {
      const { error } = await supabase
        .from("referral_program_config")
        .update({
          referrer_reward_type: editingConfig.referrer_reward_type,
          referrer_reward_value: editingConfig.referrer_reward_value,
          referrer_reward_duration_months: editingConfig.referrer_reward_duration_months,
          referred_reward_type: editingConfig.referred_reward_type,
          referred_reward_value: editingConfig.referred_reward_value,
          referred_reward_duration_months: editingConfig.referred_reward_duration_months,
          is_active: editingConfig.is_active,
          min_referrals_for_reward: editingConfig.min_referrals_for_reward,
          max_rewards_per_user: editingConfig.max_rewards_per_user,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingConfig.id);

      if (error) throw error;

      toast({ title: "Success", description: "Referral program config updated" });
      loadConfigs();
    } catch (error: unknown) {
      logger.error("Error saving config:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Referral Program Manager</h2>
        <p className="text-muted-foreground">Manage referral rewards and track performance</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_referrals || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pending_referrals || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.completed_referrals || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rewards Issued</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_rewards_issued || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="config" className="space-y-4">
        <TabsList>
          <TabsTrigger value="config">Program Configuration</TabsTrigger>
          <TabsTrigger value="leaderboard">Top Referrers</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tier Configuration</CardTitle>
              <CardDescription>Configure rewards for different membership tiers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Membership Tier</Label>
                <Select
                  value={selectedTier}
                  onValueChange={(value) => {
                    setSelectedTier(value);
                    const config = configs.find(c => c.tier === value);
                    if (config) setEditingConfig(config);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editingConfig && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Program Active</Label>
                      <p className="text-sm text-muted-foreground">Enable/disable referral program for this tier</p>
                    </div>
                    <Switch
                      checked={editingConfig.is_active}
                      onCheckedChange={(checked) =>
                        setEditingConfig({ ...editingConfig, is_active: checked })
                      }
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-4 p-4 border rounded-lg">
                      <h3 className="font-semibold">Referrer Rewards</h3>
                      
                      <div className="space-y-2">
                        <Label>Reward Type</Label>
                        <Select
                          value={editingConfig.referrer_reward_type}
                          onValueChange={(value) =>
                            setEditingConfig({ ...editingConfig, referrer_reward_type: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free_months">Free Months</SelectItem>
                            <SelectItem value="percent_off">Percent Off</SelectItem>
                            <SelectItem value="dollar_off">Dollar Off</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Reward Value</Label>
                        <Input
                          type="number"
                          value={editingConfig.referrer_reward_value}
                          onChange={(e) =>
                            setEditingConfig({ ...editingConfig, referrer_reward_value: parseFloat(e.target.value) })
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          {editingConfig.referrer_reward_type === "free_months" && "Number of free months"}
                          {editingConfig.referrer_reward_type === "percent_off" && "Percentage discount (0-100)"}
                          {editingConfig.referrer_reward_type === "dollar_off" && "Dollar amount discount"}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>Duration (Months)</Label>
                        <Input
                          type="number"
                          value={editingConfig.referrer_reward_duration_months}
                          onChange={(e) =>
                            setEditingConfig({ ...editingConfig, referrer_reward_duration_months: parseInt(e.target.value) })
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-4 p-4 border rounded-lg">
                      <h3 className="font-semibold">Referred User Rewards</h3>
                      
                      <div className="space-y-2">
                        <Label>Reward Type</Label>
                        <Select
                          value={editingConfig.referred_reward_type}
                          onValueChange={(value) =>
                            setEditingConfig({ ...editingConfig, referred_reward_type: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free_months">Free Months</SelectItem>
                            <SelectItem value="percent_off">Percent Off</SelectItem>
                            <SelectItem value="dollar_off">Dollar Off</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Reward Value</Label>
                        <Input
                          type="number"
                          value={editingConfig.referred_reward_value}
                          onChange={(e) =>
                            setEditingConfig({ ...editingConfig, referred_reward_value: parseFloat(e.target.value) })
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Duration (Months)</Label>
                        <Input
                          type="number"
                          value={editingConfig.referred_reward_duration_months}
                          onChange={(e) =>
                            setEditingConfig({ ...editingConfig, referred_reward_duration_months: parseInt(e.target.value) })
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Min Referrals for Reward</Label>
                      <Input
                        type="number"
                        value={editingConfig.min_referrals_for_reward}
                        onChange={(e) =>
                          setEditingConfig({ ...editingConfig, min_referrals_for_reward: parseInt(e.target.value) })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Max Rewards Per User</Label>
                      <Input
                        type="number"
                        placeholder="Unlimited"
                        value={editingConfig.max_rewards_per_user || ""}
                        onChange={(e) =>
                          setEditingConfig({ 
                            ...editingConfig, 
                            max_rewards_per_user: e.target.value ? parseInt(e.target.value) : null 
                          })
                        }
                      />
                    </div>
                  </div>

                  <Button onClick={handleSaveConfig} className="w-full">
                    Save Configuration
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leaderboard">
          <Card>
            <CardHeader>
              <CardTitle>Top Referrers</CardTitle>
              <CardDescription>Users who have referred the most members</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Referrals</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats?.top_referrers.map((referrer, index) => (
                    <TableRow key={referrer.user_id}>
                      <TableCell>
                        <Badge variant={index === 0 ? "default" : "outline"}>
                          #{index + 1}
                        </Badge>
                      </TableCell>
                      <TableCell>{referrer.full_name}</TableCell>
                      <TableCell>{referrer.referral_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
