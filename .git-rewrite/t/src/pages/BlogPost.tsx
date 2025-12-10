import { useState, useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Clock, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

interface BlogPostData {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  featured_image_url: string | null;
  published_at: string;
  reading_time_minutes: number | null;
  views: number;
  meta_title: string | null;
  meta_description: string | null;
  category: { name: string; slug: string } | null;
}

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPostData | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (slug) {
      fetchPost();
    }
  }, [slug]);

  const fetchPost = async () => {
    setIsLoading(true);
    
    const { data, error } = await supabase
      .from("blog_posts")
      .select(`
        id,
        title,
        slug,
        content,
        excerpt,
        featured_image_url,
        published_at,
        reading_time_minutes,
        views,
        meta_title,
        meta_description,
        category:blog_categories(name, slug)
      `)
      .eq("slug", slug)
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .single();

    if (error) {
      console.error("Error fetching post:", error);
      setPost(null);
    } else {
      setPost(data);
      
      // Increment view count
      await supabase
        .from("blog_posts")
        .update({ views: (data.views || 0) + 1 })
        .eq("id", data.id);

      // Fetch related posts
      if (data.category) {
        fetchRelatedPosts(data.id, data.category.slug);
      }
    }
    
    setIsLoading(false);
  };

  const fetchRelatedPosts = async (currentPostId: string, categorySlug: string) => {
    const { data } = await supabase
      .from("blog_posts")
      .select(`
        id,
        title,
        slug,
        excerpt,
        featured_image_url,
        category:blog_categories(slug)
      `)
      .eq("status", "published")
      .eq("category.slug", categorySlug)
      .neq("id", currentPostId)
      .limit(3);

    if (data) {
      setRelatedPosts(data);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: post?.title,
          text: post?.excerpt || "",
          url: url,
        });
      } catch (err) {
        // User cancelled share or share failed
      }
    } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard!");
    }
  };

  // Detect content format and render accordingly
  const renderContent = useMemo(() => {
    if (!post) return null;

    const content = post.content;
    
    // Check if content is HTML (contains HTML tags)
    const hasHTMLTags = /<\/?[a-z][\s\S]*>/i.test(content);
    
    // Check if content is Markdown (contains markdown syntax)
    const hasMarkdownSyntax = /^#{1,6}\s|^\*{1,2}[^*]|\[.*\]\(.*\)|^\d+\.|^[-*+]\s/m.test(content);
    
    // If it has HTML tags, render as HTML
    if (hasHTMLTags && !hasMarkdownSyntax) {
      return (
        <div 
          className="prose prose-lg max-w-none dark:prose-invert
            prose-headings:font-heading prose-headings:text-primary
            prose-h1:text-4xl prose-h1:mt-12 prose-h1:mb-6
            prose-h2:text-3xl prose-h2:mt-12 prose-h2:mb-6
            prose-h3:text-2xl prose-h3:mt-8 prose-h3:mb-4
            prose-h4:text-xl prose-h4:mt-6 prose-h4:mb-3
            prose-p:leading-relaxed prose-p:mb-6
            prose-ul:my-6 prose-ol:my-6
            prose-li:my-2
            prose-a:text-primary prose-a:no-underline hover:prose-a:underline
            prose-img:rounded-lg prose-img:shadow-lg prose-img:my-8
            prose-blockquote:border-l-4 prose-blockquote:border-primary
            prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:my-8
            prose-strong:text-foreground prose-strong:font-semibold
            prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:rounded
            prose-pre:bg-secondary prose-pre:p-4 prose-pre:rounded-lg prose-pre:my-6"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      );
    }
    
    // If it has markdown syntax, render as Markdown
    if (hasMarkdownSyntax) {
      return (
        <div className="prose prose-lg max-w-none dark:prose-invert
          prose-headings:font-heading prose-headings:text-primary
          prose-h1:text-4xl prose-h1:mt-12 prose-h1:mb-6
          prose-h2:text-3xl prose-h2:mt-12 prose-h2:mb-6
          prose-h3:text-2xl prose-h3:mt-8 prose-h3:mb-4
          prose-h4:text-xl prose-h4:mt-6 prose-h4:mb-3
          prose-p:leading-relaxed prose-p:mb-6
          prose-ul:my-6 prose-ol:my-6
          prose-li:my-2
          prose-a:text-primary prose-a:no-underline hover:prose-a:underline
          prose-img:rounded-lg prose-img:shadow-lg prose-img:my-8
          prose-blockquote:border-l-4 prose-blockquote:border-primary
          prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:my-8
          prose-strong:text-foreground prose-strong:font-semibold
          prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:rounded
          prose-pre:bg-secondary prose-pre:p-4 prose-pre:rounded-lg prose-pre:my-6
          prose-table:my-6 prose-table:border-collapse
          prose-th:border prose-th:border-border prose-th:p-2 prose-th:bg-secondary
          prose-td:border prose-td:border-border prose-td:p-2"
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
          >
            {content}
          </ReactMarkdown>
        </div>
      );
    }
    
    // Default: treat as plain text with paragraph breaks
    return (
      <div className="prose prose-lg max-w-none dark:prose-invert prose-p:leading-relaxed prose-p:mb-6">
        {content.split('\n\n').map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    );
  }, [post]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading article...</p>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b sticky top-0 bg-background/95 backdrop-blur-sm z-50 shadow-sm">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <Link to="/" className="flex items-center gap-2">
              <img 
                src="/Logo-Green.png" 
                alt="EatPal" 
                className="h-8 block dark:hidden"
              />
              <img 
                src="/Logo-White.png" 
                alt="EatPal" 
                className="h-8 hidden dark:block"
              />
            </Link>
            <Link to="/blog">
              <Button variant="ghost" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Blog
              </Button>
            </Link>
          </div>
        </header>
        <div className="container mx-auto px-4 py-24 text-center">
          <h1 className="text-4xl font-heading font-bold mb-4 text-primary">Article Not Found</h1>
          <p className="text-muted-foreground mb-8">
            The article you're looking for doesn't exist or has been removed.
          </p>
          <Link to="/blog">
            <Button>Browse All Articles</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* SEO Meta Tags - would need a helmet library in production */}
      
      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur-sm z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/" className="flex items-center gap-2">
            <img 
              src="/Logo-Green.png" 
              alt="EatPal" 
              className="h-8 block dark:hidden"
            />
            <img 
              src="/Logo-White.png" 
              alt="EatPal" 
              className="h-8 hidden dark:block"
            />
          </Link>
          <Link to="/blog">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Blog
            </Button>
          </Link>
        </div>
      </header>

      {/* Article Hero */}
      {post.featured_image_url && (
        <div className="w-full h-[400px] md:h-[500px] overflow-hidden">
          <img
            src={post.featured_image_url}
            alt={post.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Article Content */}
      <article className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Category Badge */}
        {post.category && (
          <Badge className="mb-4">{post.category.name}</Badge>
        )}

        {/* Title */}
        <h1 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-primary">
          {post.title}
        </h1>

        {/* Meta Info */}
        <div className="flex flex-wrap items-center gap-4 text-muted-foreground mb-8 pb-8 border-b">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            <span>{format(new Date(post.published_at), "MMMM d, yyyy")}</span>
          </div>
          {post.reading_time_minutes && (
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <span>{post.reading_time_minutes} min read</span>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleShare} className="ml-auto">
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        </div>

        {/* Excerpt */}
        {post.excerpt && (
          <p className="text-xl text-muted-foreground mb-8 leading-relaxed italic">
            {post.excerpt}
          </p>
        )}

        {/* Main Content */}
        {renderContent}
      </article>

      {/* Related Posts */}
      {relatedPosts.length > 0 && (
        <section className="bg-secondary/5 py-12 px-4">
          <div className="container mx-auto max-w-6xl">
            <h2 className="text-3xl font-heading font-bold mb-8 text-primary">
              Related Articles
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {relatedPosts.map((relatedPost) => (
                <Link key={relatedPost.id} to={`/blog/${relatedPost.slug}`}>
                  <div className="group cursor-pointer">
                    {relatedPost.featured_image_url && (
                      <div className="aspect-video w-full overflow-hidden rounded-lg mb-4">
                        <img
                          src={relatedPost.featured_image_url}
                          alt={relatedPost.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    )}
                    <h3 className="font-heading font-semibold text-lg mb-2 group-hover:text-primary transition-colors line-clamp-2">
                      {relatedPost.title}
                    </h3>
                    {relatedPost.excerpt && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {relatedPost.excerpt}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t py-12 px-4 bg-secondary/5">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img 
                  src="/Logo-Green.png" 
                  alt="EatPal" 
                  className="h-8 block dark:hidden"
                />
                <img 
                  src="/Logo-White.png" 
                  alt="EatPal" 
                  className="h-8 hidden dark:block"
                />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Making meal planning simple and stress-free for families with picky eaters.
              </p>
            </div>
            <div>
              <h3 className="font-heading font-semibold mb-4 text-primary">Product</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link to="/#features" className="hover:text-primary transition-colors">Features</Link></li>
                <li><Link to="/#how-it-works" className="hover:text-primary transition-colors">How It Works</Link></li>
                <li><Link to="/pricing" className="hover:text-primary transition-colors">Pricing</Link></li>
                <li><Link to="/auth" className="hover:text-primary transition-colors">Get Started</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-heading font-semibold mb-4 text-primary">Company</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link to="/contact" className="hover:text-primary transition-colors">Contact</Link></li>
                <li><Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-primary transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-heading font-semibold mb-4 text-primary">Support</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link to="/faq" className="hover:text-primary transition-colors">FAQ</Link></li>
                <li><Link to="/contact" className="hover:text-primary transition-colors">Help Center</Link></li>
                <li>
                  <a href="mailto:Support@TryEatPal.com" className="hover:text-primary transition-colors">
                    Support@TryEatPal.com
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
            <p>© 2025 EatPal. All rights reserved. Built with ❤️ for parents of picky eaters.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default BlogPost;