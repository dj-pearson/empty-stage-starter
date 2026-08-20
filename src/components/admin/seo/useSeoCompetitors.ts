import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { logger } from '@/lib/logger';
import type { SEOScore } from '@/lib/seoScore';

/**
 * US-553: competitor analysis, lifted out of SEOManager.
 *
 * Loads on mount, matching the mount effect it came from.
 *
 * `getSeoScore` is a GETTER rather than a value on purpose. analyzeCompetitor
 * reads our own overall score to store a comparison, and it does so AFTER an
 * await on the analysis edge function. A captured value would be whatever the
 * score was when the handler was created, which is the same stale-closure bug
 * that left the GSC OAuth path dead. Reading through a getter takes the score
 * as it is when the write happens.
 */
export interface UseSeoCompetitorsOptions {
  getSeoScore: () => SEOScore;
}

export function useSeoCompetitors({ getSeoScore }: UseSeoCompetitorsOptions) {
  const [competitorUrl, setCompetitorUrl] = useState('');
  const [competitorResults, setCompetitorResults] = useState<Record<string, unknown>[]>([]);
  const [isAnalyzingCompetitor, setIsAnalyzingCompetitor] = useState(false);

  const loadCompetitorAnalysis = async () => {
    try {
      const { data, error } = await supabase
        .from('seo_competitor_analysis')
        .select('*')
        .eq('is_active', true)
        .order('analyzed_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (data && data.length > 0) {
        setCompetitorResults(data.map((comp) => ({
          url: comp.competitor_url,
          score: comp.overall_score,
          status: comp.status_code,
          analysis: comp.analysis,
          analyzedAt: comp.analyzed_at,
        })));
      }
    } catch (error) {
      logger.error('Error loading competitor analysis:', error);
    }
  };

  const analyzeCompetitor = async () => {
    if (!competitorUrl.trim()) {
      toast.error("Please enter a competitor URL");
      return;
    }

    setIsAnalyzingCompetitor(true);
    toast.info(`Analyzing competitor: ${competitorUrl}`);

    try {
      const { data, error } = await invokeEdgeFunction("seo-audit", {
        body: { url: competitorUrl },
      });

      if (error) throw error;

      // Save to database
      const userId = (await supabase.auth.getUser()).data.user?.id;

      const { error: insertError } = await supabase
        .from('seo_competitor_analysis')
        .insert({
          competitor_url: competitorUrl,
          overall_score: data.score,
          technical_score: data.analysis?.technical ? Math.round(data.analysis.technical.filter((i) => i.status === 'passed').length / data.analysis.technical.length * 100) : null,
          onpage_score: data.analysis?.onPage ? Math.round(data.analysis.onPage.filter((i) => i.status === 'passed').length / data.analysis.onPage.length * 100) : null,
          performance_score: data.analysis?.performance ? Math.round(data.analysis.performance.filter((i) => i.status === 'passed').length / data.analysis.performance.length * 100) : null,
          mobile_score: data.analysis?.mobile ? Math.round(data.analysis.mobile.filter((i) => i.status === 'passed').length / data.analysis.mobile.length * 100) : null,
          analysis: data.analysis,
          status_code: data.status,
          content_type: data.contentType,
          our_score: getSeoScore().overall,
          score_difference: data.score - getSeoScore().overall,
          analyzed_by_user_id: userId,
        });

      if (insertError) {
        logger.error('Error saving competitor analysis:', insertError);
      }

      // Reload competitor analysis
      await loadCompetitorAnalysis();

      toast.success("Competitor analysis complete and saved!");
    } catch (error: unknown) {
      logger.error("Competitor analysis error:", error);
      toast.error(`Failed to analyze competitor: ${error.message}`);
    } finally {
      setIsAnalyzingCompetitor(false);
    }
  };

  const removeCompetitor = async (url: string) => {
    try {
      // Mark as inactive in database
      await supabase
        .from('seo_competitor_analysis')
        .update({ is_active: false })
        .eq('competitor_url', url);

      setCompetitorResults(competitorResults.filter((c) => c.url !== url));
      toast.success("Competitor removed");
    } catch (error) {
      logger.error('Error removing competitor:', error);
      toast.error('Failed to remove competitor');
    }
  };

  useEffect(() => {
    void loadCompetitorAnalysis();
    // Mount-only, matching the effect this came from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    competitorUrl,
    setCompetitorUrl,
    competitorResults,
    isAnalyzingCompetitor,
    loadCompetitorAnalysis,
    analyzeCompetitor,
    removeCompetitor,
  };
}
