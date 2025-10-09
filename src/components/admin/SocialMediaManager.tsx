import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Facebook,
  Instagram,
  Twitter,
  Linkedin,
  TrendingUp,
  Calendar as CalendarIcon,
  Clock,
  Plus,
  Send,
  Image as ImageIcon,
  Link as LinkIcon,
  Hash,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Settings,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";

const PLATFORMS = [
  { value: "facebook", label: "Facebook", icon: Facebook, color: "text-blue-600" },
  { value: "instagram", label: "Instagram", icon: Instagram, color: "text-pink-600" },
  { value: "twitter", label: "Twitter", icon: Twitter, color: "text-sky-500" },
  { value: "linkedin", label: "LinkedIn", icon: Linkedin, color: "text-blue-700" },
];

interface SocialPost {
  id: string;
  title: string | null;
  content: string;
  short_form_content: string | null;
  long_form_content: string | null;
  platforms: string[];
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  image_urls: string[] | null;
  link_url: string | null;
  hashtags: string[] | null;
  webhook_url: string | null;
  created_at: string;
}

interface SocialAccount {
  id: string;
  platform: string;
  account_name: string;
  webhook_url: string | null;
  is_active: boolean;
  is_global: boolean | null;
}

export function SocialMediaManager() {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [stats, setStats] = useState({
    total_posts: 0,
    scheduled_posts: 0,
    published_posts: 0,
    total_impressions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showPostDialog, setShowPostDialog] = useState(false);
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState("12:00");

  const [postForm, setPostForm] = useState({
    title: "",
    content: "",
    short_form_content: "",
    long_form_content: "",
    platforms: [] as string[],
    link_url: "",
    hashtags: "",
    image_urls: "",
    schedule_now: true,
  });

  const [accountForm, setAccountForm] = useState({
    platform: "webhook",
    account_name: "",
    webhook_url: "",
    is_global: true,
  });

  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiForm, setAiForm] = useState({
    topic: "",
    contentGoal: "Drive website visits and increase conversions",
  });

  useEffect(() => {
    loadPosts();
    loadAccounts();
    loadStats();
  }, []);

  const loadPosts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("social_posts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPosts((data || []) as any);
    } catch (error) {
      console.error("Error loading posts:", error);
      toast.error("Failed to load posts");
    } finally {
      setLoading(false);
    }
  };

  const loadAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from("social_accounts")
        .select("*")
        .order("platform");

      if (error) throw error;
      setAccounts((data || []) as any);
    } catch (error) {
      console.error("Error loading accounts:", error);
    }
  };

  const loadStats = async () => {
    try {
      const { data, error } = await supabase.rpc("get_post_engagement_summary");
      if (error) throw error;
      if (data && data.length > 0) {
        setStats(data[0]);
      }
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const handleCreatePost = async () => {
    try {
      if (!postForm.content.trim()) {
        toast.error("Post content is required");
        return;
      }

      if (postForm.platforms.length === 0) {
        toast.error("Select at least one platform");
        return;
      }

      const scheduledFor = !postForm.schedule_now && selectedDate
        ? new Date(selectedDate).toISOString()
        : null;

      const { error } = await supabase.from("social_posts").insert([
        {
          title: postForm.title || null,
          content: postForm.content,
          short_form_content: postForm.short_form_content || null,
          long_form_content: postForm.long_form_content || null,
          platforms: postForm.platforms as any,
          status: postForm.schedule_now ? "draft" : "scheduled",
          scheduled_for: scheduledFor,
          link_url: postForm.link_url || null,
          hashtags: postForm.hashtags
            ? postForm.hashtags.split(/[\s,]+/).filter((h) => h.trim())
            : null,
          image_urls: postForm.image_urls
            ? postForm.image_urls.split("\n").filter((u) => u.trim())
            : null,
          created_by: (await supabase.auth.getUser()).data.user?.id,
        },
      ]);

      if (error) throw error;

      toast.success(postForm.schedule_now ? "Post created as draft" : "Post scheduled");
      setShowPostDialog(false);
      resetPostForm();
      loadPosts();
      loadStats();
    } catch (error) {
      console.error("Error creating post:", error);
      toast.error("Failed to create post");
    }
  };

  const handlePublishPost = async (postId: string) => {
    try {
      const post = posts.find((p) => p.id === postId);
      if (!post) return;

      // Get global webhook URL from accounts
      const globalAccount = accounts.find((a) => a.is_global && a.is_active && a.webhook_url);
      
      if (!globalAccount?.webhook_url) {
        toast.error("No global webhook URL configured. Please set up a webhook in Connected Accounts.");
        return;
      }

      // Send bundled data to webhook for Make.com
      try {
        const webhookPayload = {
          type: 'social_post_published',
          post_id: post.id,
          title: post.title || '',
          short_form: post.short_form_content || post.content,
          long_form: post.long_form_content || post.content,
          url: post.link_url || 'https://tryeatpal.com',
          hashtags: post.hashtags || [],
          images: post.image_urls || [],
          platforms: post.platforms,
          published_at: new Date().toISOString()
        };

        const response = await fetch(globalAccount.webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(webhookPayload),
        });

        // Log webhook call
        await supabase.from("webhook_logs").insert([
          {
            post_id: postId,
            platform: 'facebook' as any, // Use a default platform for logging
            webhook_url: globalAccount.webhook_url,
            request_payload: webhookPayload,
            response_status: response.status,
            response_body: await response.text(),
            success: response.ok,
          },
        ]);

        if (!response.ok) {
          toast.error(`Webhook returned status ${response.status}`);
          return;
        }
      } catch (webhookError) {
        console.error("Webhook error:", webhookError);
        toast.error("Failed to send to webhook. Check webhook logs for details.");
        return;
      }

      // Update post status
      const { error } = await supabase
        .from("social_posts")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
        })
        .eq("id", postId);

      if (error) throw error;

      toast.success("Post published and sent to webhook!");
      loadPosts();
      loadStats();
    } catch (error) {
      console.error("Error publishing post:", error);
      toast.error("Failed to publish post");
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      const { error } = await supabase.from("social_posts").delete().eq("id", postId);
      if (error) throw error;
      toast.success("Post deleted");
      loadPosts();
      loadStats();
    } catch (error) {
      console.error("Error deleting post:", error);
      toast.error("Failed to delete post");
    }
  };

  const handleSaveAccount = async () => {
    try {
      if (!accountForm.webhook_url.trim()) {
        toast.error("Webhook URL is required");
        return;
      }

      const { error } = await supabase.from("social_accounts").insert([
        {
          platform: accountForm.platform as any,
          account_name: accountForm.account_name || "Global Webhook",
          webhook_url: accountForm.webhook_url || null,
          is_active: true,
          is_global: accountForm.is_global,
        },
      ]);

      if (error) throw error;

      toast.success("Webhook configured successfully");
      setShowAccountDialog(false);
      setAccountForm({ platform: "webhook", account_name: "", webhook_url: "", is_global: true });
      loadAccounts();
    } catch (error) {
      console.error("Error saving account:", error);
      toast.error("Failed to save account");
    }
  };

  const resetPostForm = () => {
    setPostForm({
      title: "",
      content: "",
      short_form_content: "",
      long_form_content: "",
      platforms: [],
      link_url: "",
      hashtags: "",
      image_urls: "",
      schedule_now: true,
    });
    setSelectedDate(undefined);
  };

  const handleGenerateAIContent = async () => {
    if (!aiForm.topic) {
      toast.error("Please enter a topic");
      return;
    }

    setAiGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-social-content', {
        body: {
          topic: aiForm.topic,
          contentGoal: aiForm.contentGoal,
          targetAudience: "Parents struggling with picky eaters and child meal planning"
        }
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      const content = data.content;
      
      // Populate form with generated content
      setPostForm({
        ...postForm,
        title: content.title || "",
        content: content.facebook || content.long_form || "",
        short_form_content: content.twitter || "",
        long_form_content: content.facebook || "",
      });

      toast.success("AI content generated! Review and customize before posting.");
      setShowAIDialog(false);
      setShowPostDialog(true);
    } catch (error: any) {
      console.error("Error generating AI content:", error);
      toast.error(error.message || "Failed to generate content");
    } finally {
      setAiGenerating(false);
    }
  };

  const togglePlatform = (platform: string) => {
    setPostForm({
      ...postForm,
      platforms: postForm.platforms.includes(platform)
        ? postForm.platforms.filter((p) => p !== platform)
        : [...postForm.platforms, platform],
    });
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: { variant: "secondary" as const, label: "Draft" },
      scheduled: { variant: "default" as const, label: "Scheduled", className: "bg-blue-500" },
      published: { variant: "default" as const, label: "Published", className: "bg-safe-food" },
      failed: { variant: "destructive" as const, label: "Failed" },
    };
    const style = styles[status as keyof typeof styles] || styles.draft;
    return (
      <Badge variant={style.variant} className={'className' in style ? style.className : ''}>
        {style.label}
      </Badge>
    );
  };

  const getPlatformIcon = (platform: string) => {
    const config = PLATFORMS.find((p) => p.value === platform);
    if (!config) return null;
    const Icon = config.icon;
    return <Icon className={`h-4 w-4 ${config.color}`} />;
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Posts</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.total_posts}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Scheduled</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-500">{stats.scheduled_posts}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Published</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-safe-food">{stats.published_posts}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Impressions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">
              {stats.total_impressions.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="posts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="calendar">Calendar View</TabsTrigger>
          <TabsTrigger value="accounts">Connected Accounts</TabsTrigger>
        </TabsList>

        {/* Posts Tab */}
        <TabsContent value="posts" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Social Media Posts</CardTitle>
                  <CardDescription>Create and schedule posts across platforms</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => setShowAIDialog(true)} variant="outline">
                    <Sparkles className="h-4 w-4 mr-2" />
                    AI Generate
                  </Button>
                  <Button onClick={() => setShowPostDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Post
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {posts.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>No posts yet. Create your first post!</p>
                  </div>
                ) : (
                  posts.map((post) => (
                    <Card key={post.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          {post.title && <h4 className="font-semibold">{post.title}</h4>}
                          <p className="text-sm text-muted-foreground line-clamp-2">{post.content}</p>
                          <div className="flex flex-wrap gap-2">
                            {post.platforms.map((platform) => (
                              <div key={platform} className="flex items-center gap-1">
                                {getPlatformIcon(platform)}
                                <span className="text-xs capitalize">{platform}</span>
                              </div>
                            ))}
                          </div>
                          {post.hashtags && post.hashtags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {post.hashtags.map((tag, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  #{tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>Created: {format(new Date(post.created_at), "MMM d, yyyy")}</span>
                            {post.scheduled_for && (
                              <span className="flex items-center gap-1">
                                <CalendarIcon className="h-3 w-3" />
                                Scheduled: {format(new Date(post.scheduled_for), "MMM d, h:mm a")}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          {getStatusBadge(post.status)}
                          {post.status === "draft" && (
                            <Button size="sm" onClick={() => handlePublishPost(post.id)}>
                              <Send className="h-3 w-3 mr-1" />
                              Publish
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeletePost(post.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Calendar Tab */}
        <TabsContent value="calendar">
          <Card>
            <CardHeader>
              <CardTitle>Content Calendar</CardTitle>
              <CardDescription>View scheduled posts by date</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Calendar view coming soon</p>
                <p className="text-sm">Scheduled posts: {stats.scheduled_posts}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Accounts Tab */}
        <TabsContent value="accounts">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Webhook Configuration</CardTitle>
                  <CardDescription>Connect to Make.com or Zapier to publish posts</CardDescription>
                </div>
                <Button onClick={() => setShowAccountDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Webhook
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {accounts.map((account) => (
                  <div key={account.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <LinkIcon className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">{account.account_name}</p>
                        <p className="text-sm text-muted-foreground">{account.webhook_url}</p>
                        {account.is_global && (
                          <Badge variant="default" className="mt-1">Global Webhook</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {account.is_active && account.webhook_url ? (
                        <Badge variant="default" className="bg-safe-food">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <XCircle className="h-3 w-3 mr-1" />
                          Inactive
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
                
                {accounts.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <LinkIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No webhook configured yet</p>
                    <p className="text-sm">Add a webhook to start publishing posts</p>
                  </div>
                )}
              </div>

              <div className="mt-6 p-4 border rounded-lg bg-muted/50">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Webhook Setup Instructions
                </h4>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>Create a Make.com scenario or Zapier zap</li>
                  <li>Add a "Webhook" trigger and get the webhook URL</li>
                  <li>Paste the webhook URL above</li>
                  <li>When you publish a post, it will send:
                    <ul className="ml-6 mt-1 space-y-1 list-disc">
                      <li><strong>short_form</strong>: Content for Twitter/X (under 280 chars)</li>
                      <li><strong>long_form</strong>: Content for Facebook/LinkedIn</li>
                      <li><strong>url</strong>: Link to include (defaults to https://tryeatpal.com)</li>
                      <li><strong>hashtags</strong>: Array of hashtags</li>
                      <li><strong>images</strong>: Array of image URLs</li>
                    </ul>
                  </li>
                  <li>In Make.com, parse the data and route to your social platforms</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Post Dialog */}
      <Dialog open={showPostDialog} onOpenChange={setShowPostDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Social Post</DialogTitle>
            <DialogDescription>Compose and schedule your social media content</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="post-title">Title (Optional)</Label>
              <Input
                id="post-title"
                value={postForm.title}
                onChange={(e) => setPostForm({ ...postForm, title: e.target.value })}
                placeholder="Internal reference title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="post-content">Content *</Label>
              <Textarea
                id="post-content"
                value={postForm.content}
                onChange={(e) => setPostForm({ ...postForm, content: e.target.value })}
                placeholder="What's on your mind?"
                rows={6}
              />
              <p className="text-xs text-muted-foreground">{postForm.content.length} characters</p>
            </div>

            <div className="space-y-2">
              <Label>Platforms *</Label>
              <div className="grid grid-cols-2 gap-3">
                {PLATFORMS.map((platform) => {
                  const Icon = platform.icon;
                  return (
                    <div key={platform.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`platform-${platform.value}`}
                        checked={postForm.platforms.includes(platform.value)}
                        onCheckedChange={() => togglePlatform(platform.value)}
                      />
                      <Label
                        htmlFor={`platform-${platform.value}`}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <Icon className={`h-4 w-4 ${platform.color}`} />
                        {platform.label}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hashtags">Hashtags</Label>
              <Input
                id="hashtags"
                value={postForm.hashtags}
                onChange={(e) => setPostForm({ ...postForm, hashtags: e.target.value })}
                placeholder="marketing tips socialmedia (separated by spaces)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="link">Link URL</Label>
              <Input
                id="link"
                value={postForm.link_url}
                onChange={(e) => setPostForm({ ...postForm, link_url: e.target.value })}
                placeholder="https://example.com"
              />
            </div>

            <div className="space-y-2">
              <Label>Schedule</Label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="schedule-now"
                  checked={postForm.schedule_now}
                  onCheckedChange={(checked) =>
                    setPostForm({ ...postForm, schedule_now: checked as boolean })
                  }
                />
                <Label htmlFor="schedule-now">Save as draft (publish manually)</Label>
              </div>
              {!postForm.schedule_now && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPostDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreatePost}>
              {postForm.schedule_now ? "Create Draft" : "Schedule Post"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Account Dialog */}
      <Dialog open={showAccountDialog} onOpenChange={setShowAccountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure Webhook</DialogTitle>
            <DialogDescription>Add a webhook URL to send published posts to Make.com or Zapier</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="account-name">Name (Optional)</Label>
              <Input
                id="account-name"
                value={accountForm.account_name}
                onChange={(e) => setAccountForm({ ...accountForm, account_name: e.target.value })}
                placeholder="Make.com Webhook"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhook-url">Webhook URL *</Label>
              <Input
                id="webhook-url"
                value={accountForm.webhook_url}
                onChange={(e) => setAccountForm({ ...accountForm, webhook_url: e.target.value })}
                placeholder="https://hook.us1.make.com/..."
              />
              <p className="text-xs text-muted-foreground">
                Get this from Make.com or Zapier webhook trigger
              </p>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-900">
                <strong>Tip:</strong> This webhook will receive all published posts with both short-form and long-form content versions for different platforms.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAccountDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAccount}>Save Webhook</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Generation Dialog */}
      <Dialog open={showAIDialog} onOpenChange={setShowAIDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Generate Viral Social Content with AI
            </DialogTitle>
            <DialogDescription>
              Create engaging social media posts optimized for parent audiences and conversions
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            <div className="space-y-2">
              <Label htmlFor="ai-topic">Topic or Focus</Label>
              <Input
                id="ai-topic"
                value={aiForm.topic}
                onChange={(e) => setAiForm({ ...aiForm, topic: e.target.value })}
                placeholder="e.g., Creative ways to present vegetables to toddlers"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-goal">Content Goal</Label>
              <Textarea
                id="ai-goal"
                value={aiForm.contentGoal}
                onChange={(e) => setAiForm({ ...aiForm, contentGoal: e.target.value })}
                placeholder="What action do you want parents to take?"
                rows={3}
              />
            </div>

            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">AI will generate:</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Attention-grabbing title</li>
                <li>• Facebook version (150-250 words, engaging and conversational)</li>
                <li>• Twitter version (under 280 characters, punchy and viral)</li>
                <li>• Optimized hashtags for each platform</li>
                <li>• Bundled data sent to Make.com webhook</li>
              </ul>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowAIDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerateAIContent} disabled={aiGenerating}>
              {aiGenerating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Content
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
