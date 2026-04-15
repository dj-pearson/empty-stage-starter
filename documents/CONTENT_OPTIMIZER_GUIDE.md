# Content Optimizer - Complete Guide

## Overview

The **Content Optimizer** is an AI-powered tool that provides detailed, actionable suggestions to optimize your content for SEO. Unlike basic content analysis tools, this provides specific before/after examples, LSI keywords, semantic analysis, and content gap identification.

## Features

### 1. AI Content Optimization
- **Title Optimization**: Get specific rewrite suggestions for your page title with character count optimization (50-60 chars)
- **Meta Description**: Receive compelling meta descriptions optimized for CTR (150-160 chars)
- **Heading Improvements**: H1, H2, H3 optimization with keyword placement suggestions
- **Content Structure**: Recommendations for sections to add, expand, rewrite, or remove
- **Key Rewrites**: Specific text rewrite suggestions with before/after examples

### 2. LSI Keywords
- **Latent Semantic Indexing**: Get semantically related keywords that add context and depth
- **Relevance Scoring**: Each keyword is scored as high/medium/low relevance
- **Placement Guidance**: Specific suggestions on where and how to use each keyword
- **Mention Tracking**: See current mentions vs. suggested mentions

### 3. Semantic Analysis
- **Entity Extraction**: Identify important people, places, organizations, and concepts
- **Topic Clusters**: Group related concepts and assess coverage
- **Semantic Gaps**: Find missing related terms that should be included
- **Search Intent**: Classify content intent (informational/commercial/transactional)

### 4. Content Gap Analysis
- **Competitor Comparison**: Analyze up to 3 competitor URLs
- **Missing Topics**: Identify topics covered by competitors but missing from your content
- **Priority Ranking**: Each gap is marked as high/medium/low priority
- **Implementation Guidance**: Specific suggestions on how to fill each gap

## How to Use

### Basic Content Optimization

1. Navigate to **Admin Panel → SEO Manager → Content Optimizer**

2. Enter the URL you want to analyze:
   ```
   https://example.com/your-page
   ```

3. (Optional) Enter a target keyword:
   ```
   content marketing strategy
   ```

4. (Optional) Add competitor URLs (one per line, up to 3):
   ```
   https://competitor1.com/page
   https://competitor2.com/page
   https://competitor3.com/page
   ```

5. Click **"Analyze Content"** to get comprehensive optimization suggestions

### Semantic Keyword Analysis

1. Enter your page URL and target keyword (same as above)

2. Click **"Semantic Analysis"** to get:
   - LSI keywords with usage context
   - Entity extraction (people, places, organizations)
   - Topic clusters with coverage analysis
   - Semantic gaps with inclusion suggestions
   - Search intent classification

## Understanding the Results

### Optimization Score (0-100)
- **90-100**: Excellent - Minor tweaks only
- **70-89**: Good - Some improvements needed
- **50-69**: Fair - Significant optimization required
- **0-49**: Poor - Major overhaul needed

### Priority Actions
The top 3-5 most important actions to take immediately, ranked by impact.

### Before/After Examples
All suggestions include:
- **Current**: What you have now (highlighted in red)
- **Suggested**: AI-optimized version (highlighted in green)
- **Reasoning**: Why this change improves SEO

### Copy to Clipboard
Click the copy button on any suggestion to copy the optimized text directly.

## Best Practices

### 1. Start with High-Priority Actions
Focus on the "Priority Actions" section first - these have the highest SEO impact.

### 2. Implement Gradually
Don't change everything at once. Implement 2-3 suggestions, monitor results, then continue.

### 3. Keep Your Brand Voice
AI suggestions are guidelines. Adjust them to match your brand voice while keeping SEO principles.

### 4. Re-analyze After Changes
After implementing suggestions, run the analysis again to see your improved score.

### 5. Use Competitor Analysis
Always include 2-3 competitor URLs for the most comprehensive content gap analysis.

## Technical Details

### Supabase Edge Functions

#### 1. `optimize-page-content`
**Purpose**: Comprehensive content optimization with AI-powered suggestions

**Request Body**:
```json
{
  "url": "https://example.com/page",
  "targetKeyword": "content marketing",
  "competitorUrls": ["https://competitor.com/page"],
  "includeContentGapAnalysis": true
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "url": "https://example.com/page",
    "optimizations": {
      "titleOptimization": {...},
      "metaDescriptionOptimization": {...},
      "headingOptimizations": [...],
      "lsiKeywords": [...],
      "semanticClusters": [...],
      "contentGaps": [...],
      "structureImprovements": [...],
      "keyRewriteSuggestions": [...],
      "overallScore": 85,
      "priorityActions": [...]
    },
    "id": "uuid"
  }
}
```

#### 2. `analyze-semantic-keywords`
**Purpose**: Deep semantic analysis for LSI keywords and entities

**Request Body**:
```json
{
  "url": "https://example.com/page",
  "targetKeyword": "content marketing"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "url": "https://example.com/page",
    "analysis": {
      "lsiKeywords": [...],
      "entities": [...],
      "topicClusters": [...],
      "semanticGaps": [...],
      "intentSignals": {...},
      "overallSemanticScore": 78,
      "topRecommendations": [...]
    },
    "id": "uuid"
  }
}
```

### Database Schema

#### `seo_content_optimization` Table
Stores content optimization results:
- `page_url`: URL analyzed
- `target_keyword`: Target keyword (optional)
- `current_title`: Current page title
- `suggested_title`: AI-suggested optimized title
- `current_meta_description`: Current meta description
- `suggested_meta_description`: AI-suggested meta description
- `heading_optimizations`: JSONB array of heading suggestions
- `lsi_keywords`: JSONB array of LSI keywords
- `semantic_clusters`: JSONB array of semantic clusters
- `content_gaps`: JSONB array of content gaps
- `structure_improvements`: JSONB array of structure suggestions
- `key_rewrites`: JSONB array of specific rewrites
- `overall_score`: Overall optimization score (0-100)
- `priority_actions`: JSONB array of top priority actions
- `competitor_urls`: JSONB array of competitor URLs analyzed

#### `seo_semantic_analysis` Table
Stores semantic analysis results:
- `page_url`: URL analyzed
- `target_keyword`: Target keyword (optional)
- `lsi_keywords`: JSONB array of LSI keywords with context
- `entities`: JSONB array of extracted entities
- `topic_clusters`: JSONB array of topic clusters
- `semantic_gaps`: JSONB array of missing terms
- `intent_signals`: JSONB object with intent analysis
- `semantic_score`: Overall semantic score (0-100)
- `top_recommendations`: JSONB array of top recommendations

## AI Model Configuration

The Content Optimizer uses your configured AI model from the `ai_settings` table. It supports:
- **OpenAI** (GPT-4o, GPT-4o-mini, etc.)
- **Anthropic** (Claude Sonnet, Claude Opus, etc.)
- **Other OpenAI-compatible APIs**

To configure:
1. Go to **Admin Panel → AI Settings**
2. Set your preferred model
3. Configure API key via environment variables

## Example Workflow

### Optimizing a Blog Post

1. **Initial Analysis**
   ```
   URL: https://example.com/blog/content-marketing-guide
   Keyword: content marketing strategy
   Competitors:
   - https://hubspot.com/content-marketing
   - https://semrush.com/blog/content-marketing/
   ```

2. **Review Results**
   - Overall Score: 72/100 (Good, but can improve)
   - Priority Actions:
     1. Improve title from 45 to 57 characters
     2. Add LSI keyword "content distribution" 3 times
     3. Create new section on "Content Performance Metrics"

3. **Implement Changes**
   - Copy suggested title: "Complete Content Marketing Strategy Guide: From Planning to ROI"
   - Add LSI keywords naturally throughout
   - Write new section on performance metrics

4. **Re-analyze**
   - New Score: 89/100 (Excellent!)
   - SEO impact: Improved topical relevance and keyword coverage

## Troubleshooting

### "Failed to optimize content"
- **Cause**: URL is unreachable or AI API key not configured
- **Solution**: Check URL accessibility and verify API key in environment variables

### "No content received from AI"
- **Cause**: AI API returned empty response
- **Solution**: Check AI model configuration and API quotas

### Low Optimization Score (<50)
- **Cause**: Content needs significant improvements
- **Solution**: Focus on Priority Actions first, implement high-priority suggestions

### Semantic Analysis Shows Many Gaps
- **Cause**: Content lacks topical depth
- **Solution**: Expand content with suggested topics, add more context

## Advanced Features

### Custom Prompts
The AI prompts can be customized by modifying the Edge Functions:
- `/supabase/functions/optimize-page-content/index.ts`
- `/supabase/functions/analyze-semantic-keywords/index.ts`

### Batch Analysis
For analyzing multiple pages:
1. Export page URLs to CSV
2. Use the Supabase Functions API directly
3. Loop through URLs and collect results

### Automated Monitoring
Set up scheduled jobs to:
- Re-analyze key pages monthly
- Alert when scores drop below threshold
- Track optimization progress over time

## Integration Examples

### Using with CI/CD
```bash
# Analyze before deployment
curl -X POST 'https://your-project.supabase.co/functions/v1/optimize-page-content' \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://staging.example.com/page",
    "targetKeyword": "your keyword"
  }'
```

### Programmatic Access
```typescript
import { supabase } from './supabaseClient';

async function optimizeContent(url: string, keyword: string) {
  const { data, error } = await supabase.functions.invoke('optimize-page-content', {
    body: {
      url,
      targetKeyword: keyword,
      competitorUrls: [],
      includeContentGapAnalysis: false
    }
  });

  if (error) throw error;
  return data.data.optimizations;
}
```

## Conclusion

The Content Optimizer provides enterprise-grade SEO analysis and suggestions without expensive third-party tools. Use it regularly to:
- Improve content quality and relevance
- Increase topical authority
- Identify and fill content gaps
- Optimize for target keywords
- Stay competitive with semantic SEO

For support or feature requests, contact the development team.
