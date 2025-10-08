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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  BookOpen,
  Plus,
  Edit,
  Trash2,
  Eye,
  Calendar as CalendarIcon,
  TrendingUp,
  FileText,
  Tag,
  Sparkles,
  Save,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featured_image_url?: string;
  category_id?: string;
  status: string;
  published_at?: string;
  scheduled_for?: string;
  meta_title?: string;
  meta_description?: string;
  og_image_url?: string;
  views: number;
  reading_time_minutes?: number;
  ai_generated: boolean;
  created_at: string;
  blog_categories?: { name: string };
}

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  post_count: number;
}

interface Tag {
  id: string;
  name: string;
  slug: string;
}

interface BlogStats {
  total_posts: number;
  published_posts: number;
  draft_posts: number;
  scheduled_posts: number;
  total_views: number;
}

export function BlogCMSManager() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [stats, setStats] = useState<BlogStats>({
    total_posts: 0,
    published_posts: 0,
    draft_posts: 0,
    scheduled_posts: 0,
    total_views: 0,
  });

  const [showPostEditor, setShowPostEditor] = useState(false);
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  // Post editor state
  const [postForm, setPostForm] = useState({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    featured_image_url: "",
    category_id: "",
    status: "draft",
    scheduled_for: "",
    meta_title: "",
    meta_description: "",
    og_image_url: "",
  });

  // AI generator state
  const [aiForm, setAiForm] = useState({
    topic: "",
    audience: "parents",
    tone: "friendly",
    word_count: "800",
    category_id: "",
  });
  const [aiGeneratedContent, setAiGeneratedContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Category/Tag forms
  const [categoryForm, setCategoryForm] = useState({ name: "", slug: "", description: "" });
  const [tagForm, setTagForm] = useState({ name: "", slug: "" });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await Promise.all([loadStats(), loadPosts(), loadCategories(), loadTags()]);
  };

  const loadStats = async () => {
    try {
      const { data, error } = await supabase.rpc("get_blog_stats");
      if (error) throw error;
      if (data && data.length > 0) {
        setStats(data[0]);
      }
    } catch (error: any) {
      console.error("Error loading stats:", error);
    }
  };

  const loadPosts = async () => {
    try {
      let query = supabase
        .from("blog_posts")
        .select("*, blog_categories(name)")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setPosts(data || []);
    } catch (error: any) {
      toast.error("Failed to load posts");
      console.error(error);
    }
  };

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("blog_categories")
        .select("*")
        .order("name");
      if (error) throw error;
      setCategories(data || []);
    } catch (error: any) {
      console.error("Error loading categories:", error);
    }
  };

  const loadTags = async () => {
    try {
      const { data, error } = await supabase
        .from("blog_tags")
        .select("*")
        .order("name");
      if (error) throw error;
      setTags(data || []);
    } catch (error: any) {
      console.error("Error loading tags:", error);
    }
  };

  useEffect(() => {
    loadPosts();
  }, [statusFilter]);

  const openPostEditor = (post?: BlogPost) => {
    if (post) {
      setEditingPost(post);
      setPostForm({
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt || "",
        content: post.content,
        featured_image_url: post.featured_image_url || "",
        category_id: post.category_id || "",
        status: post.status,
        scheduled_for: post.scheduled_for || "",
        meta_title: post.meta_title || "",
        meta_description: post.meta_description || "",
        og_image_url: post.og_image_url || "",
      });
    } else {
      setEditingPost(null);
      setPostForm({
        title: "",
        slug: "",
        excerpt: "",
        content: "",
        featured_image_url: "",
        category_id: "",
        status: "draft",
        scheduled_for: "",
        meta_title: "",
        meta_description: "",
        og_image_url: "",
      });
    }
    setShowPostEditor(true);
  };

  const handleSavePost = async (publishNow = false) => {
    try {
      setLoading(true);

      const postData: any = {
        ...postForm,
        status: publishNow ? "published" : postForm.status,
        published_at: publishNow ? new Date().toISOString() : editingPost?.published_at,
      };

      // Auto-generate excerpt if empty
      if (!postData.excerpt && postData.content) {
        postData.excerpt = postData.content.substring(0, 160) + "...";
      }

      // Auto-generate meta title if empty
      if (!postData.meta_title && postData.title) {
        postData.meta_title = postData.title;
      }

      // Auto-generate meta description if empty
      if (!postData.meta_description && postData.excerpt) {
        postData.meta_description = postData.excerpt;
      }

      if (editingPost) {
        const { error } = await supabase
          .from("blog_posts")
          .update(postData)
          .eq("id", editingPost.id);
        if (error) throw error;
        toast.success(publishNow ? "Post published!" : "Post updated!");
      } else {
        const { error } = await supabase.from("blog_posts").insert([postData]);
        if (error) throw error;
        toast.success(publishNow ? "Post published!" : "Post created!");
      }

      setShowPostEditor(false);
      loadData();
    } catch (error: any) {
      toast.error("Failed to save post");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm("Are you sure you want to delete this post?")) return;

    try {
      const { error } = await supabase.from("blog_posts").delete().eq("id", postId);
      if (error) throw error;
      toast.success("Post deleted");
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete post");
      console.error(error);
    }
  };

  const handleGenerateWithAI = async () => {
    try {
      setIsGenerating(true);

      // Get AI settings
      const { data: aiSettings } = await supabase
        .from("ai_settings")
        .select("*")
        .eq("is_active", true)
        .single();

      if (!aiSettings || !aiSettings.api_key) {
        toast.error("AI is not configured. Please add API key in AI Settings tab.");
        return;
      }

      // Create the prompt
      const prompt = `Write a blog post about: ${aiForm.topic}

Target Audience: ${aiForm.audience}
Tone: ${aiForm.tone}
Word Count: approximately ${aiForm.word_count} words

Please write an engaging, informative blog post with:
- A compelling introduction
- Well-structured body paragraphs with subheadings
- Practical tips and actionable advice
- A strong conclusion
- Use markdown formatting for headers (##, ###) and emphasis

Focus on providing valuable information for parents of picky eaters.`;

      // Call Claude API
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": aiSettings.api_key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: aiSettings.model_name || "claude-3-5-sonnet-20241022",
          max_tokens: parseInt(aiForm.word_count) * 2,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate content with AI");
      }

      const result = await response.json();
      const generatedText = result.content[0].text;

      setAiGeneratedContent(generatedText);
      toast.success("Content generated! Review and edit before saving.");
    } catch (error: any) {
      toast.error("Failed to generate content");
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUseAIContent = () => {
    // Extract title from first header if present
    const titleMatch = aiGeneratedContent.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : aiForm.topic;

    // Remove the title from content if it was there
    const content = titleMatch
      ? aiGeneratedContent.replace(/^#\s+.+$/m, "").trim()
      : aiGeneratedContent;

    // Generate excerpt
    const plainText = content.replace(/[#*_`]/g, "").substring(0, 160);
    const excerpt = plainText + "...";

    setPostForm({
      ...postForm,
      title,
      content,
      excerpt,
      meta_title: title,
      meta_description: excerpt,
      category_id: aiForm.category_id,
    });

    setShowAIGenerator(false);
    setShowPostEditor(true);

    // Mark as AI generated
    toast.success("AI content loaded into editor. Review and customize before publishing!");
  };

  const handleSaveCategory = async () => {
    try {
      if (editingCategory) {
        const { error } = await supabase
          .from("blog_categories")
          .update(categoryForm)
          .eq("id", editingCategory.id);
        if (error) throw error;
        toast.success("Category updated");
      } else {
        const { error } = await supabase.from("blog_categories").insert([categoryForm]);
        if (error) throw error;
        toast.success("Category created");
      }
      setShowCategoryDialog(false);
      loadCategories();
    } catch (error: any) {
      toast.error("Failed to save category");
      console.error(error);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm("Delete this category? Posts will not be deleted.")) return;

    try {
      const { error } = await supabase.from("blog_categories").delete().eq("id", categoryId);
      if (error) throw error;
      toast.success("Category deleted");
      loadCategories();
    } catch (error: any) {
      toast.error("Failed to delete category");
      console.error(error);
    }
  };

  const handleSaveTag = async () => {
    try {
      if (editingTag) {
        const { error } = await supabase
          .from("blog_tags")
          .update(tagForm)
          .eq("id", editingTag.id);
        if (error) throw error;
        toast.success("Tag updated");
      } else {
        const { error } = await supabase.from("blog_tags").insert([tagForm]);
        if (error) throw error;
        toast.success("Tag created");
      }
      setShowTagDialog(false);
      loadTags();
    } catch (error: any) {
      toast.error("Failed to save tag");
      console.error(error);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    if (!confirm("Delete this tag?")) return;

    try {
      const { error } = await supabase.from("blog_tags").delete().eq("id", tagId);
      if (error) throw error;
      toast.success("Tag deleted");
      loadTags();
    } catch (error: any) {
      toast.error("Failed to delete tag");
      console.error(error);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: any = {
      draft: "bg-gray-500",
      published: "bg-green-500",
      scheduled: "bg-blue-500",
    };
    return (
      <Badge className={cn("text-white", colors[status] || "bg-gray-500")}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const filteredPosts = posts.filter((post) => {
    if (searchQuery) {
      return (
        post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.content.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Posts</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_posts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Published</CardTitle>
            <FileText className="h-4 w-4 text-safe-food" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.published_posts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Drafts</CardTitle>
            <Edit className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.draft_posts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <CalendarIcon className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.scheduled_posts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Views</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_views.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="posts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
          <TabsTrigger value="ai-generator">
            <Sparkles className="h-4 w-4 mr-2" />
            AI Generator
          </TabsTrigger>
        </TabsList>

        {/* Posts Tab */}
        <TabsContent value="posts" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div className="flex flex-col sm:flex-row gap-2 flex-1">
              <Input
                placeholder="Search posts..."
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
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => openPostEditor()}>
              <Plus className="h-4 w-4 mr-2" />
              New Post
            </Button>
          </div>

          <div className="border rounded-lg">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-4 font-medium">Title</th>
                    <th className="text-left p-4 font-medium">Category</th>
                    <th className="text-left p-4 font-medium">Status</th>
                    <th className="text-left p-4 font-medium">Views</th>
                    <th className="text-left p-4 font-medium">Date</th>
                    <th className="text-right p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPosts.map((post) => (
                    <tr key={post.id} className="border-t hover:bg-muted/30">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          {post.ai_generated && (
                            <Sparkles className="h-4 w-4 text-purple-500" title="AI Generated" />
                          )}
                          <span className="font-medium">{post.title}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-sm text-muted-foreground">
                          {post.blog_categories?.name || "Uncategorized"}
                        </span>
                      </td>
                      <td className="p-4">{getStatusBadge(post.status)}</td>
                      <td className="p-4 text-sm text-muted-foreground">{post.views}</td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {format(new Date(post.created_at), "MMM d, yyyy")}
                      </td>
                      <td className="p-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPostEditor(post)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeletePost(post.id)}
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

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-4">
          <div className="flex justify-between">
            <h3 className="text-lg font-medium">Blog Categories</h3>
            <Button
              onClick={() => {
                setEditingCategory(null);
                setCategoryForm({ name: "", slug: "", description: "" });
                setShowCategoryDialog(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Category
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <Card key={category.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{category.name}</CardTitle>
                      <CardDescription>/{category.slug}</CardDescription>
                    </div>
                    <Badge>{category.post_count} posts</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    {category.description || "No description"}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingCategory(category);
                        setCategoryForm({
                          name: category.name,
                          slug: category.slug,
                          description: category.description || "",
                        });
                        setShowCategoryDialog(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteCategory(category.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tags Tab */}
        <TabsContent value="tags" className="space-y-4">
          <div className="flex justify-between">
            <h3 className="text-lg font-medium">Blog Tags</h3>
            <Button
              onClick={() => {
                setEditingTag(null);
                setTagForm({ name: "", slug: "" });
                setShowTagDialog(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Tag
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center gap-2 px-4 py-2 bg-muted rounded-full"
              >
                <Tag className="h-4 w-4" />
                <span>{tag.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-destructive/10"
                  onClick={() => handleDeleteTag(tag.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* AI Generator Tab */}
        <TabsContent value="ai-generator" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                AI Content Generator
              </CardTitle>
              <CardDescription>
                Generate blog post content using AI. Review and customize before publishing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Topic or Title</Label>
                  <Input
                    placeholder="e.g., Tips for Dealing with Picky Eaters at Dinner Time"
                    value={aiForm.topic}
                    onChange={(e) => setAiForm({ ...aiForm, topic: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={aiForm.category_id}
                    onValueChange={(value) => setAiForm({ ...aiForm, category_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Target Audience</Label>
                  <Select
                    value={aiForm.audience}
                    onValueChange={(value) => setAiForm({ ...aiForm, audience: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="parents">Parents</SelectItem>
                      <SelectItem value="new-parents">New Parents</SelectItem>
                      <SelectItem value="busy-parents">Busy Parents</SelectItem>
                      <SelectItem value="health-conscious">Health-Conscious Parents</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Tone</Label>
                  <Select
                    value={aiForm.tone}
                    onValueChange={(value) => setAiForm({ ...aiForm, tone: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="friendly">Friendly</SelectItem>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="empathetic">Empathetic</SelectItem>
                      <SelectItem value="encouraging">Encouraging</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Word Count</Label>
                  <Select
                    value={aiForm.word_count}
                    onValueChange={(value) => setAiForm({ ...aiForm, word_count: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="500">~500 words (Short)</SelectItem>
                      <SelectItem value="800">~800 words (Medium)</SelectItem>
                      <SelectItem value="1200">~1200 words (Long)</SelectItem>
                      <SelectItem value="1500">~1500 words (In-depth)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                onClick={handleGenerateWithAI}
                disabled={!aiForm.topic || isGenerating}
                className="w-full"
              >
                {isGenerating ? (
                  <>Generating...</>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Content with AI
                  </>
                )}
              </Button>

              {aiGeneratedContent && (
                <div className="space-y-4 mt-6 p-4 border rounded-lg bg-muted/30">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium">Generated Content Preview</h4>
                    <Button onClick={handleUseAIContent}>
                      <Edit className="h-4 w-4 mr-2" />
                      Use This Content
                    </Button>
                  </div>
                  <div className="prose prose-sm max-w-none bg-white p-4 rounded border">
                    <pre className="whitespace-pre-wrap font-sans text-sm">
                      {aiGeneratedContent}
                    </pre>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Post Editor Dialog */}
      <Dialog open={showPostEditor} onOpenChange={setShowPostEditor}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPost ? "Edit Post" : "Create New Post"}</DialogTitle>
            <DialogDescription>
              Fill in the details below. SEO fields will auto-populate if left empty.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Title *</Label>
                <Input
                  value={postForm.title}
                  onChange={(e) =>
                    setPostForm({
                      ...postForm,
                      title: e.target.value,
                      slug: e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9\s-]/g, "")
                        .replace(/\s+/g, "-"),
                    })
                  }
                  placeholder="Post title"
                />
              </div>

              <div className="space-y-2">
                <Label>Slug *</Label>
                <Input
                  value={postForm.slug}
                  onChange={(e) => setPostForm({ ...postForm, slug: e.target.value })}
                  placeholder="post-url-slug"
                />
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={postForm.category_id}
                  onValueChange={(value) => setPostForm({ ...postForm, category_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Content *</Label>
                <Textarea
                  value={postForm.content}
                  onChange={(e) => setPostForm({ ...postForm, content: e.target.value })}
                  placeholder="Write your post content here... (supports markdown)"
                  rows={12}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Excerpt</Label>
                <Textarea
                  value={postForm.excerpt}
                  onChange={(e) => setPostForm({ ...postForm, excerpt: e.target.value })}
                  placeholder="Brief summary (auto-generated if empty)"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Featured Image URL</Label>
                <Input
                  value={postForm.featured_image_url}
                  onChange={(e) =>
                    setPostForm({ ...postForm, featured_image_url: e.target.value })
                  }
                  placeholder="https://..."
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={postForm.status}
                  onValueChange={(value) => setPostForm({ ...postForm, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Meta Title (SEO)</Label>
                <Input
                  value={postForm.meta_title}
                  onChange={(e) => setPostForm({ ...postForm, meta_title: e.target.value })}
                  placeholder="Auto-generated from title if empty"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Meta Description (SEO)</Label>
                <Textarea
                  value={postForm.meta_description}
                  onChange={(e) =>
                    setPostForm({ ...postForm, meta_description: e.target.value })
                  }
                  placeholder="Auto-generated from excerpt if empty"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>OG Image URL (Social Sharing)</Label>
                <Input
                  value={postForm.og_image_url}
                  onChange={(e) => setPostForm({ ...postForm, og_image_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowPostEditor(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => handleSavePost(false)} disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              Save Draft
            </Button>
            <Button onClick={() => handleSavePost(true)} disabled={loading}>
              <Send className="h-4 w-4 mr-2" />
              Publish Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? "Edit Category" : "Create Category"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={categoryForm.name}
                onChange={(e) =>
                  setCategoryForm({
                    ...categoryForm,
                    name: e.target.value,
                    slug: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9\s-]/g, "")
                      .replace(/\s+/g, "-"),
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Slug *</Label>
              <Input
                value={categoryForm.slug}
                onChange={(e) => setCategoryForm({ ...categoryForm, slug: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={categoryForm.description}
                onChange={(e) =>
                  setCategoryForm({ ...categoryForm, description: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCategoryDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveCategory}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tag Dialog */}
      <Dialog open={showTagDialog} onOpenChange={setShowTagDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTag ? "Edit Tag" : "Create Tag"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={tagForm.name}
                onChange={(e) =>
                  setTagForm({
                    ...tagForm,
                    name: e.target.value,
                    slug: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9\s-]/g, "")
                      .replace(/\s+/g, "-"),
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Slug *</Label>
              <Input
                value={tagForm.slug}
                onChange={(e) => setTagForm({ ...tagForm, slug: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTagDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTag}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
