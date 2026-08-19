import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { logger } from '@/lib/logger';

/**
 * US-553: per-page scores and blog-post SEO analysis, lifted out of SEOManager.
 *
 * Loads page scores on mount, matching the effect it came from. The blog-post
 * analysis is on demand.
 */
export interface PageData {
  url: string;
  title: string;
  metaDescription: string;
  wordCount: number;
  issues: number;
  score: number;
}

export function useSeoPageAnalysis() {
  const [pageAnalysis, setPageAnalysis] = useState<PageData[]>([]);
  const [blogPostsAnalysisResults, setBlogPostsAnalysisResults] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [isAnalyzingBlogPosts, setIsAnalyzingBlogPosts] = useState(false);

  const loadPageAnalysis = async () => {
    try {
      const { data, error } = await supabase
        .from('seo_page_scores')
        .select('*')
        .order('overall_score', { ascending: false })
        .limit(20);

      if (error) throw error;

      if (data && data.length > 0) {
        const pages: PageData[] = data.map((page) => ({
          url: page.page_url,
          title: page.page_title || '',
          metaDescription: '',
          wordCount: page.word_count || 0,
          issues: page.issues_count || 0,
          score: page.overall_score,
        }));
        setPageAnalysis(pages);
      }
    } catch (error) {
      logger.error('Error loading page analysis:', error);
    }
  };

  const analyzeBlogPostsSEO = async () => {
    setIsAnalyzingBlogPosts(true);
    setBlogPostsAnalysisResults(null);

    try {
      const { data, error} = await invokeEdgeFunction("analyze-blog-posts-seo");

      if (error) throw error;

      setBlogPostsAnalysisResults({
        success: true,
        analyzed: data.analyzed || 0,
        message: data.analyzed > 0
          ? `Analyzed ${data.analyzed} blog posts successfully!`
          : "No published blog posts to analyze"
      });

      if (data.analyzed > 0) {
        await loadPageAnalysis();
      }
    } catch (error: unknown) {
      logger.error("Error analyzing blog posts:", error);
      setBlogPostsAnalysisResults({
        success: false,
        error: error.message || "Failed to analyze blog posts"
      });
    } finally {
      setIsAnalyzingBlogPosts(false);
    }
  };

  useEffect(() => {
    void loadPageAnalysis();
    // Mount-only, matching the effect this came from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    pageAnalysis,
    blogPostsAnalysisResults,
    isAnalyzingBlogPosts,
    loadPageAnalysis,
    analyzeBlogPostsSEO,
  };
}
