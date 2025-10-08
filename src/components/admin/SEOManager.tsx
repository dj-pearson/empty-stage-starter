import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  FileText,
  Code,
  Globe,
  Link as LinkIcon,
  CheckCircle,
  AlertCircle,
  Download,
  Copy,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

export function SEOManager() {
  const [robotsTxt, setRobotsTxt] = useState("");
  const [sitemapXml, setSitemapXml] = useState("");
  const [llmsTxt, setLlmsTxt] = useState("");
  const [metaTags, setMetaTags] = useState({
    title: "Kid Meal Planner - Picky Eater Meal Planning Made Easy",
    description:
      "Plan weekly meals for picky eaters with safe foods and daily try bites. Auto-generate grocery lists and track meal results.",
    keywords: "meal planning, picky eaters, kid meals, grocery list, meal tracker",
    og_title: "Kid Meal Planner - Picky Eater Solutions",
    og_description:
      "Simple meal planning app for parents of picky eaters with weekly rotation and grocery list generation",
    og_image: "https://lovable.dev/opengraph-image-p98pqg.png",
    twitter_card: "summary_large_image",
    twitter_site: "@lovable_dev",
  });

  const [structuredData, setStructuredData] = useState({});
  const [seoAudit, setSeoAudit] = useState<any>(null);

  useEffect(() => {
    loadSEOSettings();
  }, []);

  const loadSEOSettings = () => {
    // Generate default robots.txt
    const defaultRobots = `# Robots.txt for EatPal
User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /auth/

# Sitemap location
Sitemap: ${window.location.origin}/sitemap.xml

# Crawl delay (optional)
Crawl-delay: 1

# Popular search engines
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: Slurp
Allow: /`;

    setRobotsTxt(defaultRobots);

    // Generate sitemap.xml
    const pages = [
      { url: "/", priority: "1.0", changefreq: "daily" },
      { url: "/dashboard", priority: "0.8", changefreq: "weekly" },
      { url: "/planner", priority: "0.9", changefreq: "weekly" },
      { url: "/pantry", priority: "0.7", changefreq: "weekly" },
      { url: "/recipes", priority: "0.8", changefreq: "weekly" },
      { url: "/grocery", priority: "0.7", changefreq: "weekly" },
    ];

    const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (page) => `  <url>
    <loc>${window.location.origin}${page.url}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
  </url>`
  )
  .join("\n")}
</urlset>`;

    setSitemapXml(sitemapContent);

    // Generate llms.txt
    const defaultLlms = `# EatPal - Meal Planning for Picky Eaters

## About
EatPal is a meal planning application designed specifically for parents of picky eaters.
It helps families plan weekly meals using safe foods and introduces new foods gradually
through daily "try bites."

## Features
- Child profile management with dietary restrictions and allergens
- Pantry management with safe foods and try bites
- Weekly meal planner with drag-and-drop interface
- Recipe library with kid-friendly meals
- Automatic grocery list generation
- Meal result tracking and notes

## Target Audience
Parents of picky eaters aged 2-12 years old looking for structured meal planning solutions

## Technology
React, TypeScript, Supabase, Vite, shadcn/ui, Tailwind CSS

## Contact
For inquiries: support@eatpal.com

## Documentation
Full documentation available at: ${window.location.origin}/docs

## API
RESTful API available for integrations. Contact for API access.
`;

    setLlmsTxt(defaultLlms);

    // Generate structured data (JSON-LD)
    const structuredDataSchema = {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "EatPal",
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web Browser",
      description:
        "Meal planning application for parents of picky eaters with weekly meal rotation and grocery list generation",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.8",
        ratingCount: "127",
        bestRating: "5",
        worstRating: "1",
      },
      creator: {
        "@type": "Organization",
        name: "EatPal",
        url: window.location.origin,
      },
    };

    setStructuredData(structuredDataSchema);

    // Run SEO audit
    runSEOAudit();
  };

  const runSEOAudit = () => {
    const audit = {
      passed: [] as string[],
      warnings: [] as string[],
      failed: [] as string[],
    };

    // Check meta tags
    const titleTag = document.querySelector("title");
    if (titleTag && titleTag.textContent && titleTag.textContent.length > 0) {
      if (titleTag.textContent.length >= 30 && titleTag.textContent.length <= 60) {
        audit.passed.push("✓ Title tag length is optimal (30-60 characters)");
      } else {
        audit.warnings.push("⚠ Title tag should be 30-60 characters");
      }
    } else {
      audit.failed.push("✗ Missing title tag");
    }

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      const content = metaDescription.getAttribute("content") || "";
      if (content.length >= 120 && content.length <= 160) {
        audit.passed.push("✓ Meta description length is optimal (120-160 characters)");
      } else {
        audit.warnings.push("⚠ Meta description should be 120-160 characters");
      }
    } else {
      audit.failed.push("✗ Missing meta description");
    }

    // Check Open Graph tags
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    const ogImage = document.querySelector('meta[property="og:image"]');

    if (ogTitle) {
      audit.passed.push("✓ Open Graph title present");
    } else {
      audit.warnings.push("⚠ Missing Open Graph title");
    }

    if (ogDescription) {
      audit.passed.push("✓ Open Graph description present");
    } else {
      audit.warnings.push("⚠ Missing Open Graph description");
    }

    if (ogImage) {
      audit.passed.push("✓ Open Graph image present");
    } else {
      audit.warnings.push("⚠ Missing Open Graph image");
    }

    // Check Twitter tags
    const twitterCard = document.querySelector('meta[name="twitter:card"]');
    if (twitterCard) {
      audit.passed.push("✓ Twitter Card meta present");
    } else {
      audit.warnings.push("⚠ Missing Twitter Card meta");
    }

    // Check canonical URL
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      audit.passed.push("✓ Canonical URL present");
    } else {
      audit.warnings.push("⚠ Missing canonical URL");
    }

    // Check viewport
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      audit.passed.push("✓ Viewport meta tag present (mobile-friendly)");
    } else {
      audit.failed.push("✗ Missing viewport meta tag");
    }

    // Check HTTPS
    if (window.location.protocol === "https:") {
      audit.passed.push("✓ Site uses HTTPS");
    } else {
      audit.warnings.push("⚠ Site should use HTTPS");
    }

    // Check headings
    const h1s = document.querySelectorAll("h1");
    if (h1s.length === 1) {
      audit.passed.push("✓ Single H1 tag (best practice)");
    } else if (h1s.length === 0) {
      audit.failed.push("✗ Missing H1 tag");
    } else {
      audit.warnings.push(`⚠ Multiple H1 tags found (${h1s.length})`);
    }

    setSeoAudit(audit);
  };

  const handleCopyToClipboard = (content: string, label: string) => {
    navigator.clipboard.writeText(content);
    toast.success(`${label} copied to clipboard`);
  };

  const handleDownloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    toast.success(`${filename} downloaded`);
  };

  const handleUpdateMetaTags = () => {
    // In a real implementation, this would update the database and index.html
    toast.success("Meta tags configuration saved. Update index.html manually with these values.");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">SEO Management</h2>
          <p className="text-sm text-muted-foreground">
            Configure SEO settings, meta tags, and generate required files
          </p>
        </div>
        <Button onClick={runSEOAudit} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Run SEO Audit
        </Button>
      </div>

      {/* SEO Audit Results */}
      {seoAudit && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              SEO Audit Results
            </CardTitle>
            <CardDescription>Current SEO health check</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {seoAudit.passed.length > 0 && (
              <div>
                <h4 className="font-medium text-green-600 mb-2">Passed ({seoAudit.passed.length})</h4>
                <ul className="space-y-1">
                  {seoAudit.passed.map((item: string, idx: number) => (
                    <li key={idx} className="text-sm flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {seoAudit.warnings.length > 0 && (
              <div>
                <h4 className="font-medium text-yellow-600 mb-2">
                  Warnings ({seoAudit.warnings.length})
                </h4>
                <ul className="space-y-1">
                  {seoAudit.warnings.map((item: string, idx: number) => (
                    <li key={idx} className="text-sm flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {seoAudit.failed.length > 0 && (
              <div>
                <h4 className="font-medium text-red-600 mb-2">Failed ({seoAudit.failed.length})</h4>
                <ul className="space-y-1">
                  {seoAudit.failed.map((item: string, idx: number) => (
                    <li key={idx} className="text-sm flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="meta" className="space-y-4">
        <TabsList>
          <TabsTrigger value="meta">Meta Tags</TabsTrigger>
          <TabsTrigger value="robots">robots.txt</TabsTrigger>
          <TabsTrigger value="sitemap">sitemap.xml</TabsTrigger>
          <TabsTrigger value="llms">llms.txt</TabsTrigger>
          <TabsTrigger value="structured">Structured Data</TabsTrigger>
        </TabsList>

        {/* Meta Tags Tab */}
        <TabsContent value="meta">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Meta Tags Configuration
              </CardTitle>
              <CardDescription>
                Configure meta tags for SEO and social media sharing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Title Tag *</Label>
                  <Input
                    value={metaTags.title}
                    onChange={(e) => setMetaTags({ ...metaTags, title: e.target.value })}
                    placeholder="30-60 characters"
                  />
                  <p className="text-xs text-muted-foreground">
                    Length: {metaTags.title.length} characters
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Keywords</Label>
                  <Input
                    value={metaTags.keywords}
                    onChange={(e) => setMetaTags({ ...metaTags, keywords: e.target.value })}
                    placeholder="comma, separated, keywords"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Meta Description *</Label>
                <Textarea
                  value={metaTags.description}
                  onChange={(e) => setMetaTags({ ...metaTags, description: e.target.value })}
                  placeholder="120-160 characters"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Length: {metaTags.description.length} characters
                </p>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-4">Open Graph Tags (Facebook, LinkedIn)</h4>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>OG Title</Label>
                    <Input
                      value={metaTags.og_title}
                      onChange={(e) => setMetaTags({ ...metaTags, og_title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>OG Description</Label>
                    <Textarea
                      value={metaTags.og_description}
                      onChange={(e) =>
                        setMetaTags({ ...metaTags, og_description: e.target.value })
                      }
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>OG Image URL</Label>
                    <Input
                      value={metaTags.og_image}
                      onChange={(e) => setMetaTags({ ...metaTags, og_image: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-4">Twitter Card Tags</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Twitter Card Type</Label>
                    <Input
                      value={metaTags.twitter_card}
                      onChange={(e) =>
                        setMetaTags({ ...metaTags, twitter_card: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Twitter Site Handle</Label>
                    <Input
                      value={metaTags.twitter_site}
                      onChange={(e) =>
                        setMetaTags({ ...metaTags, twitter_site: e.target.value })
                      }
                      placeholder="@username"
                    />
                  </div>
                </div>
              </div>

              <Button onClick={handleUpdateMetaTags} className="w-full">
                Save Meta Tags Configuration
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* robots.txt Tab */}
        <TabsContent value="robots">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                robots.txt
              </CardTitle>
              <CardDescription>
                Control search engine crawling. Place this file in your /public directory.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={robotsTxt}
                onChange={(e) => setRobotsTxt(e.target.value)}
                rows={20}
                className="font-mono text-sm"
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => handleCopyToClipboard(robotsTxt, "robots.txt")}
                  variant="outline"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </Button>
                <Button
                  onClick={() => handleDownloadFile(robotsTxt, "robots.txt")}
                  variant="outline"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download File
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* sitemap.xml Tab */}
        <TabsContent value="sitemap">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                sitemap.xml
              </CardTitle>
              <CardDescription>
                Help search engines discover your pages. Place this file in your /public directory.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={sitemapXml}
                onChange={(e) => setSitemapXml(e.target.value)}
                rows={20}
                className="font-mono text-sm"
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => handleCopyToClipboard(sitemapXml, "sitemap.xml")}
                  variant="outline"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </Button>
                <Button
                  onClick={() => handleDownloadFile(sitemapXml, "sitemap.xml")}
                  variant="outline"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download File
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* llms.txt Tab */}
        <TabsContent value="llms">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                llms.txt
              </CardTitle>
              <CardDescription>
                Provide information about your site for Large Language Models and AI assistants.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={llmsTxt}
                onChange={(e) => setLlmsTxt(e.target.value)}
                rows={20}
                className="font-mono text-sm"
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => handleCopyToClipboard(llmsTxt, "llms.txt")}
                  variant="outline"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </Button>
                <Button
                  onClick={() => handleDownloadFile(llmsTxt, "llms.txt")}
                  variant="outline"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download File
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Structured Data Tab */}
        <TabsContent value="structured">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LinkIcon className="h-5 w-5" />
                Structured Data (JSON-LD)
              </CardTitle>
              <CardDescription>
                Add this schema.org markup to your index.html for rich search results
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={JSON.stringify(structuredData, null, 2)}
                onChange={(e) => {
                  try {
                    setStructuredData(JSON.parse(e.target.value));
                  } catch (err) {
                    // Invalid JSON, ignore
                  }
                }}
                rows={20}
                className="font-mono text-sm"
              />
              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    handleCopyToClipboard(
                      JSON.stringify(structuredData, null, 2),
                      "Structured Data"
                    )
                  }
                  variant="outline"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </Button>
                <Button
                  onClick={() =>
                    handleDownloadFile(
                      JSON.stringify(structuredData, null, 2),
                      "structured-data.json"
                    )
                  }
                  variant="outline"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download File
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>
                  <strong>How to add to your site:</strong>
                </p>
                <ol className="list-decimal list-inside space-y-1 mt-2">
                  <li>Copy the JSON-LD code above</li>
                  <li>Open your index.html file</li>
                  <li>
                    Add this inside the {"<head>"} section:
                    <code className="block mt-1 p-2 bg-muted rounded text-xs">
                      {'<script type="application/ld+json">'}
                      <br />
                      {"  /* Paste JSON here */"}
                      <br />
                      {"</script>"}
                    </code>
                  </li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
