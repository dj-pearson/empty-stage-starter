import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Link2, ExternalLink, Search, TrendingUp, FileText, AlertCircle, CheckCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  category: { name: string; slug: string } | null;
}

interface LinkOpportunity {
  sourcePost: BlogPost;
  targetPost: BlogPost;
  matchedKeywords: string[];
  contextSnippet: string;
  relevanceScore: number;
}

const BlogInternalLinker = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [opportunities, setOpportunities] = useState<LinkOpportunity[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedOpportunities, setSelectedOpportunities] = useState<Set<number>>(new Set());
  const [isApproving, setIsApproving] = useState(false);
  const [stats, setStats] = useState({
    totalPosts: 0,
    postsAnalyzed: 0,
    opportunitiesFound: 0,
    avgLinksPerPost: 0,
  });

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    const { data, error } = await supabase
      .from("blog_posts")
      .select(`
        id,
        title,
        slug,
        content,
        excerpt,
        category:blog_categories(name, slug)
      `)
      .eq("status", "published")
      .order("published_at", { ascending: false });

    if (error) {
      console.error("Error fetching posts:", error);
      toast.error("Failed to load blog posts");
      return;
    }

    setPosts(data || []);
    setStats(prev => ({ ...prev, totalPosts: data?.length || 0 }));
  };

  const extractKeywords = (text: string): string[] => {
    // Remove HTML tags and convert to lowercase
    const cleanText = text.replace(/<[^>]*>/g, ' ').toLowerCase();
    
    // Common words to ignore
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how']);
    
    // Extract words (2+ characters)
    const words = cleanText.match(/\b[a-z]{2,}\b/g) || [];
    
    // Filter stop words and count frequencies
    const wordFreq = new Map<string, number>();
    words.forEach(word => {
      if (!stopWords.has(word)) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    });
    
    // Extract multi-word phrases (2-3 words)
    const phrases: string[] = [];
    const sentences = cleanText.split(/[.!?]+/);
    sentences.forEach(sentence => {
      const sentenceWords = sentence.trim().split(/\s+/);
      for (let i = 0; i < sentenceWords.length - 1; i++) {
        // 2-word phrases
        const phrase2 = `${sentenceWords[i]} ${sentenceWords[i + 1]}`.toLowerCase();
        if (phrase2.length > 5 && !stopWords.has(sentenceWords[i]) && !stopWords.has(sentenceWords[i + 1])) {
          phrases.push(phrase2);
        }
        
        // 3-word phrases
        if (i < sentenceWords.length - 2) {
          const phrase3 = `${sentenceWords[i]} ${sentenceWords[i + 1]} ${sentenceWords[i + 2]}`.toLowerCase();
          if (phrase3.length > 10) {
            phrases.push(phrase3);
          }
        }
      }
    });
    
    // Get top keywords by frequency
    const topWords = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
    
    return [...topWords, ...phrases.slice(0, 15)];
  };

  const findLinkOpportunities = async () => {
    if (posts.length < 2) {
      toast.error("Need at least 2 published posts to analyze");
      return;
    }

    setIsScanning(true);
    const foundOpportunities: LinkOpportunity[] = [];

    try {
      // Analyze each post
      for (let i = 0; i < posts.length; i++) {
        const sourcePost = posts[i];
        const sourceKeywords = extractKeywords(sourcePost.content + ' ' + sourcePost.title);

        // Compare with other posts
        for (let j = 0; j < posts.length; j++) {
          if (i === j) continue; // Skip self

          const targetPost = posts[j];
          const targetKeywords = extractKeywords(targetPost.title + ' ' + targetPost.excerpt);

          // Find matching keywords
          const matches = sourceKeywords.filter(kw => 
            targetKeywords.some(tk => tk.includes(kw) || kw.includes(tk))
          );

          if (matches.length > 0) {
            // Find context snippet where keyword appears
            const keyword = matches[0];
            const contentLower = sourcePost.content.toLowerCase();
            const keywordIndex = contentLower.indexOf(keyword.toLowerCase());
            
            let contextSnippet = '';
            if (keywordIndex !== -1) {
              const start = Math.max(0, keywordIndex - 50);
              const end = Math.min(sourcePost.content.length, keywordIndex + 100);
              contextSnippet = '...' + sourcePost.content.substring(start, end) + '...';
            } else {
              contextSnippet = sourcePost.excerpt || sourcePost.content.substring(0, 150);
            }

            // Calculate relevance score
            const categoryMatch = sourcePost.category?.slug === targetPost.category?.slug ? 0.3 : 0;
            const keywordScore = Math.min(matches.length * 0.15, 0.7);
            const relevanceScore = categoryMatch + keywordScore;

            if (relevanceScore > 0.3) {
              foundOpportunities.push({
                sourcePost,
                targetPost,
                matchedKeywords: matches.slice(0, 5),
                contextSnippet,
                relevanceScore,
              });
            }
          }
        }

        setStats(prev => ({ ...prev, postsAnalyzed: i + 1 }));
      }

      // Sort by relevance
      foundOpportunities.sort((a, b) => b.relevanceScore - a.relevanceScore);

      setOpportunities(foundOpportunities);
      setStats(prev => ({
        ...prev,
        opportunitiesFound: foundOpportunities.length,
        avgLinksPerPost: foundOpportunities.length / posts.length,
      }));

      toast.success(`Found ${foundOpportunities.length} internal linking opportunities!`);
    } catch (error) {
      console.error("Error scanning posts:", error);
      toast.error("Failed to scan posts for link opportunities");
    } finally {
      setIsScanning(false);
    }
  };

  const getRelevanceColor = (score: number) => {
    if (score >= 0.7) return "bg-green-500";
    if (score >= 0.5) return "bg-yellow-500";
    return "bg-orange-500";
  };

  const getRelevanceLabel = (score: number) => {
    if (score >= 0.7) return "High";
    if (score >= 0.5) return "Medium";
    return "Low";
  };

  const toggleOpportunity = (index: number) => {
    setSelectedOpportunities(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedOpportunities.size === opportunities.length) {
      setSelectedOpportunities(new Set());
    } else {
      setSelectedOpportunities(new Set(opportunities.map((_, i) => i)));
    }
  };

  const insertLinkIntoContent = (content: string, keyword: string, targetSlug: string, targetTitle: string): string => {
    console.log("Attempting to insert link for keyword:", keyword);
    
    // Clean keyword for better matching
    const cleanKeyword = keyword.trim();
    
    // Try to find the keyword in plain text (handles both HTML and Markdown)
    // Look for the keyword not already inside an <a> tag or [link]() syntax
    const notInLinkRegex = new RegExp(
      `(?<!<a[^>]*>)(?<!\\[)\\b(${cleanKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b(?![^<]*</a>)(?!\\])`,
      'i'
    );
    
    const match = content.match(notInLinkRegex);
    
    if (!match) {
      console.log("No match found for keyword:", cleanKeyword);
      return content;
    }

    console.log("Match found:", match[0]);

    // Check if content is Markdown or HTML
    const isMarkdown = content.includes('##') || content.includes('**') || /\[.*\]\(.*\)/.test(content);
    
    let link: string;
    if (isMarkdown) {
      // Create Markdown link
      link = `[${match[0]}](/blog/${targetSlug} "${targetTitle}")`;
    } else {
      // Create HTML link
      link = `<a href="/blog/${targetSlug}" title="${targetTitle.replace(/"/g, '&quot;')}">${match[0]}</a>`;
    }
    
    // Replace only the first occurrence
    const updatedContent = content.replace(notInLinkRegex, link);
    console.log("Link inserted successfully");
    return updatedContent;
  };

  const approveOpportunities = async (indices: number[]) => {
    if (indices.length === 0) {
      toast.error("No opportunities selected");
      return;
    }

    console.log(`Starting approval for ${indices.length} opportunities`);
    setIsApproving(true);
    let successCount = 0;
    let errorCount = 0;
    let noMatchCount = 0;

    try {
      for (const index of indices) {
        const opp = opportunities[index];
        
        console.log(`Processing opportunity ${index + 1}/${indices.length}:`, {
          source: opp.sourcePost.title,
          target: opp.targetPost.title,
          keyword: opp.matchedKeywords[0]
        });
        
        try {
          // Fetch the current post content
          const { data: currentPost, error: fetchError } = await supabase
            .from("blog_posts")
            .select("content")
            .eq("id", opp.sourcePost.id)
            .single();

          if (fetchError) {
            console.error("Fetch error:", fetchError);
            throw fetchError;
          }

          console.log("Original content length:", currentPost.content.length);

          // Insert the link into the content
          const updatedContent = insertLinkIntoContent(
            currentPost.content,
            opp.matchedKeywords[0], // Use the first matched keyword
            opp.targetPost.slug,
            opp.targetPost.title
          );

          // Check if content actually changed
          if (updatedContent === currentPost.content) {
            console.warn("No changes made - keyword not found in content");
            noMatchCount++;
            continue;
          }

          console.log("Updated content length:", updatedContent.length);

          // Update the post
          const { error: updateError } = await supabase
            .from("blog_posts")
            .update({ content: updatedContent })
            .eq("id", opp.sourcePost.id);

          if (updateError) {
            console.error("Update error:", updateError);
            throw updateError;
          }

          console.log("Successfully updated post");
          successCount++;
        } catch (error) {
          console.error(`Error approving opportunity ${index}:`, error);
          errorCount++;
        }
      }

      console.log(`Approval complete: ${successCount} success, ${errorCount} errors, ${noMatchCount} no match`);

      // Remove approved opportunities from the list
      const remainingOpportunities = opportunities.filter((_, i) => !indices.includes(i));
      setOpportunities(remainingOpportunities);
      setSelectedOpportunities(new Set());
      
      setStats(prev => ({
        ...prev,
        opportunitiesFound: remainingOpportunities.length,
      }));

      if (successCount > 0) {
        toast.success(`Successfully added ${successCount} internal link${successCount > 1 ? 's' : ''}`);
      }
      if (noMatchCount > 0) {
        toast.warning(`${noMatchCount} link${noMatchCount > 1 ? 's' : ''} skipped - keyword not found in content`);
      }
      if (errorCount > 0) {
        toast.error(`Failed to add ${errorCount} link${errorCount > 1 ? 's' : ''}`);
      }

      // Refresh posts data
      await fetchPosts();
    } catch (error) {
      console.error("Error approving opportunities:", error);
      toast.error("Failed to approve opportunities");
    } finally {
      setIsApproving(false);
    }
  };

  const handleApproveSelected = () => {
    const indices = Array.from(selectedOpportunities);
    approveOpportunities(indices);
  };

  const handleApproveAll = () => {
    const indices = opportunities.map((_, i) => i);
    approveOpportunities(indices);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-heading font-bold mb-2">Smart Content Scanner</h2>
        <p className="text-muted-foreground">
          Analyze blog posts to discover internal linking opportunities and improve SEO.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Posts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPosts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Posts Analyzed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.postsAnalyzed}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Opportunities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.opportunitiesFound}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Links/Post</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgLinksPerPost.toFixed(1)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Scan Button */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Content Analysis
          </CardTitle>
          <CardDescription>
            Scan all published blog posts to find keyword matches and suggest internal links
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={findLinkOpportunities} 
            disabled={isScanning || posts.length < 2}
            className="w-full"
          >
            {isScanning ? (
              <>
                <Search className="h-4 w-4 mr-2 animate-spin" />
                Scanning {stats.postsAnalyzed} / {stats.totalPosts} posts...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Start Content Scan
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {opportunities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Link Opportunities ({opportunities.length})
            </CardTitle>
            <CardDescription>
              Recommended internal links to improve content connectivity and SEO
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Bulk Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6 p-4 bg-secondary/30 rounded-lg">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedOpportunities.size === opportunities.length && opportunities.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 cursor-pointer"
                />
                <span className="text-sm font-medium">
                  {selectedOpportunities.size} of {opportunities.length} selected
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleApproveSelected}
                  disabled={selectedOpportunities.size === 0 || isApproving}
                >
                  {isApproving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2" />
                      Approving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve Selected ({selectedOpportunities.size})
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={handleApproveAll}
                  disabled={opportunities.length === 0 || isApproving}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve All ({opportunities.length})
                </Button>
              </div>
            </div>
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all">
                  All ({opportunities.length})
                </TabsTrigger>
                <TabsTrigger value="high">
                  High Priority ({opportunities.filter(o => o.relevanceScore >= 0.7).length})
                </TabsTrigger>
                <TabsTrigger value="medium">
                  Medium ({opportunities.filter(o => o.relevanceScore >= 0.5 && o.relevanceScore < 0.7).length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="mt-6">
                <ScrollArea className="h-[600px] pr-4">
                  <div className="space-y-4">
                    {opportunities.map((opp, index) => (
                      <Card key={index} className="p-4">
                        <div className="flex items-start gap-3 mb-3">
                          <input
                            type="checkbox"
                            checked={selectedOpportunities.has(index)}
                            onChange={() => toggleOpportunity(index)}
                            className="w-4 h-4 mt-1 cursor-pointer"
                          />
                          <div className="flex items-start justify-between flex-1">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <h4 className="font-semibold text-sm line-clamp-1">
                                {opp.sourcePost.title}
                              </h4>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {opp.sourcePost.category?.name || 'Uncategorized'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={getRelevanceColor(opp.relevanceScore)}>
                              {getRelevanceLabel(opp.relevanceScore)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {Math.round(opp.relevanceScore * 100)}%
                            </span>
                          </div>
                          </div>
                        </div>

                        <Separator className="my-3" />

                        <div className="flex items-center gap-2 mb-3">
                          <Link2 className="h-4 w-4 text-primary" />
                          <span className="text-xs text-muted-foreground">Link to:</span>
                        </div>

                        <div className="bg-secondary/50 rounded-lg p-3 mb-3">
                          <div className="flex items-center gap-2 mb-2">
                            <ExternalLink className="h-4 w-4 text-primary" />
                            <h5 className="font-medium text-sm line-clamp-1">
                              {opp.targetPost.title}
                            </h5>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {opp.targetPost.excerpt}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
                            <div className="flex-1">
                              <p className="text-xs font-medium mb-1">Matched Keywords:</p>
                              <div className="flex flex-wrap gap-1">
                                {opp.matchedKeywords.map((kw, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">
                                    {kw}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="bg-muted/50 rounded p-2 text-xs italic text-muted-foreground">
                            {opp.contextSnippet}
                          </div>
                        </div>

                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(`/blog/${opp.sourcePost.slug}`, '_blank')}
                            className="flex-1"
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            View Source
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(`/blog/${opp.targetPost.slug}`, '_blank')}
                            className="flex-1"
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            View Target
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="high" className="mt-6">
                <ScrollArea className="h-[600px] pr-4">
                  <div className="space-y-4">
                    {opportunities
                      .map((opp, index) => ({ opp, originalIndex: index }))
                      .filter(({ opp }) => opp.relevanceScore >= 0.7)
                      .map(({ opp, originalIndex }) => (
                        <Card key={originalIndex} className="p-4">
                          <div className="flex items-start gap-3 mb-3">
                            <input
                              type="checkbox"
                              checked={selectedOpportunities.has(originalIndex)}
                              onChange={() => toggleOpportunity(originalIndex)}
                              className="w-4 h-4 mt-1 cursor-pointer"
                            />
                            <div className="flex items-start justify-between flex-1">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <h4 className="font-semibold text-sm line-clamp-1">
                                  {opp.sourcePost.title}
                                </h4>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {opp.sourcePost.category?.name || 'Uncategorized'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={getRelevanceColor(opp.relevanceScore)}>
                                {getRelevanceLabel(opp.relevanceScore)}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {Math.round(opp.relevanceScore * 100)}%
                              </span>
                            </div>
                            </div>
                          </div>
                          <Separator className="my-3" />
                          <div className="flex items-center gap-2 mb-3">
                            <Link2 className="h-4 w-4 text-primary" />
                            <span className="text-xs text-muted-foreground">Link to:</span>
                          </div>
                          <div className="bg-secondary/50 rounded-lg p-3 mb-3">
                            <div className="flex items-center gap-2 mb-2">
                              <ExternalLink className="h-4 w-4 text-primary" />
                              <h5 className="font-medium text-sm line-clamp-1">
                                {opp.targetPost.title}
                              </h5>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {opp.targetPost.excerpt}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
                              <div className="flex-1">
                                <p className="text-xs font-medium mb-1">Matched Keywords:</p>
                                <div className="flex flex-wrap gap-1">
                                  {opp.matchedKeywords.map((kw, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs">
                                      {kw}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="bg-muted/50 rounded p-2 text-xs italic text-muted-foreground">
                              {opp.contextSnippet}
                            </div>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(`/blog/${opp.sourcePost.slug}`, '_blank')}
                              className="flex-1"
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              View Source
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(`/blog/${opp.targetPost.slug}`, '_blank')}
                              className="flex-1"
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              View Target
                            </Button>
                          </div>
                        </Card>
                      ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="medium" className="mt-6">
                <ScrollArea className="h-[600px] pr-4">
                  <div className="space-y-4">
                    {opportunities
                      .map((opp, index) => ({ opp, originalIndex: index }))
                      .filter(({ opp }) => opp.relevanceScore >= 0.5 && opp.relevanceScore < 0.7)
                      .map(({ opp, originalIndex }) => (
                        <Card key={originalIndex} className="p-4">
                          <div className="flex items-start gap-3 mb-3">
                            <input
                              type="checkbox"
                              checked={selectedOpportunities.has(originalIndex)}
                              onChange={() => toggleOpportunity(originalIndex)}
                              className="w-4 h-4 mt-1 cursor-pointer"
                            />
                            <div className="flex items-start justify-between flex-1">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <h4 className="font-semibold text-sm line-clamp-1">
                                  {opp.sourcePost.title}
                                </h4>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {opp.sourcePost.category?.name || 'Uncategorized'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={getRelevanceColor(opp.relevanceScore)}>
                                {getRelevanceLabel(opp.relevanceScore)}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {Math.round(opp.relevanceScore * 100)}%
                              </span>
                            </div>
                            </div>
                          </div>
                          <Separator className="my-3" />
                          <div className="flex items-center gap-2 mb-3">
                            <Link2 className="h-4 w-4 text-primary" />
                            <span className="text-xs text-muted-foreground">Link to:</span>
                          </div>
                          <div className="bg-secondary/50 rounded-lg p-3 mb-3">
                            <div className="flex items-center gap-2 mb-2">
                              <ExternalLink className="h-4 w-4 text-primary" />
                              <h5 className="font-medium text-sm line-clamp-1">
                                {opp.targetPost.title}
                              </h5>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {opp.targetPost.excerpt}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
                              <div className="flex-1">
                                <p className="text-xs font-medium mb-1">Matched Keywords:</p>
                                <div className="flex flex-wrap gap-1">
                                  {opp.matchedKeywords.map((kw, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs">
                                      {kw}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="bg-muted/50 rounded p-2 text-xs italic text-muted-foreground">
                              {opp.contextSnippet}
                            </div>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(`/blog/${opp.sourcePost.slug}`, '_blank')}
                              className="flex-1"
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              View Source
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(`/blog/${opp.targetPost.slug}`, '_blank')}
                              className="flex-1"
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              View Target
                            </Button>
                          </div>
                        </Card>
                      ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BlogInternalLinker;
