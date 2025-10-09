import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Sparkles, Plus, Edit, Share2 } from "lucide-react";
import { toast } from "sonner";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  meta_title?: string;
  meta_description?: string;
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

  useEffect(() => {
    loadPosts();
  }, []);

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
    if (!aiPrompt.trim()) {
      toast.error("Please enter a topic or prompt");
      return;
    }

    setAiGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-blog-content', {
        body: {
          topic: aiPrompt,
          keywords: keywords,
          targetAudience: "Parents of picky eaters and young children"
        }
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      const content = data.content;

      // Save the generated post
      const { error: insertError } = await supabase.from("blog_posts").insert([
        {
          title: content.title || "",
          slug: content.title?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || "",
          content: content.body || "",
          excerpt: content.excerpt || "",
          meta_title: content.seo_title || "",
          meta_description: content.seo_description || "",
          ai_generated: true,
          ai_prompt: aiPrompt,
          status: "draft"
        },
      ]).select();

      if (insertError) throw insertError;

      toast.success("AI blog content generated! Review and edit as needed.");
      setShowAIDialog(false);
      setAiPrompt("");
      setKeywords("");
      loadPosts();

      // Send to webhook if configured
      const webhookUrl = localStorage.getItem('blog_webhook_url');
      if (webhookUrl && content.social) {
        try {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            mode: 'no-cors',
            body: JSON.stringify({
              type: 'blog_post_generated',
              title: content.title,
              excerpt: content.excerpt,
              social_versions: content.social,
              timestamp: new Date().toISOString()
            })
          });
        } catch (e) {
          console.error('Webhook error:', e);
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
      const post = posts.find(p => p.id === postId);
      if (!post) return;

      const { data, error } = await supabase.functions.invoke('generate-social-content', {
        body: {
          title: post.title,
          excerpt: post.excerpt,
          url: `https://yoursite.com/blog/${post.slug}`
        }
      });

      if (error) throw error;
      if (data.error) {
        toast.error(data.error);
        return;
      }

      toast.success("Social media posts generated! Check Social Media Manager.");
    } catch (error: any) {
      console.error("Error generating social content:", error);
      toast.error(error.message || "Failed to generate social posts");
    } finally {
      setGeneratingSocial(null);
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
        <Button onClick={() => setShowAIDialog(true)}>
          <Sparkles className="h-4 w-4 mr-2" />
          AI Generate Article
        </Button>
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
                  <div className="flex items-start justify-between gap-4">
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
                        <Badge variant={post.status === 'published' ? 'default' : 'outline'}>
                          {post.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
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
              Create comprehensive blog content optimized for parents and search engines
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            <div className="space-y-2">
              <Label htmlFor="ai-topic">Topic or Title *</Label>
              <Input
                id="ai-topic"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g., 10 Creative Ways to Get Toddlers to Eat Vegetables"
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
                <strong>Pro tip:</strong> Be specific about your topic and include target keywords for better SEO results. The AI will create parent-focused content that drives engagement and conversions.
              </p>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowAIDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerateAIContent} disabled={aiGenerating || !aiPrompt.trim()}>
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
                  onChange={(e) => setEditingPost({ ...editingPost, title: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-excerpt">Excerpt</Label>
                <Textarea
                  id="edit-excerpt"
                  value={editingPost.excerpt}
                  onChange={(e) => setEditingPost({ ...editingPost, excerpt: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-meta-title">SEO Title</Label>
                <Input
                  id="edit-meta-title"
                  value={editingPost.meta_title || ""}
                  onChange={(e) => setEditingPost({ ...editingPost, meta_title: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-meta-description">SEO Description</Label>
                <Textarea
                  id="edit-meta-description"
                  value={editingPost.meta_description || ""}
                  onChange={(e) => setEditingPost({ ...editingPost, meta_description: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-content">Content</Label>
                <Textarea
                  id="edit-content"
                  value={editingPost.content}
                  onChange={(e) => setEditingPost({ ...editingPost, content: e.target.value })}
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
            <Button onClick={handleSaveEdit}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
