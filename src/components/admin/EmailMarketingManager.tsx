import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Mail,
  Send,
  Users,
  TrendingUp,
  Plus,
  Edit,
  Trash2,
  Download,
  Upload,
  Eye,
  Copy,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface EmailList {
  id: string;
  name: string;
  description?: string;
  subscriber_count: number;
  is_active: boolean;
  created_at: string;
}

interface Subscriber {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  status: string;
  source: string;
  confirmed: boolean;
  subscribed_at: string;
}

interface Campaign {
  id: string;
  name: string;
  subject: string;
  status: string;
  total_recipients: number;
  total_sent: number;
  total_opens: number;
  total_clicks: number;
  open_rate: number;
  click_rate: number;
  scheduled_for?: string;
  sent_at?: string;
  created_at: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  description?: string;
  subject_template: string;
  category: string;
  created_at: string;
}

interface EmailStats {
  total_subscribers: number;
  active_subscribers: number;
  total_campaigns: number;
  sent_campaigns: number;
  avg_open_rate: number;
  avg_click_rate: number;
}

export function EmailMarketingManager() {
  const [lists, setLists] = useState<EmailList[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [stats, setStats] = useState<EmailStats>({
    total_subscribers: 0,
    active_subscribers: 0,
    total_campaigns: 0,
    sent_campaigns: 0,
    avg_open_rate: 0,
    avg_click_rate: 0,
  });

  const [showListDialog, setShowListDialog] = useState(false);
  const [showSubscriberDialog, setShowSubscriberDialog] = useState(false);
  const [showCampaignDialog, setShowCampaignDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingList, setEditingList] = useState<EmailList | null>(null);
  const [editingSubscriber, setEditingSubscriber] = useState<Subscriber | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  // Form states
  const [listForm, setListForm] = useState({ name: "", description: "" });
  const [subscriberForm, setSubscriberForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    list_ids: [] as string[],
  });
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    subject: "",
    preview_text: "",
    from_name: "EatPal",
    from_email: "noreply@eatpal.com",
    content_html: "",
    list_ids: [] as string[],
    template_id: "",
  });
  const [templateForm, setTemplateForm] = useState({
    name: "",
    description: "",
    subject_template: "",
    content_html: "",
    category: "general",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await Promise.all([loadStats(), loadLists(), loadSubscribers(), loadCampaigns(), loadTemplates()]);
  };

  const loadStats = async () => {
    try {
      const { data, error } = await supabase.rpc("get_email_marketing_stats");
      if (error) throw error;
      if (data && data.length > 0) {
        setStats(data[0]);
      }
    } catch (error: any) {
      console.error("Error loading stats:", error);
    }
  };

  const loadLists = async () => {
    try {
      const { data, error } = await supabase
        .from("email_lists")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setLists(data || []);
    } catch (error: any) {
      console.error("Error loading lists:", error);
    }
  };

  const loadSubscribers = async () => {
    try {
      let query = supabase
        .from("email_subscribers")
        .select("*")
        .order("subscribed_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setSubscribers(data || []);
    } catch (error: any) {
      console.error("Error loading subscribers:", error);
    }
  };

  const loadCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCampaigns(data || []);
    } catch (error: any) {
      console.error("Error loading campaigns:", error);
    }
  };

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setTemplates(data || []);
    } catch (error: any) {
      console.error("Error loading templates:", error);
    }
  };

  useEffect(() => {
    loadSubscribers();
  }, [statusFilter]);

  const handleSaveList = async () => {
    try {
      setLoading(true);
      if (editingList) {
        const { error } = await supabase
          .from("email_lists")
          .update(listForm)
          .eq("id", editingList.id);
        if (error) throw error;
        toast.success("List updated");
      } else {
        const { error } = await supabase.from("email_lists").insert([listForm]);
        if (error) throw error;
        toast.success("List created");
      }
      setShowListDialog(false);
      loadLists();
    } catch (error: any) {
      toast.error("Failed to save list");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteList = async (listId: string) => {
    if (!confirm("Delete this list? Subscribers will not be deleted.")) return;
    try {
      const { error } = await supabase.from("email_lists").delete().eq("id", listId);
      if (error) throw error;
      toast.success("List deleted");
      loadLists();
    } catch (error: any) {
      toast.error("Failed to delete list");
      console.error(error);
    }
  };

  const handleSaveSubscriber = async () => {
    try {
      setLoading(true);

      if (editingSubscriber) {
        const { error } = await supabase
          .from("email_subscribers")
          .update({
            email: subscriberForm.email,
            first_name: subscriberForm.first_name,
            last_name: subscriberForm.last_name,
          })
          .eq("id", editingSubscriber.id);
        if (error) throw error;
        toast.success("Subscriber updated");
      } else {
        // Create subscriber
        const { data: newSubscriber, error: subError } = await supabase
          .from("email_subscribers")
          .insert([{
            email: subscriberForm.email,
            first_name: subscriberForm.first_name,
            last_name: subscriberForm.last_name,
            status: "active",
            source: "manual",
            confirmed: true,
          }])
          .select()
          .single();

        if (subError) throw subError;

        // Add to lists
        if (subscriberForm.list_ids.length > 0 && newSubscriber) {
          const listSubscribers = subscriberForm.list_ids.map((listId) => ({
            list_id: listId,
            subscriber_id: newSubscriber.id,
          }));
          const { error: listError } = await supabase
            .from("list_subscribers")
            .insert(listSubscribers);
          if (listError) throw listError;
        }

        toast.success("Subscriber added");
      }

      setShowSubscriberDialog(false);
      loadSubscribers();
      loadLists(); // Refresh counts
    } catch (error: any) {
      toast.error("Failed to save subscriber");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSubscriber = async (subscriberId: string) => {
    if (!confirm("Delete this subscriber?")) return;
    try {
      const { error } = await supabase
        .from("email_subscribers")
        .delete()
        .eq("id", subscriberId);
      if (error) throw error;
      toast.success("Subscriber deleted");
      loadSubscribers();
      loadLists(); // Refresh counts
    } catch (error: any) {
      toast.error("Failed to delete subscriber");
      console.error(error);
    }
  };

  const handleSaveCampaign = async () => {
    try {
      setLoading(true);

      const campaignData: any = {
        ...campaignForm,
        status: "draft",
      };

      if (editingCampaign) {
        const { error } = await supabase
          .from("email_campaigns")
          .update(campaignData)
          .eq("id", editingCampaign.id);
        if (error) throw error;
        toast.success("Campaign updated");
      } else {
        const { error } = await supabase.from("email_campaigns").insert([campaignData]);
        if (error) throw error;
        toast.success("Campaign created");
      }

      setShowCampaignDialog(false);
      loadCampaigns();
    } catch (error: any) {
      toast.error("Failed to save campaign");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    if (!confirm("Delete this campaign?")) return;
    try {
      const { error } = await supabase.from("email_campaigns").delete().eq("id", campaignId);
      if (error) throw error;
      toast.success("Campaign deleted");
      loadCampaigns();
    } catch (error: any) {
      toast.error("Failed to delete campaign");
      console.error(error);
    }
  };

  const handleSaveTemplate = async () => {
    try {
      setLoading(true);

      if (editingTemplate) {
        const { error } = await supabase
          .from("email_templates")
          .update(templateForm)
          .eq("id", editingTemplate.id);
        if (error) throw error;
        toast.success("Template updated");
      } else {
        const { error } = await supabase.from("email_templates").insert([templateForm]);
        if (error) throw error;
        toast.success("Template created");
      }

      setShowTemplateDialog(false);
      loadTemplates();
    } catch (error: any) {
      toast.error("Failed to save template");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm("Delete this template?")) return;
    try {
      const { error } = await supabase.from("email_templates").delete().eq("id", templateId);
      if (error) throw error;
      toast.success("Template deleted");
      loadTemplates();
    } catch (error: any) {
      toast.error("Failed to delete template");
      console.error(error);
    }
  };

  const handleLoadTemplate = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setCampaignForm({
        ...campaignForm,
        subject: template.subject_template,
        content_html: template.content_html,
        template_id: template.id,
      });
      toast.success("Template loaded");
    }
  };

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split("\n");
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

      const emailIndex = headers.indexOf("email");
      const firstNameIndex = headers.indexOf("first_name") || headers.indexOf("firstname");
      const lastNameIndex = headers.indexOf("last_name") || headers.indexOf("lastname");

      if (emailIndex === -1) {
        toast.error("CSV must have an 'email' column");
        return;
      }

      const newSubscribers = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map((v) => v.trim());
        if (values[emailIndex]) {
          newSubscribers.push({
            email: values[emailIndex],
            first_name: firstNameIndex >= 0 ? values[firstNameIndex] : "",
            last_name: lastNameIndex >= 0 ? values[lastNameIndex] : "",
            status: "active",
            source: "import",
            confirmed: false,
          });
        }
      }

      if (newSubscribers.length > 0) {
        const { error } = await supabase.from("email_subscribers").insert(newSubscribers);
        if (error) throw error;
        toast.success(`Imported ${newSubscribers.length} subscribers`);
        loadSubscribers();
        loadLists();
      }
    } catch (error: any) {
      toast.error("Failed to import CSV");
      console.error(error);
    }
  };

  const handleExportSubscribers = async () => {
    try {
      const csv = [
        "email,first_name,last_name,status,subscribed_at",
        ...subscribers.map(
          (s) =>
            `${s.email},${s.first_name || ""},${s.last_name || ""},${s.status},${s.subscribed_at}`
        ),
      ].join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `subscribers-${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      toast.success("Subscribers exported");
    } catch (error: any) {
      toast.error("Failed to export");
      console.error(error);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: any = {
      draft: "bg-gray-500",
      scheduled: "bg-blue-500",
      sending: "bg-yellow-500",
      sent: "bg-green-500",
      paused: "bg-orange-500",
      cancelled: "bg-red-500",
      active: "bg-green-500",
      unsubscribed: "bg-red-500",
      bounced: "bg-orange-500",
    };
    return (
      <Badge className={cn("text-white", colors[status] || "bg-gray-500")}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const filteredSubscribers = subscribers.filter((subscriber) => {
    if (searchQuery) {
      return (
        subscriber.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        subscriber.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        subscriber.last_name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Subscribers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_subscribers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <CheckCircle className="h-4 w-4 text-safe-food" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active_subscribers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Campaigns</CardTitle>
            <Mail className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_campaigns}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sent</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.sent_campaigns}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Open Rate</CardTitle>
            <Eye className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avg_open_rate.toFixed(1)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Click Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avg_click_rate.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="campaigns" className="space-y-4">
        <TabsList>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="subscribers">Subscribers</TabsTrigger>
          <TabsTrigger value="lists">Lists</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="space-y-4">
          <div className="flex justify-between">
            <div className="text-sm text-muted-foreground">
              Create and manage email campaigns
            </div>
            <Button
              onClick={() => {
                setEditingCampaign(null);
                setCampaignForm({
                  name: "",
                  subject: "",
                  preview_text: "",
                  from_name: "EatPal",
                  from_email: "noreply@eatpal.com",
                  content_html: "",
                  list_ids: [],
                  template_id: "",
                });
                setShowCampaignDialog(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Campaign
            </Button>
          </div>

          <div className="border rounded-lg">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-4 font-medium">Name</th>
                    <th className="text-left p-4 font-medium">Subject</th>
                    <th className="text-left p-4 font-medium">Status</th>
                    <th className="text-left p-4 font-medium">Recipients</th>
                    <th className="text-left p-4 font-medium">Opens</th>
                    <th className="text-left p-4 font-medium">Clicks</th>
                    <th className="text-right p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign) => (
                    <tr key={campaign.id} className="border-t hover:bg-muted/30">
                      <td className="p-4 font-medium">{campaign.name}</td>
                      <td className="p-4 text-sm text-muted-foreground">{campaign.subject}</td>
                      <td className="p-4">{getStatusBadge(campaign.status)}</td>
                      <td className="p-4 text-sm">{campaign.total_recipients}</td>
                      <td className="p-4 text-sm">
                        {campaign.total_opens} ({campaign.open_rate.toFixed(1)}%)
                      </td>
                      <td className="p-4 text-sm">
                        {campaign.total_clicks} ({campaign.click_rate.toFixed(1)}%)
                      </td>
                      <td className="p-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingCampaign(campaign);
                              setCampaignForm({
                                name: campaign.name,
                                subject: campaign.subject,
                                preview_text: "",
                                from_name: "EatPal",
                                from_email: "noreply@eatpal.com",
                                content_html: "",
                                list_ids: [],
                                template_id: "",
                              });
                              setShowCampaignDialog(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteCampaign(campaign.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Subscribers Tab */}
        <TabsContent value="subscribers" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div className="flex flex-col sm:flex-row gap-2 flex-1">
              <Input
                placeholder="Search subscribers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                  <SelectItem value="bounced">Bounced</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExportSubscribers}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button variant="outline" asChild>
                <label>
                  <Upload className="h-4 w-4 mr-2" />
                  Import CSV
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleImportCSV}
                  />
                </label>
              </Button>
              <Button
                onClick={() => {
                  setEditingSubscriber(null);
                  setSubscriberForm({
                    email: "",
                    first_name: "",
                    last_name: "",
                    list_ids: [],
                  });
                  setShowSubscriberDialog(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Subscriber
              </Button>
            </div>
          </div>

          <div className="border rounded-lg">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-4 font-medium">Email</th>
                    <th className="text-left p-4 font-medium">Name</th>
                    <th className="text-left p-4 font-medium">Status</th>
                    <th className="text-left p-4 font-medium">Source</th>
                    <th className="text-left p-4 font-medium">Subscribed</th>
                    <th className="text-right p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubscribers.map((subscriber) => (
                    <tr key={subscriber.id} className="border-t hover:bg-muted/30">
                      <td className="p-4 font-medium">{subscriber.email}</td>
                      <td className="p-4 text-sm">
                        {subscriber.first_name} {subscriber.last_name}
                      </td>
                      <td className="p-4">{getStatusBadge(subscriber.status)}</td>
                      <td className="p-4 text-sm capitalize">{subscriber.source}</td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {format(new Date(subscriber.subscribed_at), "MMM d, yyyy")}
                      </td>
                      <td className="p-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteSubscriber(subscriber.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Lists Tab */}
        <TabsContent value="lists" className="space-y-4">
          <div className="flex justify-between">
            <div className="text-sm text-muted-foreground">
              Organize subscribers into lists for targeted campaigns
            </div>
            <Button
              onClick={() => {
                setEditingList(null);
                setListForm({ name: "", description: "" });
                setShowListDialog(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              New List
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {lists.map((list) => (
              <Card key={list.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{list.name}</CardTitle>
                      <CardDescription>{list.description || "No description"}</CardDescription>
                    </div>
                    <Badge>{list.subscriber_count} subscribers</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingList(list);
                        setListForm({
                          name: list.name,
                          description: list.description || "",
                        });
                        setShowListDialog(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteList(list.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex justify-between">
            <div className="text-sm text-muted-foreground">
              Create reusable email templates
            </div>
            <Button
              onClick={() => {
                setEditingTemplate(null);
                setTemplateForm({
                  name: "",
                  description: "",
                  subject_template: "",
                  content_html: "",
                  category: "general",
                });
                setShowTemplateDialog(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <Card key={template.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{template.name}</CardTitle>
                  <CardDescription>{template.description || "No description"}</CardDescription>
                  <Badge className="w-fit">{template.category}</Badge>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Subject: {template.subject_template}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingTemplate(template);
                        setTemplateForm({
                          name: template.name,
                          description: template.description || "",
                          subject_template: template.subject_template,
                          content_html: "",
                          category: template.category,
                        });
                        setShowTemplateDialog(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteTemplate(template.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* List Dialog */}
      <Dialog open={showListDialog} onOpenChange={setShowListDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingList ? "Edit List" : "Create List"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={listForm.name}
                onChange={(e) => setListForm({ ...listForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={listForm.description}
                onChange={(e) => setListForm({ ...listForm, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowListDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveList} disabled={loading}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subscriber Dialog */}
      <Dialog open={showSubscriberDialog} onOpenChange={setShowSubscriberDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Subscriber</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={subscriberForm.email}
                onChange={(e) => setSubscriberForm({ ...subscriberForm, email: e.target.value })}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input
                  value={subscriberForm.first_name}
                  onChange={(e) =>
                    setSubscriberForm({ ...subscriberForm, first_name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input
                  value={subscriberForm.last_name}
                  onChange={(e) =>
                    setSubscriberForm({ ...subscriberForm, last_name: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubscriberDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSubscriber} disabled={loading}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign Dialog */}
      <Dialog open={showCampaignDialog} onOpenChange={setShowCampaignDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCampaign ? "Edit Campaign" : "Create Campaign"}</DialogTitle>
            <DialogDescription>
              Note: Campaign sending requires external email service configuration (SendGrid, Mailgun, etc.)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Campaign Name *</Label>
              <Input
                value={campaignForm.name}
                onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Load from Template</Label>
              <Select onValueChange={handleLoadTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Subject Line *</Label>
              <Input
                value={campaignForm.subject}
                onChange={(e) => setCampaignForm({ ...campaignForm, subject: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Preview Text</Label>
              <Input
                value={campaignForm.preview_text}
                onChange={(e) =>
                  setCampaignForm({ ...campaignForm, preview_text: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Email Content (HTML) *</Label>
              <Textarea
                value={campaignForm.content_html}
                onChange={(e) =>
                  setCampaignForm({ ...campaignForm, content_html: e.target.value })
                }
                rows={10}
                placeholder="<html>...</html>"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCampaignDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveCampaign} disabled={loading}>
              Save Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "Create Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name *</Label>
              <Input
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={templateForm.description}
                onChange={(e) =>
                  setTemplateForm({ ...templateForm, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={templateForm.category}
                onValueChange={(value) => setTemplateForm({ ...templateForm, category: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="promotional">Promotional</SelectItem>
                  <SelectItem value="transactional">Transactional</SelectItem>
                  <SelectItem value="newsletter">Newsletter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Subject Template *</Label>
              <Input
                value={templateForm.subject_template}
                onChange={(e) =>
                  setTemplateForm({ ...templateForm, subject_template: e.target.value })
                }
                placeholder="Use {{variables}} for personalization"
              />
            </div>
            <div className="space-y-2">
              <Label>Content (HTML) *</Label>
              <Textarea
                value={templateForm.content_html}
                onChange={(e) =>
                  setTemplateForm({ ...templateForm, content_html: e.target.value })
                }
                rows={10}
                placeholder="<html>Use {{variables}} for personalization</html>"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} disabled={loading}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
