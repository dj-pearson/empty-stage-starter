import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/**
 * US-553: tracked-keyword state, lifted out of SEOManager.
 *
 * Loads on mount, matching the mount effect it came from. The
 * characterisation tests in SEOManager.test.tsx pin that seo_keywords is still
 * queried exactly once when the panel opens.
 */
export interface KeywordData {
  keyword: string;
  position: number;
  volume: number;
  difficulty: number;
  url: string;
  trend: 'up' | 'down' | 'stable';
  impressions?: number;
  clicks?: number;
  ctr?: number;
}

export function useSeoKeywords() {
  const [trackedKeywords, setTrackedKeywords] = useState<KeywordData[]>([]);
  const [newKeyword, setNewKeyword] = useState('');

  const loadTrackedKeywords = async () => {
    try {
      const { data, error } = await supabase
        .from('seo_keywords')
        .select('*')
        .order('priority', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const keywords: KeywordData[] = data.map((kw) => ({
          keyword: kw.keyword,
          position: kw.current_position || 0,
          volume: kw.search_volume || 0,
          difficulty: kw.difficulty || 0,
          url: kw.target_url,
          trend: kw.position_trend as "up" | "down" | "stable",
          impressions: kw.impressions || undefined,
          clicks: kw.clicks || undefined,
          ctr: kw.ctr || undefined,
        }));
        setTrackedKeywords(keywords);
      } else {
        // No keywords tracked yet - show empty state
        // Users can add keywords via the "Add Keyword" form
        setTrackedKeywords([]);
      }
    } catch (error) {
      logger.error('Error loading keywords:', error);
      toast.error('Failed to load keyword data');
    }
  };

  const addKeywordToTrack = () => {
    if (!newKeyword.trim()) {
      toast.error("Please enter a keyword");
      return;
    }

    // In production, this would save to database
    const newKeywordData: KeywordData = {
      keyword: newKeyword,
      position: 0,
      volume: 0,
      difficulty: 0,
      url: "/",
      trend: "stable",
    };

    setTrackedKeywords([...trackedKeywords, newKeywordData]);
    setNewKeyword("");
    toast.success(`Added "${newKeyword}" to keyword tracking`);
  };

  useEffect(() => {
    void loadTrackedKeywords();
    // Mount-only, matching the effect this came from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { trackedKeywords, newKeyword, setNewKeyword, loadTrackedKeywords, addKeywordToTrack };
}
