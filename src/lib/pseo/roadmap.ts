/**
 * pSEO Phase 7: Launch Roadmap
 *
 * 6-week progressive rollout plan for ~889 Phase 1 pages,
 * with monitoring triggers and decision points.
 */

export interface RoadmapWeek {
  week: number;
  title: string;
  pageTarget: number;
  pageTypes: string[];
  tiers: number[];
  activities: string[];
  gscSignals: string[];
  decisionPoints: string[];
  trafficProjection: string;
}

export const LAUNCH_ROADMAP: RoadmapWeek[] = [
  {
    week: 1,
    title: 'Foundation — Food Chaining Guides',
    pageTarget: 52,
    pageTypes: ['FOOD_CHAINING_GUIDE'],
    tiers: [1, 2, 3],
    activities: [
      'Generate all 52 Food Chaining Guide pages (one per safe food)',
      'Submit sitemap to Google Search Console',
      'Verify all pages pass quality validation (score >= 0.7)',
      'Ensure JSON-LD HowTo + ItemList schema is valid via Rich Results Test',
      'Set up GSC monitoring for "food chaining" keyword cluster',
      'Internal link structure: each food guide links to 4-6 related food guides',
      'Deploy robots.txt allowing full crawl of /food-chaining/ path',
    ],
    gscSignals: [
      'Pages indexed: target 30+ of 52 by end of week',
      'Impressions for "food chaining [food name]" queries appearing',
      'No crawl errors in GSC coverage report',
      'Schema markup validated in Rich Results report',
    ],
    decisionPoints: [
      'IF < 20 pages indexed → check technical SEO (rendering, canonical tags)',
      'IF quality scores below 0.7 → pause and refine generation prompts',
      'IF schema validation errors → fix and regenerate affected pages',
    ],
    trafficProjection: '0-50 organic clicks (indexing phase, minimal traffic expected)',
  },
  {
    week: 2,
    title: 'High-Intent Combos — Challenge + Meal Occasion',
    pageTarget: 70,
    pageTypes: ['CHALLENGE_MEAL_OCCASION'],
    tiers: [1, 2],
    activities: [
      'Generate 70 Challenge × Meal Occasion pages (10 challenges × 7 occasions)',
      'Analyze Week 1 indexing — adjust technical setup if needed',
      'Link challenge pages to related food chaining guides (cross-type linking)',
      'Monitor for thin content flags in GSC',
      'A/B test two FAQ formats (collapsible vs. inline) on 10 pages',
      'Begin tracking CTR from pSEO pages to EatPal signup',
    ],
    gscSignals: [
      'Week 1 pages: 40+ of 52 indexed',
      'New impressions for "[challenge] [meal] ideas for picky eaters"',
      'Click-through rate on indexed pages (target > 2%)',
      'No "Excluded by noindex" errors',
    ],
    decisionPoints: [
      'IF Week 1 indexing rate < 50% → investigate rendering issues, server response times',
      'IF duplicate content warnings → review cross-page content overlap, adjust prompts',
      'PROCEED if indexing rate >= 60% and no critical errors',
    ],
    trafficProjection: '50-150 organic clicks (early indexing momentum)',
  },
  {
    week: 3,
    title: 'Age-Specific Content + Landing Pages',
    pageTarget: 109,
    pageTypes: ['FOOD_CHAINING_AGE_COMBO', 'AGE_GROUP_LANDING'],
    tiers: [1],
    activities: [
      'Generate 88 Food Chaining + Age Combo pages (22 T1 foods × 4 age groups)',
      'Generate 4 Age Group Landing pages (hub pages)',
      'Generate 10 Challenge Landing pages',
      'Generate 7 Meal Occasion Landing pages',
      'Build hub-and-spoke internal linking (landing → combo pages)',
      'Review first organic conversion data from EatPal signups',
      'Optimize meta descriptions on underperforming pages (low CTR)',
    ],
    gscSignals: [
      'Total indexed pages: 100+ of 122 published',
      'Impressions for age-specific queries (e.g., "toddler picky eater")',
      'Average position for target keywords improving',
      'Rich result appearances for HowTo schema',
    ],
    decisionPoints: [
      'IF overall indexing rate < 40% → pause new generation, focus on technical fixes',
      'IF CTR < 1% across all pages → revise title templates and meta descriptions',
      'IF positive signals → accelerate Week 4 batch size',
      'ADJUST taxonomy if certain combinations show zero impressions',
    ],
    trafficProjection: '150-400 organic clicks (indexed pages starting to rank)',
  },
  {
    week: 4,
    title: 'Scale — Age + Meal Occasion + Dietary Restriction',
    pageTarget: 138,
    pageTypes: ['AGE_MEAL_OCCASION', 'FOOD_DIETARY_RESTRICTION'],
    tiers: [1, 2],
    activities: [
      'Generate 28 Age × Meal Occasion pages',
      'Generate 110 Food × Dietary Restriction pages',
      'Build internal links from restriction pages to base food chaining guides',
      'Monitor page load performance (target LCP < 1.8s)',
      'Review and fix any quality issues from automated weekly scan',
      'Update sitemap and resubmit to GSC',
      'Begin outreach for backlinks to highest-traffic food chaining guides',
    ],
    gscSignals: [
      'Total indexed pages: 200+ of 260 published',
      'Impressions for dietary restriction queries appearing',
      'Clicks from "gluten-free picky eater" keyword cluster',
      'No soft 404 errors',
    ],
    decisionPoints: [
      'IF indexing rate stays > 60% → proceed to Week 5 high-volume generation',
      'IF dietary restriction pages underperform → reduce Tier 2 restriction combinations',
      'IF quality scores dropping → slow down batch size and review prompts',
      'CONSIDER adding schema FAQ data to pages showing high impressions but low CTR',
    ],
    trafficProjection: '400-800 organic clicks (ranking momentum building)',
  },
  {
    week: 5,
    title: 'Volume Push — Food × Challenge Combos',
    pageTarget: 260,
    pageTypes: ['FOOD_CHALLENGE_COMBO'],
    tiers: [1],
    activities: [
      'Generate first 260 of 520 Food × Challenge Combo pages (T1 foods × T1 challenges)',
      'Run batch quality scan — flag any pages below 0.7 quality score',
      'Review internal linking coverage — ensure no orphaned pages',
      'Analyze which food/challenge combinations drive highest CTR',
      'A/B test CTA placements on high-traffic pages',
      'Refresh any Week 1 pages that have stale content signals',
    ],
    gscSignals: [
      'Total indexed pages: 350+ of 520 published',
      'Long-tail keyword visibility expanding significantly',
      'First page 1 rankings for niche food chaining queries',
      'Organic click growth rate > 30% week-over-week',
    ],
    decisionPoints: [
      'IF indexing rate drops below 50% → pause and investigate crawl budget',
      'IF certain food × challenge combos have zero impressions → deprioritize remaining',
      'IF traffic growing steadily → proceed to final push in Week 6',
      'EVALUATE which Tier 2 combinations are worth generating vs. skipping',
    ],
    trafficProjection: '800-1,500 organic clicks (volume starting to compound)',
  },
  {
    week: 6,
    title: 'Complete + Optimize',
    pageTarget: 260,
    pageTypes: ['FOOD_CHALLENGE_COMBO'],
    tiers: [1, 2],
    activities: [
      'Generate remaining 260 Food × Challenge Combo pages (T1 foods × T2 challenges + T2 foods × T1 challenges)',
      'Complete internal link audit — fix all orphaned pages',
      'Run full quality scan across all ~889 pages',
      'Optimize top 20 pages by impressions (refine titles, descriptions, content)',
      'Set up automated freshness monitoring (flag pages older than 90 days)',
      'Generate performance report: indexing rate, rankings, clicks, conversions',
      'Plan Phase 2 expansion (3-way combinations for remaining ~600 pages)',
    ],
    gscSignals: [
      'Total indexed pages: target 500+ of 889 (56%+ indexing rate)',
      'Organic clicks: 1,000+ per week',
      'Multiple page 1 rankings for food chaining queries',
      'First EatPal signups directly attributable to pSEO pages',
    ],
    decisionPoints: [
      'IF indexing rate > 50% and clicks > 800/week → plan Phase 2 (3-way combos)',
      'IF indexing rate < 40% → stop generating new pages, focus on technical SEO and content quality',
      'IF conversion rate > 2% from pSEO → prioritize pages that drive highest signups',
      'DECIDE on Phase 2 timeline based on Phase 1 performance data',
    ],
    trafficProjection: '1,500-3,000 organic clicks (40-50% indexing rate target met)',
  },
];

export interface RolloutMetrics {
  totalPagesGenerated: number;
  totalPagesPublished: number;
  totalPagesIndexed: number;
  indexingRate: number;
  weeklyClicks: number;
  weeklyImpressions: number;
  averageCtr: number;
  averagePosition: number;
  signupsFromPseo: number;
  qualityScoreAverage: number;
}

/**
 * Get the current week's roadmap based on actual metrics.
 */
export function getCurrentRoadmapWeek(
  startDate: Date,
  currentDate: Date = new Date()
): number {
  const diffMs = currentDate.getTime() - startDate.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return Math.min(Math.max(diffWeeks + 1, 1), 6);
}

/**
 * Get cumulative page targets up to a given week.
 */
export function getCumulativeTarget(week: number): number {
  return LAUNCH_ROADMAP
    .filter(w => w.week <= week)
    .reduce((sum, w) => sum + w.pageTarget, 0);
}

/**
 * Evaluate whether to proceed, pause, or adjust based on metrics.
 */
export function evaluateRolloutHealth(
  week: number,
  metrics: RolloutMetrics
): { status: 'green' | 'yellow' | 'red'; recommendation: string } {
  const target = getCumulativeTarget(week);
  const indexingRate = metrics.totalPagesIndexed / Math.max(metrics.totalPagesPublished, 1);

  if (indexingRate < 0.3 && week >= 3) {
    return {
      status: 'red',
      recommendation: 'Indexing rate critically low. Pause new generation. Investigate technical SEO issues: server-side rendering, crawl budget, canonical tags, robots.txt.',
    };
  }

  if (metrics.qualityScoreAverage < 0.6) {
    return {
      status: 'red',
      recommendation: 'Average quality score too low. Pause generation and refine prompts. Review and regenerate pages below 0.7 threshold.',
    };
  }

  if (indexingRate < 0.5 && week >= 4) {
    return {
      status: 'yellow',
      recommendation: 'Indexing rate below target. Slow down generation pace. Submit individual URLs for inspection in GSC. Review page quality.',
    };
  }

  if (metrics.totalPagesPublished < target * 0.7) {
    return {
      status: 'yellow',
      recommendation: 'Behind on page generation targets. Consider increasing batch sizes or running parallel generation.',
    };
  }

  return {
    status: 'green',
    recommendation: 'Rollout proceeding on track. Continue with planned generation schedule.',
  };
}

/**
 * Get estimated total pages at full build-out across all phases.
 */
export const FULL_BUILDOUT_ESTIMATE = {
  phase1: 889,
  phase2_three_way_combos: 611,
  total: 1500,
  breakdown: {
    food_chaining_guide: 52,
    challenge_meal_occasion: 70,
    food_chaining_age_combo: 88,
    age_meal_occasion: 28,
    food_challenge_combo: 520,
    food_dietary_restriction: 110,
    challenge_landing: 10,
    age_group_landing: 4,
    meal_occasion_landing: 7,
  },
};
