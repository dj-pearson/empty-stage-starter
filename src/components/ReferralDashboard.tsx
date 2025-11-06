// @ts-nocheck
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Copy, Share2, Gift, Users, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { logger } from "@/lib/logger";

interface ReferralCode {
  code: string;
  clicks: number;
  signups: number;
  successful_referrals: number;
}

interface ReferralConfig {
  tier: string;
  referrer_reward_type: string;
  referrer_reward_value: number;
  referrer_reward_duration_months: number;
  referred_reward_type: string;
  referred_reward_value: number;
  referred_reward_duration_months: number;
  is_active: boolean;
}

interface Referral {
  id: string;
  referred_user_id: string;
  status: string;
  created_at: string;
  profiles: {
    full_name: string;
  };
}

interface Reward {
  id: string;
  reward_type: string;
  reward_value: number;
  reward_duration_months: number;
  status: string;
  created_at: string;
}

export function ReferralDashboard() {
  const [referralCode, setReferralCode] = useState<ReferralCode | null>(null);
  const [config, setConfig] = useState<ReferralConfig | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [userTier, setUserTier] = useState<string>("standard");

  useEffect(() => {
    loadReferralData();
  }, []);

  const loadReferralData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load user's tier
      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_tier")
        .eq("id", user.id)
        .single();

      const tier = profile?.subscription_tier || "standard";
      setUserTier(tier);

      // Load referral code
      const { data: codeData } = await supabase
        .from("referral_codes")
        .select("*")
        .eq("user_id", user.id)
        .single();

      setReferralCode(codeData);

      // Load active config for user's tier
      const { data: configData } = await supabase
        .from("referral_program_config")
        .select("*")
        .eq("tier", tier)
        .eq("is_active", true)
        .single();

      setConfig(configData);

      // Load user's referrals
      const { data: referralData } = await supabase
        .from("referrals")
        .select(`
          *,
          profiles!inner(full_name)
        `)
        .eq("referrer_id", user.id)
        .order("created_at", { ascending: false });

      setReferrals(referralData as any || []);

      // Load user's rewards
      const { data: rewardData } = await supabase
        .from("referral_rewards")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setRewards(rewardData || []);
    } catch (error: unknown) {
      logger.error("Error loading referral data:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const getReferralUrl = () => {
    if (!referralCode) return "";
    const baseUrl = window.location.origin;
    return `${baseUrl}/auth?ref=${referralCode.code}`;
  };

  const copyReferralLink = () => {
    navigator.clipboard.writeText(getReferralUrl());
    toast({ title: "Copied!", description: "Referral link copied to clipboard" });
  };

  const shareReferralLink = async () => {
    const url = getReferralUrl();
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join EatPal",
          text: "Check out EatPal - the AI-powered meal planner for picky eaters!",
          url,
        });
      } catch (error) {
        logger.error("Error sharing:", error);
      }
    } else {
      copyReferralLink();
    }
  };

  const getRewardDescription = (type: string, value: number, duration?: number) => {
    if (type === "free_months") {
      return `${value} free month${value > 1 ? "s" : ""}`;
    } else if (type === "percent_off") {
      return `${value}% off for ${duration} month${duration && duration > 1 ? "s" : ""}`;
    } else if (type === "dollar_off") {
      return `$${value} off for ${duration} month${duration && duration > 1 ? "s" : ""}`;
    }
    return "";
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  if (!config?.is_active) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Referral program is not currently active for your tier.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Refer Friends</h2>
        <p className="text-muted-foreground">Share the love and earn rewards!</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{referralCode?.successful_referrals || 0}</div>
            <p className="text-xs text-muted-foreground">
              {referralCode?.signups || 0} signups from {referralCode?.clicks || 0} clicks
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rewards Earned</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rewards.filter(r => r.status === "applied").length}</div>
            <p className="text-xs text-muted-foreground">
              {rewards.filter(r => r.status === "pending").length} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {referralCode?.signups ? 
                Math.round((referralCode.successful_referrals / referralCode.signups) * 100) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">Signups to active users</p>
          </CardContent>
        </Card>
      </div>

      {/* Referral Link Card */}
      <Card>
        <CardHeader>
          <CardTitle>Your Referral Link</CardTitle>
          <CardDescription>Share this link with friends to earn rewards</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input value={getReferralUrl()} readOnly />
            <Button onClick={copyReferralLink} variant="outline" size="icon">
              <Copy className="h-4 w-4" />
            </Button>
            <Button onClick={shareReferralLink} variant="outline" size="icon">
              <Share2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="p-4 bg-muted rounded-lg space-y-2">
            <h4 className="font-semibold">Current Promotion</h4>
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">You Earn:</p>
                <p className="font-medium">
                  {getRewardDescription(
                    config.referrer_reward_type,
                    config.referrer_reward_value,
                    config.referrer_reward_duration_months
                  )}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Your Friend Gets:</p>
                <p className="font-medium">
                  {getRewardDescription(
                    config.referred_reward_type,
                    config.referred_reward_value,
                    config.referred_reward_duration_months
                  )}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Referrals */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Referrals</CardTitle>
          <CardDescription>People who signed up using your link</CardDescription>
        </CardHeader>
        <CardContent>
          {referrals.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No referrals yet. Start sharing your link!
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referrals.map((referral) => (
                  <TableRow key={referral.id}>
                    <TableCell>{referral.profiles?.full_name || "Anonymous"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          referral.status === "rewarded" ? "default" :
                          referral.status === "completed" ? "secondary" :
                          "outline"
                        }
                      >
                        {referral.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(referral.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Rewards History */}
      <Card>
        <CardHeader>
          <CardTitle>Rewards History</CardTitle>
          <CardDescription>Your earned rewards and their status</CardDescription>
        </CardHeader>
        <CardContent>
          {rewards.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No rewards yet. Keep referring!
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reward</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Earned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rewards.map((reward) => (
                  <TableRow key={reward.id}>
                    <TableCell>
                      {getRewardDescription(
                        reward.reward_type,
                        reward.reward_value,
                        reward.reward_duration_months
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          reward.status === "applied" ? "default" :
                          reward.status === "pending" ? "secondary" :
                          "outline"
                        }
                      >
                        {reward.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(reward.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
