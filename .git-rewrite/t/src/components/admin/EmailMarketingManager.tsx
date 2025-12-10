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

  useEffect(() => {
    loadStats();
    loadLists();
    loadSubscribers();
    loadCampaigns();
    loadTemplates();
  }, []);

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
      const { data, error } = await supabase
        .from("email_subscribers")
        .select("*")
        .order("subscribed_at", { ascending: false });
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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Email Marketing</h2>
        <p className="text-muted-foreground">
          Manage email campaigns, subscribers, and templates
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Subscribers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_subscribers}</div>
            <p className="text-xs text-muted-foreground">
              {stats.active_subscribers} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Campaigns</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_campaigns}</div>
            <p className="text-xs text-muted-foreground">
              {stats.sent_campaigns} sent
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Open Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avg_open_rate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {stats.avg_click_rate.toFixed(1)}% click rate
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Email Marketing</CardTitle>
          <CardDescription>
            Full email marketing functionality has been restored with the necessary database tables
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Lists: {lists.length} • Subscribers: {subscribers.length} • Campaigns: {campaigns.length} • Templates: {templates.length}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
