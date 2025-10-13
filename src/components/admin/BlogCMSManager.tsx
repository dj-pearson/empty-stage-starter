import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Sparkles,
  Plus,
  Edit,
  Share2,
  Settings,
  CheckCircle,
  Upload,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import blogTitlesData from "../../../Blog_Titles.md?raw";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  meta_title?: string;
  meta_description?: string;
  featured_image?: string;
  ai_generated: boolean;
  ai_prompt?: string;
  status: string;
  created_at: string;
}

export function BlogCMSManager() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [keywords, setKeywords] = useState("");
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [generatingSocial, setGeneratingSocial] = useState<string | null>(null);
  const [socialContent, setSocialContent] = useState<any>(null);
  const [showSocialDialog, setShowSocialDialog] = useState(false);
  const [showWebhookDialog, setShowWebhookDialog] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [resendingWebhook, setResendingWebhook] = useState<string | null>(null);

  // Title bank management
  const [titleBankInsights, setTitleBankInsights] = useState<any>(null);
  const [titleSuggestions, setTitleSuggestions] = useState<any[]>([]);
  const [loadingTitleBank, setLoadingTitleBank] = useState(false);
  const [showTitleBankDialog, setShowTitleBankDialog] = useState(false);
  const [useTitleBank, setUseTitleBank] = useState(true);

  useEffect(() => {
    loadPosts();
    loadWebhookUrl();
    loadTitleBankInsights();
  }, []);

  const loadTitleBankInsights = async () => {
    try {
      const { data, error } = await supabase.rpc(
        "get_blog_generation_insights"
      );
      if (error) throw error;
      if (data && data.length > 0) {
        setTitleBankInsights(data[0]);
      }
    } catch (error: any) {
      console.error("Error loading title bank insights:", error);
    }
  };

  const loadTitleSuggestions = async () => {
    try {
      const { data, error } = await supabase.rpc(
        "get_diverse_title_suggestions",
        { count: 10 }
      );
      if (error) throw error;
      setTitleSuggestions(data || []);
    } catch (error: any) {
      console.error("Error loading title suggestions:", error);
      toast.error("Failed to load title suggestions");
    }
  };

  const handlePopulateTitleBank = async () => {
    setLoadingTitleBank(true);
    try {
      // Parse Blog_Titles.md
      const jsonMatch = blogTitlesData.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Could not parse Blog_Titles.md file");
      }

      const titlesData = JSON.parse(jsonMatch[0]);
      const titles = titlesData.blog_titles;

      if (!Array.isArray(titles)) {
        throw new Error("Invalid titles format in Blog_Titles.md");
      }

      const { data, error } = await supabase.functions.invoke(
        "manage-blog-titles",
        {
          body: {
            action: "populate",
            titles: titles,
          },
        }
      );

      if (error) throw error;

      if (data.success) {
        toast.success(
          `Successfully added ${data.inserted} new titles to the title bank!`
        );
        loadTitleBankInsights();
      } else {
        toast.error(data.error || "Failed to populate title bank");
      }
    } catch (error: any) {
      console.error("Error populating title bank:", error);
      toast.error(error.message || "Failed to populate title bank");
    } finally {
      setLoadingTitleBank(false);
    }
  };

  const loadWebhookUrl = () => {
    const saved = localStorage.getItem("blog_webhook_url");
    if (saved) setWebhookUrl(saved);
  };

  const saveWebhookUrl = () => {
    localStorage.setItem("blog_webhook_url", webhookUrl);
    toast.success("Webhook URL saved");
    setShowWebhookDialog(false);
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl) {
      toast.error("Please enter a webhook URL first");
      return;
    }

    setTestingWebhook(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "test-blog-webhook",
        {
          body: { webhookUrl },
        }
      );

      if (error) throw error;

      if (data.success) {
        toast.success(`Test webhook sent! Status: ${data.webhookStatus}`);
      } else {
        toast.error("Webhook test failed");
      }
    } catch (error: any) {
      console.error("Error testing webhook:", error);
      toast.error(error.message || "Failed to send test webhook");
    } finally {
      setTestingWebhook(false);
    }
  };

  const handleResendWebhook = async (postId: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    const webhookUrl = localStorage.getItem("blog_webhook_url");
    if (!webhookUrl) {
      toast.error("No webhook URL configured. Set it up first!");
      return;
    }

    setResendingWebhook(postId);
    try {
      // Generate social content
      const blogUrl = `https://tryeatpal.com/blog/${post.slug}`;

      const { data: socialData, error: socialError } =
        await supabase.functions.invoke("generate-social-content", {
          body: {
            topic: `New blog post: ${post.title}`,
            excerpt: post.excerpt,
            url: blogUrl,
            contentGoal: `Promote this blog post and drive traffic to ${blogUrl}`,
            targetAudience:
              "Parents struggling with picky eaters and child meal planning",
          },
        });

      if (socialError) throw socialError;

      const content = socialData.content;
      const hashtagMatches =
        (content.facebook || content.twitter || "").match(/#\w+/g) || [];
      const hashtags = hashtagMatches.map((tag: string) => tag.substring(1));

      const webhookPayload = {
        type: "blog_published",
        blog_id: postId,
        blog_title: post.title,
        blog_url: blogUrl,
        blog_excerpt: post.excerpt,
        short_form: content.twitter || "",
        long_form: content.facebook || "",
        hashtags: hashtags,
        published_at: new Date().toISOString(),
      };

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(webhookPayload),
      });

      if (response.ok) {
        toast.success("Webhook resent successfully!");
      } else {
        toast.error(`Webhook returned status ${response.status}`);
      }
    } catch (error: any) {
      console.error("Error resending webhook:", error);
      toast.error(error.message || "Failed to resend webhook");
    } finally {
      setResendingWebhook(null);
    }
  };

  const loadPosts = async () => {
    try {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setPosts(data || []);
    } catch (error: any) {
      console.error("Error loading posts:", error);
      toast.error(error.message);
    }
  };

  const handleGenerateAIContent = async () => {
    // If using title bank and no prompt, it will auto-select from bank
    if (useTitleBank && !aiPrompt.trim()) {
      // Allow empty prompt to use title bank
    } else if (!useTitleBank && !aiPrompt.trim()) {
      toast.error("Please enter a topic or prompt");
      return;
    }

    setAiGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-blog-content",
        {
          body: {
            topic: aiPrompt.trim() || null,
            keywords: keywords,
            targetAudience: "Parents of picky eaters and young children",
            useTitleBank: useTitleBank,
          },
        }
      );

      if (error) throw error;

      if (data.error) {
        // Handle duplicate detection errors
        if (data.similar_posts || data.similar_post) {
          toast.error(
            <div>
              <p className="font-semibold">{data.error}</p>
              {data.similar_posts && data.similar_posts.length > 0 && (
                <p className="text-sm mt-1">
                  Similar to: {data.similar_posts[0].similar_title}
                </p>
              )}
            </div>,
            { duration: 5000 }
          );
        } else {
          toast.error(data.error);
        }
        return;
      }

      const content = data.content;

      // Save the generated post
      const { error: insertError } = await supabase
        .from("blog_posts")
        .insert([
          {
            title: content.title || "",
            slug:
              content.title
                ?.toLowerCase()
                .replace(/\s+/g, "-")
                .replace(/[^a-z0-9-]/g, "") || "",
            content: content.body || "",
            excerpt: content.excerpt || "",
            meta_title: content.seo_title || "",
            meta_description: content.seo_description || "",
            ai_generated: true,
            ai_prompt: aiPrompt || "Auto-generated from title bank",
            status: "draft",
          },
        ])
        .select();

      if (insertError) throw insertError;

      toast.success("AI blog content generated! Review and edit as needed.");
      setShowAIDialog(false);
      setAiPrompt("");
      setKeywords("");
      loadPosts();
      loadTitleBankInsights(); // Refresh insights after generation

      // Send to webhook if configured
      const webhookUrl = localStorage.getItem("blog_webhook_url");
      if (webhookUrl && content.social) {
        try {
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            mode: "no-cors",
            body: JSON.stringify({
              type: "blog_post_generated",
              title: content.title,
              excerpt: content.excerpt,
              social_versions: content.social,
              timestamp: new Date().toISOString(),
            }),
          });
        } catch (e) {
          console.error("Webhook error:", e);
        }
      }
    } catch (error: any) {
      console.error("Error generating AI content:", error);
      toast.error(error.message || "Failed to generate content");
    } finally {
      setAiGenerating(false);
    }
  };

  const handleEditPost = (post: BlogPost) => {
    setEditingPost(post);
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!editingPost) return;

    try {
      const { error } = await supabase
        .from("blog_posts")
        .update({
          title: editingPost.title,
          content: editingPost.content,
          excerpt: editingPost.excerpt,
          meta_title: editingPost.meta_title,
          meta_description: editingPost.meta_description,
          featured_image: editingPost.featured_image,
        })
        .eq("id", editingPost.id);

      if (error) throw error;

      toast.success("Post updated successfully");
      setShowEditDialog(false);
      setEditingPost(null);
      loadPosts();
    } catch (error: any) {
      console.error("Error updating post:", error);
      toast.error(error.message || "Failed to update post");
    }
  };

  const handleGenerateSocial = async (postId: string) => {
    setGeneratingSocial(postId);

    try {
      const post = posts.find((p) => p.id === postId);
      if (!post) return;

      const { data, error } = await supabase.functions.invoke(
        "generate-social-content",
        {
          body: {
            title: post.title,
            excerpt: post.excerpt,
            url: `https://yoursite.com/blog/${post.slug}`,
          },
        }
      );

      if (error) throw error;
      if (data.error) {
        toast.error(data.error);
        return;
      }

      setSocialContent(data.content ?? data);
      setShowSocialDialog(true);
      toast.success("Social media posts generated!");
    } catch (error: any) {
      console.error("Error generating social content:", error);
      toast.error(error.message || "Failed to generate social posts");
    } finally {
      setGeneratingSocial(null);
    }
  };

  const handlePublish = async (postId: string) => {
    try {
      const post = posts.find((p) => p.id === postId);
      if (!post) return;

      // Update post to published
      const { error: publishError } = await supabase
        .from("blog_posts")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
        })
        .eq("id", postId);

      if (publishError) throw publishError;

      // Generate social media posts about this blog
      const blogUrl = `https://tryeatpal.com/blog/${post.slug}`;

      const { data: socialData, error: socialError } =
        await supabase.functions.invoke("generate-social-content", {
          body: {
            topic: `New blog post: ${post.title}`,
            excerpt: post.excerpt,
            url: blogUrl,
            contentGoal: `Promote this blog post and drive traffic to ${blogUrl}`,
            targetAudience:
              "Parents struggling with picky eaters and child meal planning",
          },
        });

      if (socialError) {
        console.error("Error generating social content:", socialError);
        toast.warning("Post published, but failed to generate social posts");
      } else if (socialData?.content) {
        const content = socialData.content;

        // Extract hashtags from the content
        const hashtagMatches =
          (content.facebook || content.twitter || "").match(/#\w+/g) || [];
        const hashtags = hashtagMatches.map((tag: string) => tag.substring(1));

        // Send to webhook if configured
        const webhookUrl = localStorage.getItem("blog_webhook_url");
        if (webhookUrl) {
          try {
            const webhookPayload = {
              type: "blog_published",
              blog_id: postId,
              blog_title: post.title,
              blog_url: blogUrl,
              blog_excerpt: post.excerpt,
              short_form: content.twitter || "",
              long_form: content.facebook || "",
              hashtags: hashtags,
              published_at: new Date().toISOString(),
            };

            const response = await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(webhookPayload),
            });

            if (response.ok) {
              toast.success(
                "Post published and social content sent to webhook!"
              );
            } else {
              toast.warning(
                `Post published, but webhook returned status ${response.status}`
              );
            }
          } catch (webhookError) {
            console.error("Webhook error:", webhookError);
            toast.warning("Post published, but failed to send to webhook");
          }
        } else {
          toast.success(
            "Post published! Set up a webhook to auto-post to social media."
          );
        }

        // Show social content to user
        setSocialContent(content);
        setShowSocialDialog(true);
      }

      loadPosts();
    } catch (error: any) {
      console.error("Error publishing post:", error);
      toast.error(error.message || "Failed to publish post");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold mb-2">Blog CMS</h2>
          <p className="text-muted-foreground">
            Create, manage, and publish blog content with AI assistance
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowTitleBankDialog(true)}
          >
            <Upload className="h-4 w-4 mr-2" />
            Title Bank
            {titleBankInsights && (
              <Badge variant="secondary" className="ml-2">
                {titleBankInsights.unused_titles} unused
              </Badge>
            )}
          </Button>
          <Button variant="outline" onClick={() => setShowWebhookDialog(true)}>
            <Settings className="h-4 w-4 mr-2" />
            {webhookUrl ? (
              <CheckCircle className="h-4 w-4 mr-1 text-safe-food" />
            ) : null}
            Webhook
          </Button>
          <Button onClick={() => setShowAIDialog(true)}>
            <Sparkles className="h-4 w-4 mr-2" />
            AI Generate Article
          </Button>
        </div>
      </div>

      {/* Posts List */}
      <Card>
        <CardHeader>
          <CardTitle>Blog Posts</CardTitle>
          <CardDescription>AI-generated and manual blog posts</CardDescription>
        </CardHeader>
        <CardContent className="max-h-[600px] overflow-y-auto">
          {posts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No posts yet. Generate your first AI-powered blog post!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <Card key={post.id} className="p-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg">{post.title}</h3>
                      {post.excerpt && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {post.excerpt}
                        </p>
                      )}
                      <div className="flex gap-2 mt-2">
                        {post.ai_generated && (
                          <Badge variant="secondary" className="gap-1">
                            <Sparkles className="h-3 w-3" />
                            AI Generated
                          </Badge>
                        )}
                        <Badge
                          variant={
                            post.status === "published" ? "default" : "outline"
                          }
                        >
                          {post.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditPost(post)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGenerateSocial(post.id)}
                        disabled={generatingSocial === post.id}
                      >
                        {generatingSocial === post.id ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-1" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Share2 className="h-4 w-4 mr-1" />
                            Social Posts
                          </>
                        )}
                      </Button>
                      {(post.status || "").toLowerCase() !== "published" ? (
                        <Button
                          size="sm"
                          onClick={() => handlePublish(post.id)}
                        >
                          Publish
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResendWebhook(post.id)}
                          disabled={resendingWebhook === post.id}
                        >
                          {resendingWebhook === post.id ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-1" />
                              Resending...
                            </>
                          ) : (
                            <>
                              <Share2 className="h-4 w-4 mr-1" />
                              Resend Webhook
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Generation Dialog - SCROLLABLE */}
      <Dialog open={showAIDialog} onOpenChange={setShowAIDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Generate SEO-Optimized Blog Article with AI
            </DialogTitle>
            <DialogDescription>
              Create comprehensive blog content optimized for parents and search
              engines
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <Label
                  htmlFor="use-title-bank"
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Upload className="h-4 w-4" />
                  Use Title Bank (Auto-Select Unique Titles)
                </Label>
                <input
                  id="use-title-bank"
                  type="checkbox"
                  checked={useTitleBank}
                  onChange={(e) => setUseTitleBank(e.target.checked)}
                  className="w-4 h-4"
                />
              </div>
              {useTitleBank && titleBankInsights && (
                <p className="text-sm text-blue-900 mt-2">
                  <strong>{titleBankInsights.unused_titles}</strong> unused
                  titles available. Leave topic blank to auto-select from bank.
                </p>
              )}
              {useTitleBank &&
                (!titleBankInsights ||
                  titleBankInsights.unused_titles === 0) && (
                  <div className="flex items-center gap-2 text-amber-700 text-sm mt-2">
                    <AlertTriangle className="h-4 w-4" />
                    No titles in bank. Click "Title Bank" button to populate.
                  </div>
                )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-topic">
                Topic or Title {!useTitleBank && "*"}
                {useTitleBank && (
                  <span className="text-sm text-muted-foreground ml-1">
                    (Optional - auto-selects if blank)
                  </span>
                )}
              </Label>
              <Input
                id="ai-topic"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={
                  useTitleBank
                    ? "Leave blank to use title bank"
                    : "e.g., 10 Creative Ways to Get Toddlers to Eat Vegetables"
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="keywords">Keywords (Optional)</Label>
              <Input
                id="keywords"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g., picky eaters, toddler nutrition, vegetable recipes"
              />
            </div>

            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-3">AI will generate:</h4>
              <ul className="text-sm space-y-2 text-muted-foreground">
                <li>✓ SEO-optimized title (60 characters)</li>
                <li>✓ Meta description for search engines (150-160 chars)</li>
                <li>✓ Engaging excerpt to hook readers</li>
                <li>✓ Comprehensive body content (~1000-1400 words)</li>
                <li>✓ FAQ section with 5-7 questions</li>
              </ul>
            </div>

            <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-900">
                <strong>Pro tip:</strong> Be specific about your topic and
                include target keywords for better SEO results. The AI will
                create parent-focused content that drives engagement and
                conversions.
              </p>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowAIDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleGenerateAIContent}
              disabled={aiGenerating || (!useTitleBank && !aiPrompt.trim())}
            >
              {aiGenerating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Article
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Post Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Blog Post</DialogTitle>
            <DialogDescription>
              Update the blog post content and metadata
            </DialogDescription>
          </DialogHeader>

          {editingPost && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              <div className="space-y-2">
                <Label htmlFor="edit-title">Title</Label>
                <Input
                  id="edit-title"
                  value={editingPost.title}
                  onChange={(e) =>
                    setEditingPost({ ...editingPost, title: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-excerpt">Excerpt</Label>
                <Textarea
                  id="edit-excerpt"
                  value={editingPost.excerpt}
                  onChange={(e) =>
                    setEditingPost({ ...editingPost, excerpt: e.target.value })
                  }
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-meta-title">SEO Title</Label>
                <Input
                  id="edit-meta-title"
                  value={editingPost.meta_title || ""}
                  onChange={(e) =>
                    setEditingPost({
                      ...editingPost,
                      meta_title: e.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-meta-description">SEO Description</Label>
                <Textarea
                  id="edit-meta-description"
                  value={editingPost.meta_description || ""}
                  onChange={(e) =>
                    setEditingPost({
                      ...editingPost,
                      meta_description: e.target.value,
                    })
                  }
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-featured-image">Featured Image URL</Label>
                <Input
                  id="edit-featured-image"
                  value={editingPost.featured_image || ""}
                  onChange={(e) =>
                    setEditingPost({
                      ...editingPost,
                      featured_image: e.target.value,
                    })
                  }
                  placeholder="/blog-images/my-post-image.png or https://..."
                />
                <p className="text-xs text-muted-foreground">
                  Used for social media previews. Leave empty to use Cover.png
                  as fallback. Optimal size: 1200x630px
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-content">Content</Label>
                <Textarea
                  id="edit-content"
                  value={editingPost.content}
                  onChange={(e) =>
                    setEditingPost({ ...editingPost, content: e.target.value })
                  }
                  rows={15}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Social Content Dialog */}
      <Dialog open={showSocialDialog} onOpenChange={setShowSocialDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generated Social Media Posts</DialogTitle>
            <DialogDescription>
              Copy the versions for each platform below.
            </DialogDescription>
          </DialogHeader>
          {socialContent && (
            <div className="space-y-6">
              {socialContent.twitter && (
                <div className="space-y-2">
                  <h3 className="font-semibold">Twitter/X Post</h3>
                  <p className="whitespace-pre-wrap bg-muted p-4 rounded-md">
                    {socialContent.twitter}
                  </p>
                </div>
              )}
              {socialContent.facebook && (
                <div className="space-y-2">
                  <h3 className="font-semibold">Facebook Post</h3>
                  <p className="whitespace-pre-wrap bg-muted p-4 rounded-md">
                    {socialContent.facebook}
                  </p>
                </div>
              )}
              {socialContent.instagram && (
                <div className="space-y-2">
                  <h3 className="font-semibold">Instagram Caption</h3>
                  <p className="whitespace-pre-wrap bg-muted p-4 rounded-md">
                    {socialContent.instagram}
                  </p>
                </div>
              )}
              {socialContent.linkedin && (
                <div className="space-y-2">
                  <h3 className="font-semibold">LinkedIn Post</h3>
                  <p className="whitespace-pre-wrap bg-muted p-4 rounded-md">
                    {socialContent.linkedin}
                  </p>
                </div>
              )}
              {socialContent.pinterest && (
                <div className="space-y-2">
                  <h3 className="font-semibold">Pinterest Description</h3>
                  <p className="whitespace-pre-wrap bg-muted p-4 rounded-md">
                    {socialContent.pinterest}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Webhook Configuration Dialog */}
      <Dialog open={showWebhookDialog} onOpenChange={setShowWebhookDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure Blog Webhook</DialogTitle>
            <DialogDescription>
              When a blog is published, social media posts will be automatically
              generated and sent to this webhook
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="blog-webhook-url">Webhook URL</Label>
              <Input
                id="blog-webhook-url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://hook.us1.make.com/..."
              />
              <p className="text-xs text-muted-foreground">
                Get this from Make.com or Zapier webhook trigger
              </p>
            </div>

            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Webhook Payload</h4>
              <p className="text-sm text-muted-foreground mb-2">
                When a blog post is published, the webhook will receive:
              </p>
              <ul className="text-sm space-y-1 text-muted-foreground ml-4 list-disc">
                <li>
                  <strong>blog_title</strong>: Title of the blog post
                </li>
                <li>
                  <strong>blog_url</strong>: Full URL to the blog post
                </li>
                <li>
                  <strong>blog_excerpt</strong>: Brief summary
                </li>
                <li>
                  <strong>short_form</strong>: Twitter/X version (under 280
                  chars)
                </li>
                <li>
                  <strong>long_form</strong>: Facebook/LinkedIn version
                </li>
                <li>
                  <strong>hashtags</strong>: Array of relevant hashtags
                </li>
              </ul>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowWebhookDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={handleTestWebhook}
              disabled={testingWebhook || !webhookUrl}
            >
              {testingWebhook ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2" />
                  Testing...
                </>
              ) : (
                "Test Webhook"
              )}
            </Button>
            <Button onClick={saveWebhookUrl}>Save Webhook</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Title Bank Management Dialog */}
      <Dialog open={showTitleBankDialog} onOpenChange={setShowTitleBankDialog}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Blog Title Bank & Uniqueness System
            </DialogTitle>
            <DialogDescription>
              Manage your blog title inventory and ensure unique content
              generation
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="overview" className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
              <TabsTrigger value="import">Import</TabsTrigger>
            </TabsList>

            <TabsContent
              value="overview"
              className="flex-1 overflow-y-auto space-y-4"
            >
              {titleBankInsights ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">
                        Total Titles
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {titleBankInsights.total_titles}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        In title bank
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">
                        Unused Titles
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-safe-food">
                        {titleBankInsights.unused_titles}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Ready to use
                      </p>
                    </CardContent>
                  </Card>

                  {titleBankInsights.most_used_title && (
                    <Card className="md:col-span-2">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">
                          Most Used Title
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm">
                          {titleBankInsights.most_used_title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Used {titleBankInsights.most_used_count} times
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {titleBankInsights.recent_topics &&
                    titleBankInsights.recent_topics.length > 0 && (
                      <Card className="md:col-span-2">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium">
                            Recent Topics (Last 30 Days)
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {titleBankInsights.recent_topics
                              .slice(0, 10)
                              .map((topic: string, idx: number) => (
                                <Badge key={idx} variant="secondary">
                                  {topic}
                                </Badge>
                              ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p>
                    No title bank data available. Import titles to get started!
                  </p>
                </div>
              )}

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">
                  How Title Bank Works
                </h4>
                <ul className="text-sm space-y-1 text-blue-800">
                  <li>✓ Automatically selects unused or least-used titles</li>
                  <li>
                    ✓ Prevents duplicate content with similarity detection
                  </li>
                  <li>✓ Tracks usage to ensure diverse SEO coverage</li>
                  <li>
                    ✓ Varies writing tone and perspective for each article
                  </li>
                </ul>
              </div>
            </TabsContent>

            <TabsContent
              value="suggestions"
              className="flex-1 overflow-y-auto space-y-4"
            >
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  Next recommended titles based on usage and diversity
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadTitleSuggestions}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
              </div>

              {titleSuggestions.length > 0 ? (
                <div className="space-y-2">
                  {titleSuggestions.map((suggestion, idx) => (
                    <Card key={idx} className="p-3">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium">{suggestion.title}</p>
                          <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                            <span>Used: {suggestion.times_used} times</span>
                            {suggestion.last_used_days_ago !== null && (
                              <span>
                                Last used: {suggestion.last_used_days_ago} days
                                ago
                              </span>
                            )}
                            {suggestion.last_used_days_ago === null && (
                              <Badge variant="secondary" className="text-xs">
                                Never used
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setAiPrompt(suggestion.title);
                            setShowTitleBankDialog(false);
                            setShowAIDialog(true);
                          }}
                        >
                          Use
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p>Click "Refresh" to load title suggestions</p>
                </div>
              )}
            </TabsContent>

            <TabsContent
              value="import"
              className="flex-1 overflow-y-auto space-y-4"
            >
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">
                    Import from Blog_Titles.md
                  </h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    This will load all titles from your Blog_Titles.md file into
                    the title bank. Duplicate titles will be automatically
                    skipped.
                  </p>
                  <Button
                    onClick={handlePopulateTitleBank}
                    disabled={loadingTitleBank}
                    className="w-full"
                  >
                    {loadingTitleBank ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Import Titles from Blog_Titles.md
                      </>
                    )}
                  </Button>
                </div>

                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-amber-900 mb-1">
                        Uniqueness Protection
                      </h4>
                      <p className="text-sm text-amber-800">
                        The system automatically prevents duplicate content by:
                      </p>
                      <ul className="text-sm text-amber-800 mt-2 space-y-1 ml-4 list-disc">
                        <li>Checking title similarity (85% threshold)</li>
                        <li>Hashing content to detect duplicates</li>
                        <li>Tracking keyword usage over time</li>
                        <li>Varying writing tone and perspective</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {titleBankInsights?.recommended_next_topics && (
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-3">
                      Recommended Next Topics
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {titleBankInsights.recommended_next_topics.map(
                        (topic: string, idx: number) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                            onClick={() => {
                              setAiPrompt(topic);
                              setShowTitleBankDialog(false);
                              setShowAIDialog(true);
                            }}
                          >
                            {topic}
                          </Badge>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setShowTitleBankDialog(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
