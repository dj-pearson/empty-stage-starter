import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { isGuideIndexable } from '@/lib/pseo/indexability';
import {
  findCannibalization,
  normalizePageUrl,
  type CannibalizationFinding,
  type PageQueryRow,
} from '@/lib/seo/cannibalization';

/**
 * US-651: queries several of our own URLs are competing for.
 *
 * Reads the last 28 days of gsc_page_performance and folds in the pSEO tier
 * gate, so a report line can say whether a competing guide is above or below
 * MAX_INDEXABLE_TIER -- that is the difference between "these two pages should
 * be one page" and "this guide's tier is wrong".
 */
const WINDOW_DAYS = 28;

export function useSeoCannibalization() {
  const [findings, setFindings] = useState<CannibalizationFinding[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadCannibalization = useCallback(async () => {
    setIsLoading(true);
    try {
      const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

      // Awaited one at a time rather than through Promise.all: passing two
      // PostgrestFilterBuilders to Promise.all makes supabase-js's generated
      // types blow the instantiation depth limit (TS2589). Two sequential reads
      // on an on-demand admin report is not a cost worth a type assertion.
      const perf = await supabase
        .from('gsc_page_performance')
        .select('page_url, date, top_queries')
        .gte('date', since);
      if (perf.error) throw perf.error;

      const guides = await supabase
        .from('pseo_pages')
        .select('slug, tier')
        .eq('generation_status', 'published');

      // A failed guide read is not fatal: the report still works, it just
      // cannot label which competitors are noindexed. Better a report with
      // nulls in one column than no report.
      const indexability: Record<string, boolean> = {};
      if (guides.error) {
        logger.warn('pseo_pages unavailable; cannibalization report omits the tier gate');
      } else {
        for (const g of guides.data ?? []) {
          indexability[normalizePageUrl(`/guides/${g.slug}`)] = isGuideIndexable(g);
        }
      }

      setFindings(findCannibalization((perf.data ?? []) as PageQueryRow[], { indexability }));
      setLoaded(true);
    } catch (error) {
      logger.error('Error loading cannibalization report:', error);
      toast.error('Failed to load the cannibalization report');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Deliberately no mount effect. SEOManager.test.tsx pins the exact set of
  // tables queried when the panel opens, and this reads the largest table in
  // the schema; it loads when someone opens the tab.

  return { findings, isLoading, loaded, loadCannibalization, windowDays: WINDOW_DAYS };
}
