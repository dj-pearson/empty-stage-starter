import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Target,
  TrendingUp,
  Users,
  CheckCircle,
  Plus,
  MoreVertical,
  Mail,
  Phone,
  Calendar,
  Star,
  Download,
  RefreshCw,
  Eye,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { logger } from "@/lib/logger";

interface Campaign {
  id: string;
  name: string;
  description: string;
  source: string;
  utm_campaign: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  is_active: boolean;
  created_at: string;
}

interface Lead {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  source: string;
  status: string;
  score: number;
  campaign_id: string | null;
  campaign_name: string | null;
  created_at: string;
  last_contacted_at: string | null;
  converted_at: string | null;
}

interface LeadStats {
  total_leads: number;
  new_leads: number;
  qualified_leads: number;
  converted_leads: number;
  conversion_rate: number;
}

const LEAD_SOURCES = [
  { value: "landing_page", label: "Landing Page" },
  { value: "signup_form", label: "Signup Form" },
  { value: "trial_signup", label: "Trial Signup" },
  { value: "newsletter", label: "Newsletter" },
  { value: "contact_form", label: "Contact Form" },
  { value: "referral", label: "Referral" },
  { value: "social_media", label: "Social Media" },
  { value: "organic_search", label: "Organic Search" },
  { value: "paid_ad", label: "Paid Ad" },
  { value: "other", label: "Other" },
];

const LEAD_STATUSES = [
  { value: "new", label: "New", color: "bg-blue-500" },
  { value: "contacted", label: "Contacted", color: "bg-yellow-500" },
  { value: "qualified", label: "Qualified", color: "bg-purple-500" },
  { value: "converted", label: "Converted", color: "bg-safe-food" },
  { value: "unqualified", label: "Unqualified", color: "bg-gray-500" },
  { value: "lost", label: "Lost", color: "bg-destructive" },
];

export function LeadCampaignManager() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<LeadStats>({
    total_leads: 0,
    new_leads: 0,
    qualified_leads: 0,
    converted_leads: 0,
    conversion_rate: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showCampaignDialog, setShowCampaignDialog] = useState(false);
  const [showLeadDialog, setShowLeadDialog] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const [campaignForm, setCampaignForm] = useState({
    name: "",
    description: "",
    source: "landing_page",
    utm_campaign: "",
    utm_source: "",
    utm_medium: "",
  });

  const [leadNotes, setLeadNotes] = useState("");
  const [leadStatus, setLeadStatus] = useState("new");

  useEffect(() => {
    loadCampaigns();
    loadLeads();
    loadStats();
  }, []);

  const loadCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCampaigns(data || []);
    } catch (error) {
      logger.error("Error loading campaigns:", error);
      toast.error("Failed to load campaigns");
    }
  };

  const loadLeads = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("leads")
        .select(`
          *,
          campaign:campaigns(name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const formattedLeads: Lead[] = data?.map((lead) => ({
        ...lead,
        campaign_name: (lead.campaign as any)?.name || null,
      })) || [];

      setLeads(formattedLeads);
    } catch (error) {
      logger.error("Error loading leads:", error);
      toast.error("Failed to load leads");
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const { data, error } = await supabase.from("leads").select("status");

      if (error) throw error;

      const total = data?.length || 0;
      const newLeads = data?.filter((l) => l.status === "new").length || 0;
      const qualified = data?.filter((l) => l.status === "qualified").length || 0;
      const converted = data?.filter((l) => l.status === "converted").length || 0;

      setStats({
        total_leads: total,
        new_leads: newLeads,
        qualified_leads: qualified,
        converted_leads: converted,
        conversion_rate: total > 0 ? (converted / total) * 100 : 0,
      });
    } catch (error) {
      logger.error("Error loading stats:", error);
    }
  };

  const handleCreateCampaign = async () => {
    try {
      const { error } = await supabase.from("campaigns").insert([
        {
          name: campaignForm.name,
          description: campaignForm.description,
          source: campaignForm.source as any,
          utm_campaign: campaignForm.utm_campaign || null,
          utm_source: campaignForm.utm_source || null,
          utm_medium: campaignForm.utm_medium || null,
          is_active: true,
        },
      ]);

      if (error) throw error;

      toast.success("Campaign created successfully");
      setShowCampaignDialog(false);
      setCampaignForm({
        name: "",
        description: "",
        source: "landing_page",
        utm_campaign: "",
        utm_source: "",
        utm_medium: "",
      });
      loadCampaigns();
    } catch (error) {
      logger.error("Error creating campaign:", error);
      toast.error("Failed to create campaign");
    }
  };

  const handleUpdateLeadStatus = async () => {
    if (!selectedLead) return;

    try {
      const updates: any = {
        status: leadStatus,
        last_contacted_at: new Date().toISOString(),
      };

      if (leadStatus === "converted") {
        updates.converted_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("leads")
        .update(updates)
        .eq("id", selectedLead.id);

      if (error) throw error;

      // Add interaction note
      if (leadNotes) {
        await supabase.from("lead_interactions").insert([
          {
            lead_id: selectedLead.id,
            interaction_type: "note",
            description: leadNotes,
            created_by: (await supabase.auth.getUser()).data.user?.id,
          },
        ]);
      }

      toast.success("Lead updated successfully");
      setShowLeadDialog(false);
      setSelectedLead(null);
      setLeadNotes("");
      loadLeads();
      loadStats();
    } catch (error) {
      logger.error("Error updating lead:", error);
      toast.error("Failed to update lead");
    }
  };

  const handleViewLead = (lead: Lead) => {
    setSelectedLead(lead);
    setLeadStatus(lead.status);
    setShowLeadDialog(true);
  };

  const handleExportLeads = () => {
    const csv = [
      "Email,Name,Phone,Source,Status,Score,Campaign,Created,Last Contacted",
      ...filteredLeads.map((l) =>
        [
          l.email,
          l.full_name || "",
          l.phone || "",
          l.source,
          l.status,
          l.score,
          l.campaign_name || "",
          format(new Date(l.created_at), "yyyy-MM-dd"),
          l.last_contacted_at ? format(new Date(l.last_contacted_at), "yyyy-MM-dd") : "",
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Leads exported");
  };

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lead.full_name?.toLowerCase() || "").includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
    const matchesSource = sourceFilter === "all" || lead.source === sourceFilter;

    return matchesSearch && matchesStatus && matchesSource;
  });

  const getStatusBadge = (status: string) => {
    const statusConfig = LEAD_STATUSES.find((s) => s.value === status) || LEAD_STATUSES[0];
    return (
      <Badge className={statusConfig.color}>
        {statusConfig.label}
      </Badge>
    );
  };

  const getScoreBadge = (score: number) => {
    let variant: "default" | "secondary" | "destructive" = "secondary";
    if (score >= 70) variant = "default";
    else if (score < 40) variant = "destructive";

    return (
      <Badge variant={variant} className="gap-1">
        <Star className="h-3 w-3" />
        {score}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total Leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.total_leads}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" />
              New
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-500">{stats.new_leads}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Qualified
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-500">{stats.qualified_leads}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Converted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-safe-food">{stats.converted_leads}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Conv. Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">{stats.conversion_rate.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="leads" className="space-y-4">
        <TabsList>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="funnel">Funnel Analysis</TabsTrigger>
        </TabsList>

        {/* Leads Tab */}
        <TabsContent value="leads" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Lead Management</CardTitle>
                  <CardDescription>Track and manage all your leads</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button onClick={loadLeads} variant="outline" size="sm">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                  <Button onClick={handleExportLeads} variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-4 mb-6">
                <Input
                  placeholder="Search by email or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1"
                />

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {LEAD_STATUSES.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    {LEAD_SOURCES.map((source) => (
                      <SelectItem key={source.value} value={source.value}>
                        {source.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lead</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeads.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No leads found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLeads.map((lead) => (
                        <TableRow key={lead.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{lead.full_name || "—"}</p>
                              <p className="text-sm text-muted-foreground">{lead.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 text-sm">
                              {lead.phone && (
                                <div className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {lead.phone}
                                </div>
                              )}
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {lead.email}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {LEAD_SOURCES.find((s) => s.value === lead.source)?.label || lead.source}
                            </Badge>
                          </TableCell>
                          <TableCell>{getStatusBadge(lead.status)}</TableCell>
                          <TableCell>{getScoreBadge(lead.score)}</TableCell>
                          <TableCell>
                            <span className="text-sm">{lead.campaign_name || "—"}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(lead.created_at), "MMM d, yyyy")}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleViewLead(lead)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View & Update
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <MessageSquare className="h-4 w-4 mr-2" />
                                  Add Note
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>
                                  <Mail className="h-4 w-4 mr-2" />
                                  Send Email
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Marketing Campaigns</CardTitle>
                  <CardDescription>Create and track lead generation campaigns</CardDescription>
                </div>
                <Button onClick={() => setShowCampaignDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Campaign
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {campaigns.map((campaign) => (
                  <Card key={campaign.id}>
                    <CardHeader>
                      <CardTitle className="text-lg">{campaign.name}</CardTitle>
                      <CardDescription className="line-clamp-2">
                        {campaign.description || "No description"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Source:</span>
                        <Badge variant="outline">
                          {LEAD_SOURCES.find((s) => s.value === campaign.source)?.label}
                        </Badge>
                      </div>
                      {campaign.utm_campaign && (
                        <div className="text-xs text-muted-foreground">
                          <p className="font-mono">utm_campaign: {campaign.utm_campaign}</p>
                          {campaign.utm_source && <p className="font-mono">utm_source: {campaign.utm_source}</p>}
                          {campaign.utm_medium && <p className="font-mono">utm_medium: {campaign.utm_medium}</p>}
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(campaign.created_at), "MMM d, yyyy")}
                        </span>
                        {campaign.is_active ? (
                          <Badge variant="default" className="bg-safe-food">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Funnel Analysis Tab */}
        <TabsContent value="funnel">
          <Card>
            <CardHeader>
              <CardTitle>Conversion Funnel</CardTitle>
              <CardDescription>Visualize your lead conversion pipeline</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {LEAD_STATUSES.map((status, idx) => {
                  const count = leads.filter((l) => l.status === status.value).length;
                  const percentage = stats.total_leads > 0 ? (count / stats.total_leads) * 100 : 0;

                  return (
                    <div key={status.value} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${status.color}`}></div>
                          <span className="font-medium">{status.label}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-muted-foreground">{count} leads</span>
                          <span className="font-semibold">{percentage.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                        <div
                          className={`h-full ${status.color} transition-all duration-500`}
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Campaign Dialog */}
      <Dialog open={showCampaignDialog} onOpenChange={setShowCampaignDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Campaign</DialogTitle>
            <DialogDescription>Set up a new lead generation campaign</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="campaign-name">Campaign Name *</Label>
              <Input
                id="campaign-name"
                value={campaignForm.name}
                onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                placeholder="Summer 2025 Promotion"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="campaign-desc">Description</Label>
              <Textarea
                id="campaign-desc"
                value={campaignForm.description}
                onChange={(e) => setCampaignForm({ ...campaignForm, description: e.target.value })}
                placeholder="Describe the campaign goals and strategy..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="campaign-source">Lead Source *</Label>
              <Select
                value={campaignForm.source}
                onValueChange={(value) => setCampaignForm({ ...campaignForm, source: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCES.map((source) => (
                    <SelectItem key={source.value} value={source.value}>
                      {source.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="utm-campaign">UTM Campaign</Label>
                <Input
                  id="utm-campaign"
                  value={campaignForm.utm_campaign}
                  onChange={(e) => setCampaignForm({ ...campaignForm, utm_campaign: e.target.value })}
                  placeholder="summer_promo"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="utm-source">UTM Source</Label>
                <Input
                  id="utm-source"
                  value={campaignForm.utm_source}
                  onChange={(e) => setCampaignForm({ ...campaignForm, utm_source: e.target.value })}
                  placeholder="facebook"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="utm-medium">UTM Medium</Label>
                <Input
                  id="utm-medium"
                  value={campaignForm.utm_medium}
                  onChange={(e) => setCampaignForm({ ...campaignForm, utm_medium: e.target.value })}
                  placeholder="cpc"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCampaignDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCampaign}>Create Campaign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lead Details Dialog */}
      <Dialog open={showLeadDialog} onOpenChange={setShowLeadDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Lead Details</DialogTitle>
            <DialogDescription>Update lead status and add notes</DialogDescription>
          </DialogHeader>

          {selectedLead && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <p className="font-medium">{selectedLead.full_name || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <p className="font-medium">{selectedLead.email}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  <p className="font-medium">{selectedLead.phone || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Lead Score</Label>
                  <div className="mt-1">{getScoreBadge(selectedLead.score)}</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lead-status">Update Status</Label>
                <Select value={leadStatus} onValueChange={setLeadStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_STATUSES.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lead-notes">Add Note</Label>
                <Textarea
                  id="lead-notes"
                  value={leadNotes}
                  onChange={(e) => setLeadNotes(e.target.value)}
                  placeholder="Record conversation notes, next steps, etc..."
                  rows={4}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeadDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateLeadStatus}>Update Lead</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
