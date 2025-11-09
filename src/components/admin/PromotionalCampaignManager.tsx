// @ts-nocheck
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
import { Plus, Pencil, Trash2, CheckCircle, XCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { logger } from "@/lib/logger";

interface SubscriptionPlan {
  id: string;
  name: string;
  price_monthly: number;
}

interface PromotionalCampaign {
  id: string;
  name: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  affected_plan_ids: string[];
  discount_duration_type: string;
  created_at: string;
}

export function PromotionalCampaignManager() {
  const [campaigns, setCampaigns] = useState<PromotionalCampaign[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<PromotionalCampaign | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    discount_type: "percentage" as "percentage" | "fixed_amount",
    discount_value: "",
    start_date: "",
    end_date: "",
    affected_plan_ids: [] as string[],
    discount_duration_type: "campaign_only" as "campaign_only" | "first_period" | "forever",
    is_active: true,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [campaignsRes, plansRes] = await Promise.all([
        supabase
          .from("promotional_campaigns")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase.from("subscription_plans").select("id, name, price_monthly"),
      ]);

      if (campaignsRes.error) throw campaignsRes.error;
      if (plansRes.error) throw plansRes.error;

      setCampaigns(campaignsRes.data || []);
      setPlans(plansRes.data || []);
    } catch (error: unknown) {
      toast.error("Failed to load campaigns");
      logger.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.discount_value || !formData.start_date || formData.affected_plan_ids.length === 0) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      const data = {
        name: formData.name,
        description: formData.description || null,
        discount_type: formData.discount_type,
        discount_value: parseFloat(formData.discount_value),
        start_date: formData.start_date,
        end_date: formData.end_date || null,
        affected_plan_ids: formData.affected_plan_ids,
        discount_duration_type: formData.discount_duration_type,
        is_active: formData.is_active,
      };

      if (editingCampaign) {
        const { error } = await supabase
          .from("promotional_campaigns")
          .update(data)
          .eq("id", editingCampaign.id);

        if (error) throw error;
        toast.success("Campaign updated successfully");
      } else {
        const { error } = await supabase
          .from("promotional_campaigns")
          .insert([data]);

        if (error) throw error;
        toast.success("Campaign created successfully");
      }

      resetForm();
      fetchData();
    } catch (error: unknown) {
      toast.error(editingCampaign ? "Failed to update campaign" : "Failed to create campaign");
      logger.error(error);
    }
  };

  const handleEdit = (campaign: PromotionalCampaign) => {
    setEditingCampaign(campaign);
    setFormData({
      name: campaign.name,
      description: campaign.description || "",
      discount_type: campaign.discount_type as "percentage" | "fixed_amount",
      discount_value: campaign.discount_value.toString(),
      start_date: campaign.start_date.split("T")[0],
      end_date: campaign.end_date ? campaign.end_date.split("T")[0] : "",
      affected_plan_ids: campaign.affected_plan_ids,
      discount_duration_type: campaign.discount_duration_type as "campaign_only" | "first_period" | "forever",
      is_active: campaign.is_active,
    });
    setIsCreating(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this campaign?")) return;

    try {
      const { error } = await supabase
        .from("promotional_campaigns")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Campaign deleted successfully");
      fetchData();
    } catch (error: unknown) {
      toast.error("Failed to delete campaign");
      logger.error(error);
    }
  };

  const toggleActive = async (campaign: PromotionalCampaign) => {
    try {
      const { error } = await supabase
        .from("promotional_campaigns")
        .update({ is_active: !campaign.is_active })
        .eq("id", campaign.id);

      if (error) throw error;
      toast.success(`Campaign ${!campaign.is_active ? "activated" : "deactivated"}`);
      fetchData();
    } catch (error: unknown) {
      toast.error("Failed to update campaign status");
      logger.error(error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      discount_type: "percentage",
      discount_value: "",
      start_date: "",
      end_date: "",
      affected_plan_ids: [],
      discount_duration_type: "campaign_only",
      is_active: true,
    });
    setIsCreating(false);
    setEditingCampaign(null);
  };

  const handlePlanToggle = (planId: string) => {
    setFormData(prev => ({
      ...prev,
      affected_plan_ids: prev.affected_plan_ids.includes(planId)
        ? prev.affected_plan_ids.filter(id => id !== planId)
        : [...prev.affected_plan_ids, planId],
    }));
  };

  const isActive = (campaign: PromotionalCampaign) => {
    const now = new Date();
    const start = new Date(campaign.start_date);
    const end = campaign.end_date ? new Date(campaign.end_date) : null;
    return campaign.is_active && start <= now && (!end || end >= now);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Promotional Campaigns</h2>
          <p className="text-muted-foreground">Create and manage discount campaigns</p>
        </div>
        {!isCreating && (
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Button>
        )}
      </div>

      {isCreating && (
        <Card>
          <CardHeader>
            <CardTitle>{editingCampaign ? "Edit Campaign" : "Create New Campaign"}</CardTitle>
            <CardDescription>
              Set up promotional pricing for specific subscription plans
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Campaign Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Summer Sale 2025"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="discount_type">Discount Type *</Label>
                  <Select
                    value={formData.discount_type}
                    onValueChange={(value: "percentage" | "fixed_amount") =>
                      setFormData({ ...formData, discount_type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="fixed_amount">Fixed Amount ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="discount_value">
                    Discount Value * {formData.discount_type === "percentage" ? "(%)" : "($)"}
                  </Label>
                  <Input
                    id="discount_value"
                    type="number"
                    step="0.01"
                    value={formData.discount_value}
                    onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                    placeholder={formData.discount_type === "percentage" ? "20" : "5.00"}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="discount_duration">Discount Duration *</Label>
                  <Select
                    value={formData.discount_duration_type}
                    onValueChange={(value: unknown) =>
                      setFormData({ ...formData, discount_duration_type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="campaign_only">Campaign Period Only</SelectItem>
                      <SelectItem value="first_period">First Billing Period</SelectItem>
                      <SelectItem value="forever">Forever (All Billing)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

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
                  <Label htmlFor="end_date">End Date (Optional)</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Campaign details..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Affected Plans *</Label>
                <div className="grid grid-cols-2 gap-3 p-4 border rounded-lg">
                  {plans.map((plan) => (
                    <div key={plan.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`plan-${plan.id}`}
                        checked={formData.affected_plan_ids.includes(plan.id)}
                        onCheckedChange={() => handlePlanToggle(plan.id)}
                      />
                      <label htmlFor={`plan-${plan.id}`} className="text-sm cursor-pointer">
                        {plan.name} (${plan.price_monthly}/mo)
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_active: checked as boolean })
                  }
                />
                <label htmlFor="is_active" className="text-sm cursor-pointer">
                  Campaign is active
                </label>
              </div>

              <div className="flex gap-2">
                <Button type="submit">
                  {editingCampaign ? "Update Campaign" : "Create Campaign"}
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
          <CardTitle>Active & Scheduled Campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading campaigns...</p>
          ) : campaigns.length === 0 ? (
            <p className="text-muted-foreground">No campaigns created yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign Name</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Plans</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">{campaign.name}</TableCell>
                    <TableCell>
                      {campaign.discount_type === "percentage"
                        ? `${campaign.discount_value}%`
                        : `$${campaign.discount_value}`}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {campaign.discount_duration_type.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(campaign.start_date).toLocaleDateString()}
                      {campaign.end_date && ` - ${new Date(campaign.end_date).toLocaleDateString()}`}
                    </TableCell>
                    <TableCell>
                      {campaign.affected_plan_ids.length} plan(s)
                    </TableCell>
                    <TableCell>
                      {isActive(campaign) ? (
                        <Badge className="bg-green-500">Active</Badge>
                      ) : campaign.is_active ? (
                        <Badge variant="secondary">Scheduled</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleActive(campaign)}
                        >
                          {campaign.is_active ? (
                            <XCircle className="h-4 w-4" />
                          ) : (
                            <CheckCircle className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEdit(campaign)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(campaign.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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
