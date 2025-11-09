import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Gift } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { logger } from "@/lib/logger";

interface Profile {
  id: string;
  full_name: string;
}

interface SubscriptionPlan {
  id: string;
  name: string;
}

interface ComplementarySubscription {
  id: string;
  user_id: string;
  plan_id: string;
  reason: string | null;
  start_date: string;
  end_date: string | null;
  is_permanent: boolean;
  status: string;
  created_at: string;
  profiles?: Profile;
  subscription_plans?: SubscriptionPlan;
}

export function ComplementarySubscriptionManager() {
  const [subscriptions, setSubscriptions] = useState<ComplementarySubscription[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [searchEmail, setSearchEmail] = useState("");
  
  const [formData, setFormData] = useState({
    user_id: "",
    plan_id: "",
    reason: "",
    start_date: new Date().toISOString().split("T")[0],
    end_date: "",
    is_permanent: false,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [subsRes, plansRes] = await Promise.all([
        supabase
          .from("complementary_subscriptions")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase.from("subscription_plans").select("id, name"),
      ]);

      // Fetch user and plan details separately
      if (subsRes.data) {
        const userIds = [...new Set(subsRes.data.map(s => s.user_id))];
        const planIds = [...new Set(subsRes.data.map(s => s.plan_id))];
        
        const [usersRes, plansDetailRes] = await Promise.all([
          supabase.from("profiles").select("id, full_name").in("id", userIds),
          supabase.from("subscription_plans").select("id, name").in("id", planIds),
        ]);

        const userMap = new Map(usersRes.data?.map(u => [u.id, u]));
        const planMap = new Map(plansDetailRes.data?.map(p => [p.id, p]));

        const enrichedData = subsRes.data.map(sub => ({
          ...sub,
          profiles: userMap.get(sub.user_id),
          subscription_plans: planMap.get(sub.plan_id),
        })) as any;

        setSubscriptions(enrichedData);
      }

      if (subsRes.error) throw subsRes.error;
      if (plansRes.error) throw plansRes.error;

      setSubscriptions(subsRes.data || []);
      setPlans(plansRes.data || []);
    } catch (error) {
      toast.error("Failed to load data");
      logger.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const searchUserByEmail = async () => {
    if (!searchEmail) {
      toast.error("Please enter an email address");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .ilike("id", `%${searchEmail}%`)
        .limit(10);

      if (error) throw error;

      if (data && data.length > 0) {
        setUsers(data);
        toast.success(`Found ${data.length} user(s)`);
      } else {
        toast.error("No users found with that email");
      }
    } catch (error) {
      toast.error("Failed to search for user");
      logger.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.user_id || !formData.plan_id) {
      toast.error("Please select a user and plan");
      return;
    }

    if (!formData.is_permanent && !formData.end_date) {
      toast.error("Please set an end date or mark as permanent");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const data = {
        user_id: formData.user_id,
        plan_id: formData.plan_id,
        granted_by: user?.id,
        reason: formData.reason || null,
        start_date: formData.start_date,
        end_date: formData.is_permanent ? null : formData.end_date,
        is_permanent: formData.is_permanent,
        status: "active",
      };

      const { error } = await supabase
        .from("complementary_subscriptions")
        .insert([data]);

      if (error) throw error;

      toast.success("Complementary subscription granted successfully");
      resetForm();
      fetchData();
    } catch (error) {
      toast.error("Failed to grant subscription");
      logger.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this complementary subscription?")) return;

    try {
      const { error } = await supabase
        .from("complementary_subscriptions")
        .update({ status: "revoked" })
        .eq("id", id);

      if (error) throw error;
      toast.success("Subscription revoked successfully");
      fetchData();
    } catch (error) {
      toast.error("Failed to revoke subscription");
      logger.error(error instanceof Error ? error.message : String(error));
    }
  };

  const resetForm = () => {
    setFormData({
      user_id: "",
      plan_id: "",
      reason: "",
      start_date: new Date().toISOString().split("T")[0],
      end_date: "",
      is_permanent: false,
    });
    setIsCreating(false);
    setUsers([]);
    setSearchEmail("");
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Complementary Subscriptions</h2>
          <p className="text-muted-foreground">Grant free subscriptions to specific users</p>
        </div>
        {!isCreating && (
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Grant Subscription
          </Button>
        )}
      </div>

      {isCreating && (
        <Card>
          <CardHeader>
            <CardTitle>Grant Complementary Subscription</CardTitle>
            <CardDescription>
              Provide free access to a user for a specific period or permanently
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Search User by Email</Label>
                <div className="flex gap-2">
                  <Input
                    value={searchEmail}
                    onChange={(e) => setSearchEmail(e.target.value)}
                    placeholder="user@example.com"
                  />
                  <Button type="button" onClick={searchUserByEmail}>
                    Search
                  </Button>
                </div>
              </div>

              {users.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="user_id">Select User *</Label>
                  <Select
                    value={formData.user_id}
                    onValueChange={(value) => setFormData({ ...formData, user_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a user" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.full_name || user.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="plan_id">Subscription Plan *</Label>
                <Select
                  value={formData.plan_id}
                  onValueChange={(value) => setFormData({ ...formData, plan_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date *</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="end_date">End Date</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    disabled={formData.is_permanent}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_permanent"
                  checked={formData.is_permanent}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_permanent: checked as boolean, end_date: "" })
                  }
                />
                <label htmlFor="is_permanent" className="text-sm cursor-pointer">
                  Grant permanent access (no expiration)
                </label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Reason / Notes</Label>
                <Textarea
                  id="reason"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="Why is this user receiving a complementary subscription?"
                  rows={3}
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit">
                  <Gift className="h-4 w-4 mr-2" />
                  Grant Subscription
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Granted Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading subscriptions...</p>
          ) : subscriptions.length === 0 ? (
            <p className="text-muted-foreground">No complementary subscriptions granted yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell className="font-medium">
                      {sub.profiles?.full_name || "Unknown User"}
                    </TableCell>
                    <TableCell>{sub.subscription_plans?.name || "Unknown Plan"}</TableCell>
                    <TableCell className="text-sm">
                      {sub.is_permanent ? (
                        <Badge variant="secondary">Permanent</Badge>
                      ) : (
                        <>
                          {new Date(sub.start_date).toLocaleDateString()}
                          {sub.end_date && ` - ${new Date(sub.end_date).toLocaleDateString()}`}
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      {sub.status === "active" ? (
                        <Badge className="bg-green-500">Active</Badge>
                      ) : (
                        <Badge variant="outline">{sub.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{sub.reason || "-"}</TableCell>
                    <TableCell>
                      {sub.status === "active" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRevoke(sub.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
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
