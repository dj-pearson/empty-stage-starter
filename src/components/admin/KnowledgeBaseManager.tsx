import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Book,
  Plus,
  MoreVertical,
  Search,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Edit,
  Trash2,
  FolderOpen,
  FileText,
  MessageCircle,
  HelpCircle,
  Globe,
  Lock,
  Star,
  Copy,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { logger } from "@/lib/logger";

// Types
interface KBCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  order: number;
  is_public: boolean;
  article_count?: number;
  created_at: string;
}

interface KBArticle {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  category_id: string;
  category_name?: string;
  status: "draft" | "published" | "archived";
  is_featured: boolean;
  tags: string[];
  views: number;
  helpful_votes: number;
  not_helpful_votes: number;
  author_id: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category_id: string | null;
  order: number;
  is_public: boolean;
  views: number;
  created_at: string;
}

// Constants
const CATEGORY_ICONS = [
  { value: "book", label: "Book", icon: Book },
  { value: "help", label: "Help Circle", icon: HelpCircle },
  { value: "message", label: "Message", icon: MessageCircle },
  { value: "file", label: "File", icon: FileText },
  { value: "folder", label: "Folder", icon: FolderOpen },
  { value: "star", label: "Star", icon: Star },
];

export function KnowledgeBaseManager() {
  const [categories, setCategories] = useState<KBCategory[]>([]);
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Dialog states
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showArticleDialog, setShowArticleDialog] = useState(false);
  const [showFAQDialog, setShowFAQDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);

  // Edit states
  const [editingCategory, setEditingCategory] = useState<KBCategory | null>(null);
  const [editingArticle, setEditingArticle] = useState<KBArticle | null>(null);
  const [editingFAQ, setEditingFAQ] = useState<FAQ | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string } | null>(null);
  const [previewArticle, setPreviewArticle] = useState<KBArticle | null>(null);

  // Form states
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
    icon: "book",
    is_public: true,
  });

  const [articleForm, setArticleForm] = useState({
    title: "",
    content: "",
    excerpt: "",
    category_id: "",
    status: "draft" as "draft" | "published" | "archived",
    is_featured: false,
    tags: [] as string[],
  });

  const [faqForm, setFaqForm] = useState({
    question: "",
    answer: "",
    category_id: "",
    is_public: true,
  });

  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadCategories(), loadArticles(), loadFAQs()]);
    } catch (error) {
      logger.error("Error loading knowledge base data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("kb_categories")
        .select("*")
        .order("order", { ascending: true });

      if (error) {
        // Fallback to local storage
        const stored = localStorage.getItem("kb_categories");
        if (stored) setCategories(JSON.parse(stored));
        return;
      }

      setCategories(data || []);
    } catch (error) {
      logger.error("Error loading categories:", error);
    }
  };

  const loadArticles = async () => {
    try {
      const { data, error } = await supabase
        .from("kb_articles")
        .select(`
          *,
          category:kb_categories(name)
        `)
        .order("updated_at", { ascending: false });

      if (error) {
        // Fallback to local storage
        const stored = localStorage.getItem("kb_articles");
        if (stored) setArticles(JSON.parse(stored));
        return;
      }

      const formatted = data?.map((article) => ({
        ...article,
        category_name: (article.category as any)?.name || null,
      })) || [];

      setArticles(formatted);
    } catch (error) {
      logger.error("Error loading articles:", error);
    }
  };

  const loadFAQs = async () => {
    try {
      const { data, error } = await supabase
        .from("kb_faqs")
        .select("*")
        .order("order", { ascending: true });

      if (error) {
        // Fallback to local storage
        const stored = localStorage.getItem("kb_faqs");
        if (stored) setFaqs(JSON.parse(stored));
        return;
      }

      setFaqs(data || []);
    } catch (error) {
      logger.error("Error loading FAQs:", error);
    }
  };

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  const saveCategory = async () => {
    try {
      const category: Partial<KBCategory> = {
        id: editingCategory?.id || crypto.randomUUID(),
        name: categoryForm.name,
        slug: generateSlug(categoryForm.name),
        description: categoryForm.description || null,
        icon: categoryForm.icon,
        is_public: categoryForm.is_public,
        order: editingCategory?.order || categories.length,
      };

      const { error } = await supabase.from("kb_categories").upsert([category]);

      if (error) {
        // Fallback to local storage
        const existing = categories.filter((c) => c.id !== category.id);
        const newCategories = [...existing, { ...category, created_at: new Date().toISOString() } as KBCategory];
        localStorage.setItem("kb_categories", JSON.stringify(newCategories));
        setCategories(newCategories);
      } else {
        await loadCategories();
      }

      toast.success(editingCategory ? "Category updated" : "Category created");
      setShowCategoryDialog(false);
      resetCategoryForm();
    } catch (error) {
      logger.error("Error saving category:", error);
      toast.error("Failed to save category");
    }
  };

  const saveArticle = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const article: Partial<KBArticle> = {
        id: editingArticle?.id || crypto.randomUUID(),
        title: articleForm.title,
        slug: generateSlug(articleForm.title),
        content: articleForm.content,
        excerpt: articleForm.excerpt || null,
        category_id: articleForm.category_id,
        status: articleForm.status,
        is_featured: articleForm.is_featured,
        tags: articleForm.tags,
        author_id: user?.id || null,
        updated_at: new Date().toISOString(),
        published_at: articleForm.status === "published" && !editingArticle?.published_at
          ? new Date().toISOString()
          : editingArticle?.published_at || null,
      };

      const { error } = await supabase.from("kb_articles").upsert([article]);

      if (error) {
        // Fallback to local storage
        const existing = articles.filter((a) => a.id !== article.id);
        const newArticles = [
          ...existing,
          {
            ...article,
            views: editingArticle?.views || 0,
            helpful_votes: editingArticle?.helpful_votes || 0,
            not_helpful_votes: editingArticle?.not_helpful_votes || 0,
            created_at: editingArticle?.created_at || new Date().toISOString(),
          } as KBArticle,
        ];
        localStorage.setItem("kb_articles", JSON.stringify(newArticles));
        setArticles(newArticles);
      } else {
        await loadArticles();
      }

      toast.success(editingArticle ? "Article updated" : "Article created");
      setShowArticleDialog(false);
      resetArticleForm();
    } catch (error) {
      logger.error("Error saving article:", error);
      toast.error("Failed to save article");
    }
  };

  const saveFAQ = async () => {
    try {
      const faq: Partial<FAQ> = {
        id: editingFAQ?.id || crypto.randomUUID(),
        question: faqForm.question,
        answer: faqForm.answer,
        category_id: faqForm.category_id || null,
        is_public: faqForm.is_public,
        order: editingFAQ?.order || faqs.length,
      };

      const { error } = await supabase.from("kb_faqs").upsert([faq]);

      if (error) {
        // Fallback to local storage
        const existing = faqs.filter((f) => f.id !== faq.id);
        const newFaqs = [
          ...existing,
          {
            ...faq,
            views: editingFAQ?.views || 0,
            created_at: editingFAQ?.created_at || new Date().toISOString(),
          } as FAQ,
        ];
        localStorage.setItem("kb_faqs", JSON.stringify(newFaqs));
        setFaqs(newFaqs);
      } else {
        await loadFAQs();
      }

      toast.success(editingFAQ ? "FAQ updated" : "FAQ created");
      setShowFAQDialog(false);
      resetFAQForm();
    } catch (error) {
      logger.error("Error saving FAQ:", error);
      toast.error("Failed to save FAQ");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      let tableName = "";
      let items: any[] = [];
      let setItems: (items: any[]) => void = () => {};
      let storageKey = "";

      if (deleteTarget.type === "category") {
        tableName = "kb_categories";
        items = categories;
        setItems = setCategories;
        storageKey = "kb_categories";
      } else if (deleteTarget.type === "article") {
        tableName = "kb_articles";
        items = articles;
        setItems = setArticles;
        storageKey = "kb_articles";
      } else if (deleteTarget.type === "faq") {
        tableName = "kb_faqs";
        items = faqs;
        setItems = setFaqs;
        storageKey = "kb_faqs";
      }

      const { error } = await supabase.from(tableName).delete().eq("id", deleteTarget.id);

      if (error) {
        // Fallback to local storage
        const newItems = items.filter((i) => i.id !== deleteTarget.id);
        localStorage.setItem(storageKey, JSON.stringify(newItems));
        setItems(newItems);
      } else {
        await loadData();
      }

      toast.success("Deleted successfully");
      setShowDeleteDialog(false);
      setDeleteTarget(null);
    } catch (error) {
      logger.error("Error deleting:", error);
      toast.error("Failed to delete");
    }
  };

  const handlePublish = async (article: KBArticle) => {
    try {
      const updated = {
        ...article,
        status: "published" as const,
        published_at: article.published_at || new Date().toISOString(),
      };

      const { error } = await supabase
        .from("kb_articles")
        .update({ status: "published", published_at: updated.published_at })
        .eq("id", article.id);

      if (error) {
        // Fallback to local storage
        const newArticles = articles.map((a) => (a.id === article.id ? updated : a));
        localStorage.setItem("kb_articles", JSON.stringify(newArticles));
        setArticles(newArticles);
      } else {
        await loadArticles();
      }

      toast.success("Article published");
    } catch (error) {
      logger.error("Error publishing:", error);
    }
  };

  const handleUnpublish = async (article: KBArticle) => {
    try {
      const { error } = await supabase
        .from("kb_articles")
        .update({ status: "draft" })
        .eq("id", article.id);

      if (error) {
        // Fallback to local storage
        const newArticles = articles.map((a) =>
          a.id === article.id ? { ...a, status: "draft" as const } : a
        );
        localStorage.setItem("kb_articles", JSON.stringify(newArticles));
        setArticles(newArticles);
      } else {
        await loadArticles();
      }

      toast.success("Article unpublished");
    } catch (error) {
      logger.error("Error unpublishing:", error);
    }
  };

  const handleDuplicate = async (article: KBArticle) => {
    const duplicate: KBArticle = {
      ...article,
      id: crypto.randomUUID(),
      title: `${article.title} (Copy)`,
      slug: generateSlug(`${article.title}-copy`),
      status: "draft",
      views: 0,
      helpful_votes: 0,
      not_helpful_votes: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: null,
    };

    try {
      const { error } = await supabase.from("kb_articles").insert([duplicate]);

      if (error) {
        // Fallback to local storage
        localStorage.setItem("kb_articles", JSON.stringify([duplicate, ...articles]));
        setArticles([duplicate, ...articles]);
      } else {
        await loadArticles();
      }

      toast.success("Article duplicated");
    } catch (error) {
      logger.error("Error duplicating:", error);
    }
  };

  const openEditCategory = (category: KBCategory) => {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      description: category.description || "",
      icon: category.icon,
      is_public: category.is_public,
    });
    setShowCategoryDialog(true);
  };

  const openEditArticle = (article: KBArticle) => {
    setEditingArticle(article);
    setArticleForm({
      title: article.title,
      content: article.content,
      excerpt: article.excerpt || "",
      category_id: article.category_id,
      status: article.status,
      is_featured: article.is_featured,
      tags: article.tags || [],
    });
    setShowArticleDialog(true);
  };

  const openEditFAQ = (faq: FAQ) => {
    setEditingFAQ(faq);
    setFaqForm({
      question: faq.question,
      answer: faq.answer,
      category_id: faq.category_id || "",
      is_public: faq.is_public,
    });
    setShowFAQDialog(true);
  };

  const resetCategoryForm = () => {
    setEditingCategory(null);
    setCategoryForm({ name: "", description: "", icon: "book", is_public: true });
  };

  const resetArticleForm = () => {
    setEditingArticle(null);
    setArticleForm({
      title: "",
      content: "",
      excerpt: "",
      category_id: "",
      status: "draft",
      is_featured: false,
      tags: [],
    });
    setTagInput("");
  };

  const resetFAQForm = () => {
    setEditingFAQ(null);
    setFaqForm({ question: "", answer: "", category_id: "", is_public: true });
  };

  const addTag = () => {
    if (tagInput && !articleForm.tags.includes(tagInput)) {
      setArticleForm({
        ...articleForm,
        tags: [...articleForm.tags, tagInput.toLowerCase().trim()],
      });
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setArticleForm({
      ...articleForm,
      tags: articleForm.tags.filter((t) => t !== tag),
    });
  };

  const filteredArticles = articles.filter((article) => {
    const matchesSearch =
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" || article.category_id === selectedCategory;
    const matchesStatus = statusFilter === "all" || article.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const getStatusBadge = (status: KBArticle["status"]) => {
    switch (status) {
      case "published":
        return <Badge className="bg-safe-food">Published</Badge>;
      case "draft":
        return <Badge variant="secondary">Draft</Badge>;
      case "archived":
        return <Badge variant="outline">Archived</Badge>;
    }
  };

  const getCategoryIcon = (iconName: string) => {
    const iconConfig = CATEGORY_ICONS.find((i) => i.value === iconName);
    return iconConfig?.icon || Book;
  };

  const totalViews = articles.reduce((sum, a) => sum + a.views, 0);
  const totalHelpful = articles.reduce((sum, a) => sum + a.helpful_votes, 0);
  const publishedCount = articles.filter((a) => a.status === "published").length;

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Knowledge Base</h2>
          <p className="text-muted-foreground">
            Manage help articles, categories, and FAQs
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              resetCategoryForm();
              setShowCategoryDialog(true);
            }}
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            New Category
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              resetFAQForm();
              setShowFAQDialog(true);
            }}
          >
            <HelpCircle className="h-4 w-4 mr-2" />
            New FAQ
          </Button>
          <Button
            onClick={() => {
              resetArticleForm();
              setShowArticleDialog(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Article
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Articles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{articles.length}</p>
            <p className="text-xs text-muted-foreground">
              {publishedCount} published
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Total Views
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">{totalViews}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <ThumbsUp className="h-4 w-4" />
              Helpful Votes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-safe-food">{totalHelpful}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <HelpCircle className="h-4 w-4" />
              FAQs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-500">{faqs.length}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="articles" className="space-y-4">
        <TabsList>
          <TabsTrigger value="articles">Articles ({articles.length})</TabsTrigger>
          <TabsTrigger value="categories">Categories ({categories.length})</TabsTrigger>
          <TabsTrigger value="faqs">FAQs ({faqs.length})</TabsTrigger>
        </TabsList>

        {/* Articles Tab */}
        <TabsContent value="articles" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search articles..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {filteredArticles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No articles found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Views</TableHead>
                      <TableHead>Feedback</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredArticles.map((article) => (
                      <TableRow key={article.id}>
                        <TableCell>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{article.title}</p>
                              {article.is_featured && (
                                <Star className="h-3 w-3 text-amber-500" />
                              )}
                            </div>
                            {article.tags.length > 0 && (
                              <div className="flex gap-1 mt-1">
                                {article.tags.slice(0, 3).map((tag) => (
                                  <Badge key={tag} variant="outline" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                                {article.tags.length > 3 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{article.tags.length - 3}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{article.category_name || "—"}</TableCell>
                        <TableCell>{getStatusBadge(article.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {article.views}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="flex items-center gap-1 text-safe-food">
                              <ThumbsUp className="h-3 w-3" />
                              {article.helpful_votes}
                            </span>
                            <span className="flex items-center gap-1 text-destructive">
                              <ThumbsDown className="h-3 w-3" />
                              {article.not_helpful_votes}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(article.updated_at), {
                              addSuffix: true,
                            })}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setPreviewArticle(article);
                                  setShowPreviewDialog(true);
                                }}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                Preview
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditArticle(article)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicate(article)}>
                                <Copy className="h-4 w-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {article.status === "draft" ? (
                                <DropdownMenuItem onClick={() => handlePublish(article)}>
                                  <Globe className="h-4 w-4 mr-2" />
                                  Publish
                                </DropdownMenuItem>
                              ) : article.status === "published" ? (
                                <DropdownMenuItem onClick={() => handleUnpublish(article)}>
                                  <Lock className="h-4 w-4 mr-2" />
                                  Unpublish
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  setDeleteTarget({ type: "article", id: article.id });
                                  setShowDeleteDialog(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((category) => {
              const Icon = getCategoryIcon(category.icon);
              const articleCount = articles.filter(
                (a) => a.category_id === category.id
              ).length;

              return (
                <Card key={category.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            {category.name}
                            {!category.is_public && <Lock className="h-3 w-3" />}
                          </CardTitle>
                          <CardDescription>{articleCount} articles</CardDescription>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditCategory(category)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              setDeleteTarget({ type: "category", id: category.id });
                              setShowDeleteDialog(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  {category.description && (
                    <CardContent className="pt-0">
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {category.description}
                      </p>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* FAQs Tab */}
        <TabsContent value="faqs" className="space-y-4">
          <Card>
            <CardContent className="divide-y">
              {faqs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <HelpCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No FAQs yet</p>
                </div>
              ) : (
                faqs.map((faq) => (
                  <div key={faq.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{faq.question}</p>
                          {!faq.is_public && <Lock className="h-3 w-3" />}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {faq.answer}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {faq.views} views
                          </span>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditFAQ(faq)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              setDeleteTarget({ type: "faq", id: faq.id });
                              setShowDeleteDialog(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? "Edit Category" : "New Category"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={categoryForm.name}
                onChange={(e) =>
                  setCategoryForm({ ...categoryForm, name: e.target.value })
                }
                placeholder="Getting Started"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={categoryForm.description}
                onChange={(e) =>
                  setCategoryForm({ ...categoryForm, description: e.target.value })
                }
                placeholder="Help new users get started..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Icon</Label>
              <Select
                value={categoryForm.icon}
                onValueChange={(value) =>
                  setCategoryForm({ ...categoryForm, icon: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_ICONS.map((icon) => (
                    <SelectItem key={icon.value} value={icon.value}>
                      <div className="flex items-center gap-2">
                        <icon.icon className="h-4 w-4" />
                        {icon.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={categoryForm.is_public}
                onCheckedChange={(checked) =>
                  setCategoryForm({ ...categoryForm, is_public: checked })
                }
              />
              <Label>Public (visible to all users)</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCategoryDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveCategory} disabled={!categoryForm.name}>
              {editingCategory ? "Update" : "Create"} Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Article Dialog */}
      <Dialog open={showArticleDialog} onOpenChange={setShowArticleDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editingArticle ? "Edit Article" : "New Article"}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1">
            <div className="space-y-4 p-1">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  value={articleForm.title}
                  onChange={(e) =>
                    setArticleForm({ ...articleForm, title: e.target.value })
                  }
                  placeholder="How to get started with EatPal"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select
                    value={articleForm.category_id}
                    onValueChange={(value) =>
                      setArticleForm({ ...articleForm, category_id: value })
                    }
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
                  <Label>Status</Label>
                  <Select
                    value={articleForm.status}
                    onValueChange={(value: KBArticle["status"]) =>
                      setArticleForm({ ...articleForm, status: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Excerpt</Label>
                <Textarea
                  value={articleForm.excerpt}
                  onChange={(e) =>
                    setArticleForm({ ...articleForm, excerpt: e.target.value })
                  }
                  placeholder="Brief summary shown in search results..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Content * (Markdown supported)</Label>
                <Textarea
                  value={articleForm.content}
                  onChange={(e) =>
                    setArticleForm({ ...articleForm, content: e.target.value })
                  }
                  placeholder="# Introduction&#10;&#10;Write your article content here..."
                  rows={12}
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="Add tag..."
                    onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  />
                  <Button type="button" onClick={addTag} variant="outline">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {articleForm.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {articleForm.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1">
                        <Tag className="h-3 w-3" />
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="ml-1 hover:text-destructive"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={articleForm.is_featured}
                  onCheckedChange={(checked) =>
                    setArticleForm({ ...articleForm, is_featured: checked })
                  }
                />
                <Label>Featured article</Label>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowArticleDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveArticle}
              disabled={!articleForm.title || !articleForm.content || !articleForm.category_id}
            >
              {editingArticle ? "Update" : "Create"} Article
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FAQ Dialog */}
      <Dialog open={showFAQDialog} onOpenChange={setShowFAQDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFAQ ? "Edit FAQ" : "New FAQ"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Question *</Label>
              <Input
                value={faqForm.question}
                onChange={(e) =>
                  setFaqForm({ ...faqForm, question: e.target.value })
                }
                placeholder="How do I reset my password?"
              />
            </div>

            <div className="space-y-2">
              <Label>Answer *</Label>
              <Textarea
                value={faqForm.answer}
                onChange={(e) =>
                  setFaqForm({ ...faqForm, answer: e.target.value })
                }
                placeholder="To reset your password..."
                rows={5}
              />
            </div>

            <div className="space-y-2">
              <Label>Category (optional)</Label>
              <Select
                value={faqForm.category_id}
                onValueChange={(value) =>
                  setFaqForm({ ...faqForm, category_id: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No category</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={faqForm.is_public}
                onCheckedChange={(checked) =>
                  setFaqForm({ ...faqForm, is_public: checked })
                }
              />
              <Label>Public</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFAQDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveFAQ}
              disabled={!faqForm.question || !faqForm.answer}
            >
              {editingFAQ ? "Update" : "Create"} FAQ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewArticle?.title}</DialogTitle>
            <DialogDescription>
              {previewArticle?.category_name && (
                <Badge variant="outline" className="mr-2">
                  {previewArticle.category_name}
                </Badge>
              )}
              {previewArticle?.tags?.map((tag) => (
                <Badge key={tag} variant="secondary" className="mr-1">
                  {tag}
                </Badge>
              ))}
            </DialogDescription>
          </DialogHeader>
          <div className="prose max-w-none">
            {previewArticle?.content.split("\n").map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this{" "}
              {deleteTarget?.type}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
