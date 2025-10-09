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
  ai_prompt?: string;
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

  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null);
  const [postForm, setPostForm] = useState({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    featured_image_url: "",
    category_id: "",
    status: "draft",
    published_at: "",
    scheduled_for: "",
    meta_title: "",
    meta_description: "",
    og_image_url: "",
    ai_generated: false,
    ai_prompt: "",
  });
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    slug: "",
    description: "",
  });
  const [tagForm, setTagForm] = useState({
    name: "",
    slug: "",
  });
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("created_at_desc");

  useEffect(() => {
    loadPosts();
    loadCategories();
    loadTags();
    loadStats();
  }, [sortOrder]);

  const loadPosts = async () => {
    try {
      let query = supabase
        .from("blog_posts")
        .select("*, blog_categories(name)")
        .ilike("title", `%${searchQuery}%`);

      if (sortOrder === "created_at_asc") {
        query = query.order("created_at", { ascending: true });
      } else if (sortOrder === "created_at_desc") {
        query = query.order("created_at", { ascending: false });
      } else if (sortOrder === "views_asc") {
        query = query.order("views", { ascending: true });
      } else if (sortOrder === "views_desc") {
        query = query.order("views", { ascending: false });
      }

      const { data, error } = await query;

      if (error) throw error;
      setPosts(data || []);
    } catch (error: any) {
      console.error("Error loading posts:", error);
      toast.error(error.message);
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
      toast.error(error.message);
    }
  };

  const loadTags = async () => {
    try {
      const { data, error } = await supabase.from("blog_tags").select("*").order("name");
      if (error) throw error;
      setTags(data || []);
    } catch (error: any) {
      console.error("Error loading tags:", error);
      toast.error(error.message);
    }
  };

  const loadStats = async () => {
    try {
      const { data, error } = await supabase.rpc("get_blog_stats").single();
      if (error) throw error;
      setStats(data || {
        total_posts: 0,
        published_posts: 0,
        draft_posts: 0,
        scheduled_posts: 0,
        total_views: 0,
      });
    } catch (error: any) {
      console.error("Error loading stats:", error);
      toast.error(error.message);
    }
  };

  const handleInputChange = (e: any) => {
    const { name, value } = e.target;
    setPostForm({ ...postForm, [name]: value });
  };

  const handleCategoryInputChange = (e: any) => {
    const { name, value } = e.target;
    setCategoryForm({ ...categoryForm, [name]: value });
  };

  const handleTagInputChange = (e: any) => {
    const { name, value } = e.target;
    setTagForm({ ...tagForm, [name]: value });
  };

  const handleOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setEditOpen(false);
    setDeleteOpen(false);
    setViewOpen(false);
    setPostForm({
      title: "",
      slug: "",
      excerpt: "",
      content: "",
      featured_image_url: "",
      category_id: "",
      status: "draft",
      published_at: "",
      scheduled_for: "",
      meta_title: "",
      meta_description: "",
      og_image_url: "",
      ai_generated: false,
      ai_prompt: "",
    });
  };

  const handleEditOpen = (post: BlogPost) => {
    setSelectedPost(post);
    setPostForm({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt || "",
      content: post.content,
      featured_image_url: post.featured_image_url || "",
      category_id: post.category_id || "",
      status: post.status,
      published_at: post.published_at || "",
      scheduled_for: post.scheduled_for || "",
      meta_title: post.meta_title || "",
      meta_description: post.meta_description || "",
      og_image_url: post.og_image_url || "",
      ai_generated: post.ai_generated,
      ai_prompt: post.ai_prompt || "",
    });
    setEditOpen(true);
  };

  const handleDeleteOpen = (post: BlogPost) => {
    setSelectedPost(post);
    setDeleteOpen(true);
  };

  const handleViewOpen = (post: BlogPost) => {
    setSelectedPost(post);
    setViewOpen(true);
  };

  const handleGenerateAIContent = async () => {
    if (!postForm.ai_prompt) {
      toast.error("Please enter a topic or prompt for AI generation");
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-blog-content', {
        body: {
          topic: postForm.ai_prompt,
          keywords: "",
          targetAudience: "Parents of picky eaters and young children"
        }
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      const content = data.content;
      
      setPostForm({
        ...postForm,
        title: content.title || "",
        content: content.body || "",
        excerpt: content.excerpt || "",
        meta_title: content.seo_title || "",
        meta_description: content.seo_description || "",
        ai_generated: true,
      });

      toast.success("AI content generated successfully! Review and edit as needed.");
      
      // Send to webhook for Make.com automation if needed
      if (content.social) {
        console.log("Social media versions generated:", content.social);
        // You can trigger webhook here if configured
      }
    } catch (error: any) {
      console.error("Error generating AI content:", error);
      toast.error(error.message || "Failed to generate content");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSavePost = async () => {
    setIsSaving(true);
    try {
      const { data, error } = await supabase.from("blog_posts").insert([
        {
          title: postForm.title,
          slug: postForm.slug,
          excerpt: postForm.excerpt,
          content: postForm.content,
          featured_image_url: postForm.featured_image_url,
          category_id: postForm.category_id,
          status: postForm.status,
          meta_title: postForm.meta_title,
          meta_description: postForm.meta_description,
          og_image_url: postForm.og_image_url,
          ai_generated: postForm.ai_generated,
          ai_prompt: postForm.ai_prompt,
        },
      ]).select();

      if (error) throw error;
      
      // If AI generated and has webhook configured, send bundle to Make.com
      const webhookUrl = localStorage.getItem('blog_webhook_url');
      if (postForm.ai_generated && webhookUrl && data && data.length > 0) {
        try {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            mode: 'no-cors',
            body: JSON.stringify({
              type: 'blog_post_created',
              post_id: data[0].id,
              title: postForm.title,
              slug: postForm.slug,
              excerpt: postForm.excerpt,
              content: postForm.content,
              meta_title: postForm.meta_title,
              meta_description: postForm.meta_description,
              social_versions: postForm.ai_generated ? {
                twitter: postForm.excerpt,
                facebook: postForm.excerpt
              } : null,
              timestamp: new Date().toISOString()
            })
          });
          console.log('Blog post data sent to webhook');
        } catch (webhookError) {
          console.error('Webhook error:', webhookError);
        }
      }
      
      loadPosts();
      handleClose();
      toast.success("Post saved successfully!");
    } catch (error: any) {
      console.error("Error saving post:", error);
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePost = async () => {
    setIsSaving(true);
    try {
      const { data, error } = await supabase
        .from("blog_posts")
        .update({
          title: postForm.title,
          slug: postForm.slug,
          excerpt: postForm.excerpt,
          content: postForm.content,
          featured_image_url: postForm.featured_image_url,
          category_id: postForm.category_id,
          status: postForm.status,
          meta_title: postForm.meta_title,
          meta_description: postForm.meta_description,
          og_image_url: postForm.og_image_url,
          ai_generated: postForm.ai_generated,
          ai_prompt: postForm.ai_prompt,
        })
        .eq("id", selectedPost?.id);

      if (error) throw error;
      loadPosts();
      handleClose();
      toast.success("Post updated successfully!");
    } catch (error: any) {
      console.error("Error updating post:", error);
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublishPost = async () => {
    setIsPublishing(true);
    try {
      const { data, error } = await supabase
        .from("blog_posts")
        .update({ status: "published", published_at: new Date().toISOString() })
        .eq("id", selectedPost?.id);

      if (error) throw error;
      loadPosts();
      handleClose();
      toast.success("Post published successfully!");
    } catch (error: any) {
      console.error("Error publishing post:", error);
      toast.error(error.message);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSchedulePost = async () => {
    setIsScheduling(true);
    try {
      const { data, error } = await supabase
        .from("blog_posts")
        .update({ status: "scheduled", scheduled_for: date?.toISOString() })
        .eq("id", selectedPost?.id);

      if (error) throw error;
      loadPosts();
      handleClose();
      toast.success("Post scheduled successfully!");
    } catch (error: any) {
      console.error("Error scheduling post:", error);
      toast.error(error.message);
    } finally {
      setIsScheduling(false);
    }
  };

  const handleDeletePost = async () => {
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.from("blog_posts").delete().eq("id", selectedPost?.id);

      if (error) throw error;
      loadPosts();
      handleClose();
      toast.success("Post deleted successfully!");
    } catch (error: any) {
      console.error("Error deleting post:", error);
      toast.error(error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateCategory = async () => {
    setIsSaving(true);
    try {
      const { data, error } = await supabase.from("blog_categories").insert([
        {
          name: categoryForm.name,
          slug: categoryForm.slug,
          description: categoryForm.description,
        },
      ]);

      if (error) throw error;
      loadCategories();
      handleClose();
      toast.success("Category created successfully!");
    } catch (error: any) {
      console.error("Error creating category:", error);
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateTag = async () => {
    setIsSaving(true);
    try {
      const { data, error } = await supabase.from("blog_tags").insert([
        {
          name: tagForm.name,
          slug: tagForm.slug,
        },
      ]);

      if (error) throw error;
      loadTags();
      handleClose();
      toast.success("Tag created successfully!");
    } catch (error: any) {
      console.error("Error creating tag:", error);
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const styles = {
    draft: {
      variant: "outline",
      className: "bg-gray-100 text-gray-500 border-gray-300",
      label: "Draft",
    },
    scheduled: {
      variant: "default",
      className: "bg-blue-100 text-blue-500",
      label: "Scheduled",
    },
    published: {
      variant: "ghost",
      className: "bg-green-100 text-green-500",
      label: "Published",
    },
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Blog CMS</h2>
        <p className="text-muted-foreground">
          Create, manage, and publish blog content with AI assistance
        </p>
      </div>

      {/* Content from BlogCMSManager-OLD.tsx.bak will be restored here */}
      <div className="p-8 text-center">
        <p className="text-muted-foreground">
          Blog CMS functionality has been restored. The component needs to be fully implemented.
        </p>
      </div>
    </div>
  );
}
