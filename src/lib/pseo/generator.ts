/**
 * pSEO page generation orchestration.
 *
 * Manages the lifecycle of programmatic SEO pages: queueing, generating,
 * validating, publishing, and refreshing content stored in Supabase.
 */

import { supabase } from '@/integrations/supabase/client';
import type { PseoPageType } from '@/types/pseo';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaxonomyCombination {
  [dimension: string]: string;
}

export interface BatchConfig {
  pageTypes: PseoPageType[];
  tiers: number[];
  batchSize: number;
  priority: 'high' | 'normal' | 'low';
}

export interface GenerationStats {
  totalPages: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  byTier: Record<number, number>;
  avgQualityScore: number;
  lastGenerationTime: string | null;
  queueLength: number;
  failedCount: number;
}

export interface QueueItem {
  id: string;
  batch_id: string | null;
  page_type: PseoPageType;
  combination: TaxonomyCombination;
  priority: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
}

export interface ValidationResult {
  valid: boolean;
  score: number;
  issues: ValidationIssue[];
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  field: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Title & slug templates keyed by page type
// ---------------------------------------------------------------------------

const TITLE_TEMPLATES: Record<PseoPageType, string> = {
  FOOD_CHAINING_GUIDE:
    'Food Chaining Guide: How to Introduce {{food}} to Picky Eaters',
  FOOD_CHAINING_AGE_COMBO:
    'Food Chaining {{food}} for {{age_group}} Kids',
  CHALLENGE_MEAL_OCCASION:
    '{{challenge}} Kids: {{meal_occasion}} Ideas That Work',
  AGE_MEAL_OCCASION:
    '{{meal_occasion}} Ideas for {{age_group}} Kids',
  FOOD_CHALLENGE_COMBO:
    'Getting {{challenge}} Kids to Eat {{food}}',
  FOOD_DIETARY_RESTRICTION:
    '{{dietary_restriction}}-Friendly {{food}} Recipes for Kids',
  CHALLENGE_LANDING:
    '{{challenge}} Eating in Kids: Complete Parent Guide',
  AGE_GROUP_LANDING:
    'Feeding Your {{age_group}}: Meal Ideas & Tips',
  MEAL_OCCASION_LANDING:
    '{{meal_occasion}} Ideas for Picky Eaters',
};

const META_TEMPLATES: Record<PseoPageType, string> = {
  FOOD_CHAINING_GUIDE:
    'Step-by-step food chaining guide to help picky eaters try {{food}}. Evidence-based techniques parents can start today.',
  FOOD_CHAINING_AGE_COMBO:
    'Age-appropriate food chaining strategies for introducing {{food}} to {{age_group}} children.',
  CHALLENGE_MEAL_OCCASION:
    'Practical {{meal_occasion}} ideas for kids with {{challenge}} eating. Parent-tested meals that reduce mealtime stress.',
  AGE_MEAL_OCCASION:
    '{{meal_occasion}} ideas designed for {{age_group}} kids. Quick, nutritious meals picky eaters will actually try.',
  FOOD_CHALLENGE_COMBO:
    'Proven strategies to help {{challenge}} eaters accept {{food}}. Gradual exposure techniques for parents.',
  FOOD_DIETARY_RESTRICTION:
    '{{dietary_restriction}} {{food}} recipes safe for kids. Allergy-friendly meal ideas the whole family can enjoy.',
  CHALLENGE_LANDING:
    'Everything parents need to know about {{challenge}} eating in children. Expert tips, meal plans, and food chaining guides.',
  AGE_GROUP_LANDING:
    'Complete feeding guide for {{age_group}} kids. Age-appropriate meals, portion sizes, and nutrition tips.',
  MEAL_OCCASION_LANDING:
    'Kid-friendly {{meal_occasion}} ideas for every age and eating style. Filter by dietary needs and challenges.',
};

// ---------------------------------------------------------------------------
// Slug builder
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const SLUG_PREFIXES: Record<PseoPageType, string> = {
  FOOD_CHAINING_GUIDE: 'food-chaining',
  FOOD_CHAINING_AGE_COMBO: 'food-chaining',
  CHALLENGE_MEAL_OCCASION: 'challenges',
  AGE_MEAL_OCCASION: 'age',
  FOOD_CHALLENGE_COMBO: 'food-challenge',
  FOOD_DIETARY_RESTRICTION: 'dietary',
  CHALLENGE_LANDING: 'challenges',
  AGE_GROUP_LANDING: 'age',
  MEAL_OCCASION_LANDING: 'meals',
};

export function buildSlug(
  pageType: PseoPageType,
  combination: TaxonomyCombination,
): string {
  const prefix = SLUG_PREFIXES[pageType];
  const parts = Object.values(combination).map(slugify);
  return `${prefix}/${parts.join('/')}`;
}

// ---------------------------------------------------------------------------
// Title & meta description builder
// ---------------------------------------------------------------------------

function interpolate(
  template: string,
  combination: TaxonomyCombination,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    return combination[key] ?? key;
  });
}

export function buildTitle(
  pageType: PseoPageType,
  combination: TaxonomyCombination,
): string {
  const template = TITLE_TEMPLATES[pageType];
  return interpolate(template, combination);
}

export function buildMetaDescription(
  pageType: PseoPageType,
  combination: TaxonomyCombination,
): string {
  const template = META_TEMPLATES[pageType];
  return interpolate(template, combination);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const QUALITY_THRESHOLD = 0.7;
const MIN_TITLE_LENGTH = 20;
const MAX_TITLE_LENGTH = 70;
const MIN_META_LENGTH = 80;
const MAX_META_LENGTH = 160;

export async function validatePage(page: {
  id?: string;
  title: string;
  meta_description: string;
  content: Record<string, unknown>;
  slug: string;
  page_type: PseoPageType;
}): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];
  let score = 1.0;

  // Title checks
  if (!page.title) {
    issues.push({ severity: 'error', field: 'title', message: 'Title is missing' });
    score -= 0.3;
  } else {
    if (page.title.length < MIN_TITLE_LENGTH) {
      issues.push({
        severity: 'warning',
        field: 'title',
        message: `Title is too short (${page.title.length}/${MIN_TITLE_LENGTH} chars)`,
      });
      score -= 0.1;
    }
    if (page.title.length > MAX_TITLE_LENGTH) {
      issues.push({
        severity: 'warning',
        field: 'title',
        message: `Title exceeds ${MAX_TITLE_LENGTH} chars (${page.title.length})`,
      });
      score -= 0.05;
    }
  }

  // Meta description checks
  if (!page.meta_description) {
    issues.push({ severity: 'error', field: 'meta_description', message: 'Meta description is missing' });
    score -= 0.2;
  } else {
    if (page.meta_description.length < MIN_META_LENGTH) {
      issues.push({
        severity: 'warning',
        field: 'meta_description',
        message: `Meta description is too short (${page.meta_description.length}/${MIN_META_LENGTH} chars)`,
      });
      score -= 0.05;
    }
    if (page.meta_description.length > MAX_META_LENGTH) {
      issues.push({
        severity: 'warning',
        field: 'meta_description',
        message: `Meta description exceeds ${MAX_META_LENGTH} chars`,
      });
      score -= 0.05;
    }
  }

  // Content checks
  if (!page.content || Object.keys(page.content).length === 0) {
    issues.push({ severity: 'error', field: 'content', message: 'Content is empty' });
    score -= 0.3;
  } else {
    // Check for FAQ section
    const content = page.content as Record<string, unknown>;
    if (!content.faqs || !Array.isArray(content.faqs) || content.faqs.length === 0) {
      issues.push({ severity: 'warning', field: 'content.faqs', message: 'Missing FAQ section' });
      score -= 0.1;
    }

    // Check for headline
    if (!content.headline) {
      issues.push({ severity: 'warning', field: 'content.headline', message: 'Missing headline in content' });
      score -= 0.05;
    }

    // Check for intro
    if (!content.intro) {
      issues.push({ severity: 'warning', field: 'content.intro', message: 'Missing intro paragraph' });
      score -= 0.05;
    }
  }

  // Slug checks
  if (!page.slug) {
    issues.push({ severity: 'error', field: 'slug', message: 'Slug is missing' });
    score -= 0.1;
  } else if (!/^[a-z0-9][a-z0-9\-/]*[a-z0-9]$/.test(page.slug)) {
    issues.push({ severity: 'warning', field: 'slug', message: 'Slug contains invalid characters' });
    score -= 0.05;
  }

  // Check for duplicate slug (only for new pages or if id provided)
  if (page.slug) {
    const query = supabase
      .from('pseo_pages')
      .select('id')
      .eq('slug', page.slug);

    if (page.id) {
      query.neq('id', page.id);
    }

    const { data: duplicates } = await query;
    if (duplicates && duplicates.length > 0) {
      issues.push({ severity: 'error', field: 'slug', message: 'Duplicate slug found' });
      score -= 0.2;
    }
  }

  score = Math.max(0, Math.min(1, score));

  return {
    valid: score >= QUALITY_THRESHOLD && !issues.some((i) => i.severity === 'error'),
    score,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Single page generation
// ---------------------------------------------------------------------------

export async function generatePseoPage(
  pageType: PseoPageType,
  combination: TaxonomyCombination,
): Promise<{ id: string; slug: string } | null> {
  const slug = buildSlug(pageType, combination);
  const title = buildTitle(pageType, combination);
  const metaDescription = buildMetaDescription(pageType, combination);

  // Determine tier from page type
  const tier = getTierForPageType(pageType);

  try {
    // Check for existing page with same slug
    const { data: existing } = await supabase
      .from('pseo_pages')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (existing) {
      // Update existing page rather than creating a duplicate
      const { error: updateError } = await supabase
        .from('pseo_pages')
        .update({
          generation_status: 'generating',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) throw updateError;

      // Call the edge function for content generation
      const { data: generated, error: genError } = await supabase.functions.invoke(
        'generate-pseo-content',
        {
          body: {
            pageType,
            combination,
            pageId: existing.id,
          },
        },
      );

      if (genError) throw genError;

      // Update with generated content
      const { error: saveError } = await supabase
        .from('pseo_pages')
        .update({
          title,
          meta_description: metaDescription,
          content: generated?.content ?? {},
          generation_status: 'generated',
          quality_score: generated?.quality_score ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (saveError) throw saveError;
      return { id: existing.id, slug };
    }

    // Create new page record in "generating" status
    const { data: newPage, error: insertError } = await supabase
      .from('pseo_pages')
      .insert({
        slug,
        page_type: pageType,
        title,
        meta_description: metaDescription,
        canonical_url: `https://tryeatpal.com/guides/${slug}`,
        generation_status: 'generating',
        tier,
        combination,
        breadcrumbs: buildBreadcrumbs(pageType, combination),
        content: {},
        related_pages: [],
      })
      .select('id')
      .single();

    if (insertError) throw insertError;

    // Call edge function for AI content generation
    const { data: generated, error: genError } = await supabase.functions.invoke(
      'generate-pseo-content',
      {
        body: {
          pageType,
          combination,
          pageId: newPage.id,
        },
      },
    );

    if (genError) {
      // Mark as failed
      await supabase
        .from('pseo_pages')
        .update({ generation_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', newPage.id);
      throw genError;
    }

    // Update with generated content
    const { error: saveError } = await supabase
      .from('pseo_pages')
      .update({
        content: generated?.content ?? {},
        generation_status: 'generated',
        quality_score: generated?.quality_score ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', newPage.id);

    if (saveError) throw saveError;

    return { id: newPage.id, slug };
  } catch (error) {
    console.error('Failed to generate pSEO page:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Batch generation
// ---------------------------------------------------------------------------

export async function generateBatch(
  config: BatchConfig,
): Promise<{ batchId: string; queued: number }> {
  const priorityMap: Record<string, number> = { high: 10, normal: 5, low: 1 };

  // Create batch record
  const { data: batch, error: batchError } = await supabase
    .from('pseo_generation_batches')
    .insert({
      page_types: config.pageTypes,
      tiers: config.tiers,
      batch_size: config.batchSize,
      priority: priorityMap[config.priority] ?? 5,
      status: 'pending',
      total: 0,
      completed: 0,
      failed: 0,
    })
    .select('id')
    .single();

  if (batchError) throw batchError;

  // Queue pages for generation
  const queued = await queuePages(
    config.pageTypes,
    config.tiers,
    config.batchSize,
    batch.id,
    priorityMap[config.priority] ?? 5,
  );

  // Update batch total
  await supabase
    .from('pseo_generation_batches')
    .update({ total: queued, status: 'processing' })
    .eq('id', batch.id);

  return { batchId: batch.id, queued };
}

// ---------------------------------------------------------------------------
// Queue management
// ---------------------------------------------------------------------------

export async function queuePages(
  pageTypes: PseoPageType[],
  tiers: number[],
  batchSize: number,
  batchId?: string,
  priority: number = 5,
): Promise<number> {
  // Fetch taxonomy combinations that haven't been generated yet
  const { data: taxonomy, error: taxError } = await supabase
    .from('pseo_taxonomy')
    .select('*')
    .eq('active', true)
    .in('page_type', pageTypes)
    .in('tier', tiers);

  if (taxError) throw taxError;
  if (!taxonomy || taxonomy.length === 0) return 0;

  // Filter out already-generated combinations
  const { data: existingPages } = await supabase
    .from('pseo_pages')
    .select('slug, generation_status')
    .in('page_type', pageTypes);

  const existingSlugs = new Set(
    (existingPages ?? [])
      .filter((p) => p.generation_status !== 'failed')
      .map((p) => p.slug),
  );

  const itemsToQueue: Array<{
    batch_id: string | null;
    page_type: PseoPageType;
    combination: TaxonomyCombination;
    priority: number;
    status: 'pending';
  }> = [];

  for (const item of taxonomy) {
    if (itemsToQueue.length >= batchSize) break;

    const combination = (item.combination ?? {}) as TaxonomyCombination;
    const slug = buildSlug(item.page_type as PseoPageType, combination);

    if (existingSlugs.has(slug)) continue;

    itemsToQueue.push({
      batch_id: batchId ?? null,
      page_type: item.page_type as PseoPageType,
      combination,
      priority,
      status: 'pending',
    });
  }

  if (itemsToQueue.length === 0) return 0;

  const { error: queueError } = await supabase
    .from('pseo_generation_queue')
    .insert(itemsToQueue);

  if (queueError) throw queueError;

  return itemsToQueue.length;
}

export async function processQueue(batchId: string): Promise<{
  completed: number;
  failed: number;
}> {
  let completed = 0;
  let failed = 0;

  // Fetch pending queue items for this batch
  const { data: queueItems, error } = await supabase
    .from('pseo_generation_queue')
    .select('*')
    .eq('batch_id', batchId)
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .limit(10);

  if (error) throw error;
  if (!queueItems || queueItems.length === 0) {
    // Mark batch as complete
    await supabase
      .from('pseo_generation_batches')
      .update({ status: 'completed' })
      .eq('id', batchId);
    return { completed, failed };
  }

  for (const item of queueItems) {
    // Mark as processing
    await supabase
      .from('pseo_generation_queue')
      .update({ status: 'processing' })
      .eq('id', item.id);

    try {
      const result = await generatePseoPage(
        item.page_type as PseoPageType,
        item.combination as TaxonomyCombination,
      );

      if (result) {
        await supabase
          .from('pseo_generation_queue')
          .update({ status: 'completed' })
          .eq('id', item.id);
        completed++;
      } else {
        throw new Error('Generation returned null');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await supabase
        .from('pseo_generation_queue')
        .update({ status: 'failed', error_message: message })
        .eq('id', item.id);
      failed++;
    }
  }

  // Update batch counters
  await supabase
    .from('pseo_generation_batches')
    .update({
      completed: completed,
      failed: failed,
      status: failed > 0 && completed === 0 ? 'failed' : 'processing',
    })
    .eq('id', batchId);

  return { completed, failed };
}

// ---------------------------------------------------------------------------
// Publish / unpublish / refresh
// ---------------------------------------------------------------------------

export async function publishPage(pageId: string): Promise<boolean> {
  const { error } = await supabase
    .from('pseo_pages')
    .update({
      generation_status: 'published',
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', pageId);

  if (error) {
    console.error('Failed to publish page:', error);
    return false;
  }
  return true;
}

export async function unpublishPage(pageId: string): Promise<boolean> {
  const { error } = await supabase
    .from('pseo_pages')
    .update({
      generation_status: 'archived',
      updated_at: new Date().toISOString(),
    })
    .eq('id', pageId);

  if (error) {
    console.error('Failed to unpublish page:', error);
    return false;
  }
  return true;
}

export async function refreshPage(pageId: string): Promise<boolean> {
  // Fetch the page to get its type and combination
  const { data: page, error: fetchError } = await supabase
    .from('pseo_pages')
    .select('page_type, combination')
    .eq('id', pageId)
    .single();

  if (fetchError || !page) {
    console.error('Failed to fetch page for refresh:', fetchError);
    return false;
  }

  const result = await generatePseoPage(
    page.page_type as PseoPageType,
    (page.combination ?? {}) as TaxonomyCombination,
  );

  if (result) {
    await supabase
      .from('pseo_pages')
      .update({ needs_refresh: false })
      .eq('id', pageId);
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export async function getGenerationStats(): Promise<GenerationStats> {
  const stats: GenerationStats = {
    totalPages: 0,
    byStatus: {},
    byType: {},
    byTier: {},
    avgQualityScore: 0,
    lastGenerationTime: null,
    queueLength: 0,
    failedCount: 0,
  };

  // Count pages by status
  const { data: pages } = await supabase
    .from('pseo_pages')
    .select('generation_status, page_type, tier, quality_score, updated_at');

  if (pages) {
    stats.totalPages = pages.length;

    let qualitySum = 0;
    let qualityCount = 0;
    let latestTime: string | null = null;

    for (const page of pages) {
      // By status
      const status = page.generation_status ?? 'unknown';
      stats.byStatus[status] = (stats.byStatus[status] ?? 0) + 1;

      // By type
      const ptype = page.page_type ?? 'unknown';
      stats.byType[ptype] = (stats.byType[ptype] ?? 0) + 1;

      // By tier
      const tier = page.tier ?? 0;
      stats.byTier[tier] = (stats.byTier[tier] ?? 0) + 1;

      // Quality score average
      if (page.quality_score != null) {
        qualitySum += page.quality_score;
        qualityCount++;
      }

      // Latest generation time
      if (page.updated_at && (!latestTime || page.updated_at > latestTime)) {
        latestTime = page.updated_at;
      }
    }

    stats.avgQualityScore = qualityCount > 0 ? qualitySum / qualityCount : 0;
    stats.lastGenerationTime = latestTime;
    stats.failedCount = stats.byStatus['failed'] ?? 0;
  }

  // Queue length
  const { data: queue } = await supabase
    .from('pseo_generation_queue')
    .select('id')
    .in('status', ['pending', 'processing']);

  stats.queueLength = queue?.length ?? 0;

  return stats;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTierForPageType(pageType: PseoPageType): number {
  switch (pageType) {
    case 'CHALLENGE_LANDING':
    case 'AGE_GROUP_LANDING':
    case 'MEAL_OCCASION_LANDING':
      return 1;
    case 'FOOD_CHAINING_GUIDE':
    case 'CHALLENGE_MEAL_OCCASION':
    case 'AGE_MEAL_OCCASION':
      return 2;
    case 'FOOD_CHAINING_AGE_COMBO':
    case 'FOOD_CHALLENGE_COMBO':
    case 'FOOD_DIETARY_RESTRICTION':
      return 3;
    default:
      return 3;
  }
}

function buildBreadcrumbs(
  pageType: PseoPageType,
  combination: TaxonomyCombination,
): Array<{ label: string; href: string }> {
  const crumbs: Array<{ label: string; href: string }> = [
    { label: 'Home', href: '/' },
    { label: 'Guides', href: '/guides' },
  ];

  const prefix = SLUG_PREFIXES[pageType];
  const values = Object.values(combination);

  if (values.length > 0) {
    crumbs.push({
      label: values[0],
      href: `/guides/${prefix}/${slugify(values[0])}`,
    });
  }

  if (values.length > 1) {
    const slug = buildSlug(pageType, combination);
    crumbs.push({
      label: values[1],
      href: `/guides/${slug}`,
    });
  }

  return crumbs;
}
