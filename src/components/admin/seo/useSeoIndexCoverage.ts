import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  parseSitemapLocs,
  reconcileCoverage,
  summarizeCoverage,
  type CoverageReport,
  type PrerenderManifest,
} from '@/lib/seo/indexCoverage';

/**
 * US-653: reconcile what we declare, what we build and what Google saw.
 *
 * Three sources: the live sitemap, the prerender manifest scripts/prerender.mjs
 * writes next to the build output, and gsc_page_performance. All three are
 * fetched on request; this reads the largest table in the schema and
 * SEOManager.test.tsx pins the query set at mount.
 */
const WINDOW_DAYS = 28;

export function useSeoIndexCoverage() {
  const [report, setReport] = useState<CoverageReport | null>(null);
  const [summary, setSummary] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadCoverage = useCallback(async () => {
    setIsLoading(true);
    try {
      const origin = window.location.origin;

      const sitemapXml = await fetch(`${origin}/sitemap.xml`)
        .then((res) => (res.ok ? res.text() : ''))
        .catch(() => '');

      // A 404 here is itself the finding: the deploy either predates the
      // manifest or skipped scripts/prerender.mjs. Reported as unknown rather
      // than as "nothing is prerendered", which would be a different alarm.
      const manifest: PrerenderManifest | null = await fetch(`${origin}/prerender-manifest.json`)
        .then((res) => (res.ok ? (res.json() as Promise<PrerenderManifest>) : null))
        .catch(() => null);

      const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
      const perf = await supabase
        .from('gsc_page_performance')
        .select('page_url')
        .gte('date', since);
      if (perf.error) throw perf.error;

      const next = reconcileCoverage({
        sitemapUrls: parseSitemapLocs(sitemapXml),
        manifest,
        gscUrls: (perf.data ?? []).map((r) => r.page_url),
      });

      setReport(next);
      setSummary(summarizeCoverage(next));
    } catch (error) {
      logger.error('Error building the index coverage report:', error);
      toast.error('Failed to build the index coverage report');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { report, summary, isLoading, loadCoverage, windowDays: WINDOW_DAYS };
}
