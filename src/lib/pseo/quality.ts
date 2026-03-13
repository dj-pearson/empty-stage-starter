/**
 * pSEO Quality Control System
 *
 * Automated checks that run before a page is marked `is_published = true`.
 * Phase 6D: Quality control checklist implementation.
 */

export interface QualityCheckResult {
  check: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface QualityReport {
  pageId: string;
  slug: string;
  overallScore: number; // 0.00 to 1.00
  passed: boolean;
  checks: QualityCheckResult[];
  checkedAt: string;
}

const MIN_WORD_COUNTS: Record<string, number> = {
  hero_headline: 5,
  hero_subheadline: 8,
  hero_intro: 30,
  faq_answer: 20,
  item_description: 15,
  why_fits: 10,
  section_content: 40,
};

const BANNED_PHRASES = [
  'vibrant',
  'bustling',
  'thriving',
  'something for everyone',
  'look no further',
  'in today\'s world',
  'without further ado',
  'it goes without saying',
  'at the end of the day',
  'a wide variety',
  'state of the art',
  'best kept secret',
  'hidden gem',
];

/**
 * Run all quality checks on a generated page content object.
 */
export function validatePageQuality(
  content: Record<string, unknown>,
  slug: string,
  pageId: string
): QualityReport {
  const checks: QualityCheckResult[] = [];

  // 1. Schema completeness
  checks.push(checkSchemaCompleteness(content));

  // 2. Minimum word counts per AI-FILL field
  checks.push(...checkMinWordCounts(content));

  // 3. Banned phrase detection
  checks.push(...checkBannedPhrases(content));

  // 4. FAQ validation
  checks.push(checkFaqPresence(content));

  // 5. SEO field validation
  checks.push(...checkSeoFields(content));

  // 6. Internal link validity
  checks.push(checkInternalLinks(content));

  // 7. Empty string detection
  checks.push(checkNoEmptyStrings(content));

  // 8. Array length validation
  checks.push(...checkArrayLengths(content));

  // 9. Content specificity (not generic)
  checks.push(checkContentSpecificity(content));

  // 10. Title length check
  checks.push(checkTitleLength(content));

  const errorCount = checks.filter(c => !c.passed && c.severity === 'error').length;
  const warningCount = checks.filter(c => !c.passed && c.severity === 'warning').length;
  const totalChecks = checks.length;
  const passedChecks = checks.filter(c => c.passed).length;

  // Score: errors count 2x against, warnings count 1x
  const rawScore = Math.max(0, (totalChecks - errorCount * 2 - warningCount) / totalChecks);
  const overallScore = Math.round(rawScore * 100) / 100;

  return {
    pageId,
    slug,
    overallScore,
    passed: errorCount === 0 && overallScore >= 0.7,
    checks,
    checkedAt: new Date().toISOString(),
  };
}

function checkSchemaCompleteness(content: Record<string, unknown>): QualityCheckResult {
  const requiredTopLevel = ['meta', 'seo', 'hero'];
  const missing = requiredTopLevel.filter(key => !content[key]);

  return {
    check: 'schema_completeness',
    passed: missing.length === 0,
    message: missing.length === 0
      ? 'All required top-level sections present'
      : `Missing required sections: ${missing.join(', ')}`,
    severity: 'error',
  };
}

function checkMinWordCounts(content: Record<string, unknown>): QualityCheckResult[] {
  const results: QualityCheckResult[] = [];
  const contentStr = JSON.stringify(content);

  // Check hero fields
  const hero = content.hero as Record<string, string> | undefined;
  if (hero) {
    for (const [field, minWords] of Object.entries(MIN_WORD_COUNTS)) {
      if (field.startsWith('hero_')) {
        const heroField = field.replace('hero_', '');
        const value = hero[heroField];
        if (value) {
          const wordCount = value.split(/\s+/).filter(Boolean).length;
          results.push({
            check: `min_words_${field}`,
            passed: wordCount >= minWords,
            message: wordCount >= minWords
              ? `${field}: ${wordCount} words (min: ${minWords})`
              : `${field}: only ${wordCount} words (need ${minWords}+)`,
            severity: 'warning',
          });
        }
      }
    }
  }

  // Check FAQ answers
  const faq = content.faq as Array<{ question: string; answer: string }> | undefined;
  if (faq && Array.isArray(faq)) {
    for (let i = 0; i < faq.length; i++) {
      const answerWords = faq[i].answer?.split(/\s+/).filter(Boolean).length || 0;
      if (answerWords < MIN_WORD_COUNTS.faq_answer) {
        results.push({
          check: `min_words_faq_${i}`,
          passed: false,
          message: `FAQ answer ${i + 1}: only ${answerWords} words (need ${MIN_WORD_COUNTS.faq_answer}+)`,
          severity: 'warning',
        });
      }
    }
  }

  if (results.length === 0) {
    results.push({
      check: 'min_word_counts',
      passed: true,
      message: 'Word count checks passed',
      severity: 'info',
    });
  }

  return results;
}

function checkBannedPhrases(content: Record<string, unknown>): QualityCheckResult[] {
  const contentStr = JSON.stringify(content).toLowerCase();
  const found = BANNED_PHRASES.filter(phrase => contentStr.includes(phrase.toLowerCase()));

  if (found.length === 0) {
    return [{
      check: 'banned_phrases',
      passed: true,
      message: 'No banned phrases detected',
      severity: 'info',
    }];
  }

  return found.map(phrase => ({
    check: `banned_phrase_${phrase.replace(/\s+/g, '_')}`,
    passed: false,
    message: `Contains banned phrase: "${phrase}"`,
    severity: 'warning',
  }));
}

function checkFaqPresence(content: Record<string, unknown>): QualityCheckResult {
  const faq = content.faq as Array<unknown> | undefined;
  const hasFaq = faq && Array.isArray(faq) && faq.length >= 3;

  return {
    check: 'faq_presence',
    passed: !!hasFaq,
    message: hasFaq
      ? `FAQ section present with ${faq!.length} items`
      : 'Missing or insufficient FAQ section (need 3+ items)',
    severity: 'error',
  };
}

function checkSeoFields(content: Record<string, unknown>): QualityCheckResult[] {
  const results: QualityCheckResult[] = [];
  const seo = content.seo as Record<string, unknown> | undefined;

  if (!seo) {
    return [{ check: 'seo_fields', passed: false, message: 'Missing SEO section', severity: 'error' }];
  }

  // Title
  const title = seo.title as string;
  if (!title) {
    results.push({ check: 'seo_title', passed: false, message: 'Missing SEO title', severity: 'error' });
  } else if (title.length > 70) {
    results.push({ check: 'seo_title_length', passed: false, message: `SEO title too long: ${title.length} chars (max 70)`, severity: 'warning' });
  }

  // Meta description
  const description = seo.description as string;
  if (!description) {
    results.push({ check: 'seo_description', passed: false, message: 'Missing meta description', severity: 'error' });
  } else if (description.length > 160) {
    results.push({ check: 'seo_description_length', passed: false, message: `Meta description too long: ${description.length} chars (max 160)`, severity: 'warning' });
  } else if (description.length < 70) {
    results.push({ check: 'seo_description_short', passed: false, message: `Meta description too short: ${description.length} chars (min 70)`, severity: 'warning' });
  }

  // Keywords
  const keywords = seo.keywords as string[];
  if (!keywords || !Array.isArray(keywords)) {
    results.push({ check: 'seo_keywords', passed: false, message: 'Missing keywords array', severity: 'warning' });
  } else if (keywords.length < 5) {
    results.push({ check: 'seo_keywords_count', passed: false, message: `Only ${keywords.length} keywords (need 5-8)`, severity: 'warning' });
  }

  if (results.length === 0) {
    results.push({ check: 'seo_fields', passed: true, message: 'All SEO fields valid', severity: 'info' });
  }

  return results;
}

function checkInternalLinks(content: Record<string, unknown>): QualityCheckResult {
  const relatedPages = content.related_pages as Array<{ url: string }> | undefined;

  if (!relatedPages || !Array.isArray(relatedPages)) {
    return {
      check: 'internal_links',
      passed: false,
      message: 'Missing related_pages section',
      severity: 'warning',
    };
  }

  const validLinks = relatedPages.filter(p => p.url && p.url.startsWith('/'));
  return {
    check: 'internal_links',
    passed: validLinks.length >= 3,
    message: validLinks.length >= 3
      ? `${validLinks.length} valid internal links`
      : `Only ${validLinks.length} internal links (need 3+)`,
    severity: validLinks.length >= 3 ? 'info' : 'warning',
  };
}

function checkNoEmptyStrings(content: Record<string, unknown>): QualityCheckResult {
  let emptyCount = 0;
  const checkValue = (val: unknown, path: string): void => {
    if (typeof val === 'string' && val.trim() === '') {
      emptyCount++;
    } else if (typeof val === 'object' && val !== null) {
      if (Array.isArray(val)) {
        val.forEach((item, i) => checkValue(item, `${path}[${i}]`));
      } else {
        for (const [key, v] of Object.entries(val as Record<string, unknown>)) {
          checkValue(v, `${path}.${key}`);
        }
      }
    }
  };

  checkValue(content, 'root');

  return {
    check: 'no_empty_strings',
    passed: emptyCount === 0,
    message: emptyCount === 0
      ? 'No empty strings found'
      : `Found ${emptyCount} empty string(s) in content`,
    severity: emptyCount > 0 ? 'error' : 'info',
  };
}

function checkArrayLengths(content: Record<string, unknown>): QualityCheckResult[] {
  const results: QualityCheckResult[] = [];

  // FAQ should have exactly 4 items
  const faq = content.faq as Array<unknown> | undefined;
  if (faq && Array.isArray(faq)) {
    results.push({
      check: 'faq_count',
      passed: faq.length >= 3 && faq.length <= 6,
      message: `FAQ has ${faq.length} items (expected 3-6)`,
      severity: faq.length >= 3 ? 'info' : 'error',
    });
  }

  // Related pages should have 4-6
  const related = content.related_pages as Array<unknown> | undefined;
  if (related && Array.isArray(related)) {
    results.push({
      check: 'related_pages_count',
      passed: related.length >= 4 && related.length <= 6,
      message: `Related pages has ${related.length} items (expected 4-6)`,
      severity: related.length >= 3 ? 'info' : 'warning',
    });
  }

  // Items array (if present) should have 8-40
  const items = content.items as Array<unknown> | undefined;
  if (items && Array.isArray(items)) {
    results.push({
      check: 'items_count',
      passed: items.length >= 6,
      message: `Items array has ${items.length} entries`,
      severity: items.length >= 6 ? 'info' : 'warning',
    });
  }

  return results;
}

function checkContentSpecificity(content: Record<string, unknown>): QualityCheckResult {
  const contentStr = JSON.stringify(content).toLowerCase();

  const genericPhrases = [
    'many options available',
    'there are many',
    'a great choice',
    'perfect for',
    'ideal for',
    'wonderful option',
  ];

  const genericCount = genericPhrases.filter(p => contentStr.includes(p)).length;

  return {
    check: 'content_specificity',
    passed: genericCount <= 2,
    message: genericCount <= 2
      ? 'Content appears sufficiently specific'
      : `Found ${genericCount} generic phrases — content may be too vague`,
    severity: genericCount > 4 ? 'error' : genericCount > 2 ? 'warning' : 'info',
  };
}

function checkTitleLength(content: Record<string, unknown>): QualityCheckResult {
  const seo = content.seo as Record<string, string> | undefined;
  const title = seo?.title || '';

  return {
    check: 'title_length',
    passed: title.length > 0 && title.length <= 70,
    message: title.length === 0
      ? 'No title found'
      : title.length <= 70
        ? `Title length: ${title.length} chars`
        : `Title too long: ${title.length} chars (max 70)`,
    severity: title.length === 0 ? 'error' : title.length > 70 ? 'warning' : 'info',
  };
}

/**
 * Calculate overall word count of all text content in a page.
 */
export function calculateWordCount(content: Record<string, unknown>): number {
  let totalWords = 0;

  const countWords = (val: unknown): void => {
    if (typeof val === 'string') {
      totalWords += val.split(/\s+/).filter(Boolean).length;
    } else if (typeof val === 'object' && val !== null) {
      if (Array.isArray(val)) {
        val.forEach(countWords);
      } else {
        Object.values(val as Record<string, unknown>).forEach(countWords);
      }
    }
  };

  countWords(content);
  return totalWords;
}

/**
 * Check if page content is a duplicate of another page.
 * Uses a simple similarity score based on shared n-grams.
 */
export function calculateSimilarity(contentA: string, contentB: string): number {
  const getNgrams = (text: string, n: number): Set<string> => {
    const words = text.toLowerCase().split(/\s+/);
    const ngrams = new Set<string>();
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.add(words.slice(i, i + n).join(' '));
    }
    return ngrams;
  };

  const ngramsA = getNgrams(contentA, 3);
  const ngramsB = getNgrams(contentB, 3);

  if (ngramsA.size === 0 || ngramsB.size === 0) return 0;

  let intersection = 0;
  for (const gram of ngramsA) {
    if (ngramsB.has(gram)) intersection++;
  }

  const union = ngramsA.size + ngramsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}
