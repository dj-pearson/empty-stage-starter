import { ReactNode } from "react";
import { SEOHead } from "@/components/SEOHead";
import { BreadcrumbSchema } from "@/components/schema";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar, Clock, User, RefreshCcw } from "lucide-react";

export interface BlogAuthor {
  name: string;
  credentials?: string;
  bio?: string;
  avatarUrl?: string;
  profileUrl?: string;
}

export interface BlogPostTemplateProps {
  // SEO Metadata
  title: string;
  description: string;
  slug: string;
  keywords?: string;
  featuredImage?: string;

  // Content
  content: ReactNode;
  excerpt?: string;

  // Author & Credibility (E-E-A-T)
  author: BlogAuthor;
  reviewedBy?: BlogAuthor;
  datePublished: string;
  dateModified?: string;
  readingTime?: string;

  // Categorization
  category?: string;
  tags?: string[];

  // Related Content
  relatedArticles?: Array<{
    title: string;
    url: string;
  }>;

  // Research & Citations
  sources?: Array<{
    title: string;
    url: string;
    type?: "research" | "article" | "book";
  }>;

  // Schema Data
  structuredData?: object;
}

/**
 * BlogPostTemplate - SEO-optimized blog post layout
 *
 * Implements all recommendations from the EatPal SEO Strategy:
 * - GEO optimization (ChatGPT, Perplexity, Claude citations)
 * - E-E-A-T signals (Expertise, Experience, Authoritativeness, Trustworthiness)
 * - Comprehensive schema markup
 * - Clear content structure for AI parsing
 * - Citation-worthy formatting
 * - Social sharing optimization
 */
export function BlogPostTemplate({
  title,
  description,
  slug,
  keywords,
  featuredImage = "https://tryeatpal.com/Cover.png",
  content,
  excerpt,
  author,
  reviewedBy,
  datePublished,
  dateModified,
  readingTime,
  category,
  tags = [],
  relatedArticles = [],
  sources = [],
  structuredData,
}: BlogPostTemplateProps) {
  const canonicalUrl = `https://tryeatpal.com/blog/${slug}`;
  const publishDate = new Date(datePublished);
  const modifiedDate = dateModified ? new Date(dateModified) : publishDate;

  // Generate Article schema with E-E-A-T signals
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": title,
    "description": description,
    "image": featuredImage,
    "datePublished": publishDate.toISOString(),
    "dateModified": modifiedDate.toISOString(),
    "author": {
      "@type": "Person",
      "name": author.name,
      ...(author.credentials && { "jobTitle": author.credentials }),
      ...(author.profileUrl && { "url": author.profileUrl }),
    },
    ...(reviewedBy && {
      "reviewedBy": {
        "@type": "Person",
        "name": reviewedBy.name,
        ...(reviewedBy.credentials && { "jobTitle": reviewedBy.credentials }),
      },
    }),
    "publisher": {
      "@type": "Organization",
      "@id": "https://tryeatpal.com/#organization",
      "name": "EatPal",
      "logo": {
        "@type": "ImageObject",
        "url": "https://tryeatpal.com/Logo-Green.png",
      },
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": canonicalUrl,
    },
    ...(category && { "articleSection": category }),
    ...(tags.length > 0 && { "keywords": tags.join(", ") }),
  };

  return (
    <>
      {/* SEO Head with GEO optimization */}
      <SEOHead
        title={title}
        description={description}
        keywords={keywords || tags.join(", ")}
        canonicalUrl={canonicalUrl}
        ogType="article"
        ogImage={featuredImage}
        aiPurpose={`This article about ${title} provides evidence-based information on food chaining, picky eating, and feeding therapy for parents and caregivers.`}
        aiAudience="Parents of picky eaters, families managing ARFID or selective eating, feeding therapists, pediatric dietitians"
        structuredData={structuredData || articleSchema}
      />

      {/* Breadcrumb Schema */}
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "https://tryeatpal.com/" },
          { name: "Blog", url: "https://tryeatpal.com/blog" },
          ...(category ? [{ name: category, url: `https://tryeatpal.com/blog?category=${category}` }] : []),
          { name: title, url: canonicalUrl },
        ]}
      />

      <article className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Article Header */}
        <header className="mb-8">
          {/* Category Badge */}
          {category && (
            <Badge variant="secondary" className="mb-4">
              {category}
            </Badge>
          )}

          {/* Title */}
          <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
            {title}
          </h1>

          {/* Excerpt/Description */}
          {excerpt && (
            <p className="text-xl text-muted-foreground mb-6 leading-relaxed">
              {excerpt}
            </p>
          )}

          {/* Meta Information */}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-6">
            {/* Author */}
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>
                By <strong>{author.name}</strong>
                {author.credentials && `, ${author.credentials}`}
              </span>
            </div>

            {/* Published Date */}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <time dateTime={publishDate.toISOString()}>
                {publishDate.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            </div>

            {/* Reading Time */}
            {readingTime && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>{readingTime}</span>
              </div>
            )}

            {/* Last Updated (if different from published) */}
            {dateModified && dateModified !== datePublished && (
              <div className="flex items-center gap-2">
                <RefreshCcw className="h-4 w-4" />
                <time dateTime={modifiedDate.toISOString()}>
                  Updated {modifiedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </time>
              </div>
            )}
          </div>

          {/* Featured Image */}
          {featuredImage && (
            <img
              src={featuredImage}
              alt={title}
              className="w-full rounded-lg shadow-lg mb-6"
            />
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </header>

        <Separator className="my-8" />

        {/* Article Content */}
        <div className="prose prose-lg dark:prose-invert max-w-none mb-12">
          {content}
        </div>

        <Separator className="my-8" />

        {/* Author Bio (E-E-A-T Signal) */}
        <section className="bg-muted/50 rounded-lg p-6 mb-8">
          <h3 className="text-xl font-bold mb-2">About the Author</h3>
          <div className="flex items-start gap-4">
            {author.avatarUrl && (
              <img
                src={author.avatarUrl}
                alt={author.name}
                className="w-16 h-16 rounded-full"
              />
            )}
            <div>
              <p className="font-semibold">
                {author.name}
                {author.credentials && `, ${author.credentials}`}
              </p>
              {author.bio && (
                <p className="text-sm text-muted-foreground mt-2">{author.bio}</p>
              )}
            </div>
          </div>
        </section>

        {/* Medical Review (E-E-A-T Signal) */}
        {reviewedBy && (
          <section className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-8">
            <p className="text-sm">
              <strong>Medically Reviewed by:</strong> {reviewedBy.name}
              {reviewedBy.credentials && `, ${reviewedBy.credentials}`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Last Review Date: {modifiedDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </section>
        )}

        {/* Sources & References (E-E-A-T Signal) */}
        {sources.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Sources & References</h2>
            <ol className="list-decimal list-inside space-y-2">
              {sources.map((source, index) => (
                <li key={index} className="text-sm">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {source.title}
                  </a>
                  {source.type && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      {source.type}
                    </Badge>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Related Articles */}
        {relatedArticles.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Related Articles</h2>
            <ul className="space-y-2">
              {relatedArticles.map((article, index) => (
                <li key={index}>
                  <a
                    href={article.url}
                    className="text-primary hover:underline"
                  >
                    {article.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* CTA */}
        <section className="bg-primary/10 rounded-lg p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">
            Ready to Try Food Chaining with Your Picky Eater?
          </h2>
          <p className="text-muted-foreground mb-6">
            Start your free trial today and get AI-powered meal plans based on
            evidence-based food chaining therapy.
          </p>
          <a
            href="https://tryeatpal.com/auth?tab=signup"
            className="inline-block bg-primary text-primary-foreground px-8 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
          >
            Start Free Trial
          </a>
        </section>
      </article>
    </>
  );
}
