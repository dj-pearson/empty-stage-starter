/**
 * SEO-specific TypeScript types
 */

export interface SEOMetrics {
  score: number;
  loadTime?: number;
  mobileScore?: number;
  desktopScore?: number;
  timestamp: string;
}

export interface KeywordPosition {
  keyword: string;
  position: number;
  url: string;
  previousPosition?: number;
  change?: number;
  volume?: number;
}

export interface BrokenLink {
  url: string;
  statusCode: number;
  foundOn: string[];
  message?: string;
}

export interface DuplicateContent {
  url1: string;
  url2: string;
  similarity: number;
  content?: string;
}

export interface RedirectChain {
  url: string;
  redirects: string[];
  finalUrl: string;
  statusCodes: number[];
}

export interface StructuredDataError {
  type: string;
  message: string;
  element?: string;
  severity: 'error' | 'warning';
}

export interface InternalLink {
  fromUrl: string;
  toUrl: string;
  anchorText: string;
  isFollowed: boolean;
}

export interface ImageAnalysis {
  url: string;
  alt?: string;
  size: number;
  dimensions?: { width: number; height: number };
  issues: string[];
}

export interface MobileFriendliness {
  isMobileFriendly: boolean;
  issues: string[];
  viewport?: string;
  fontSizes?: number[];
}

export interface CoreWebVitals {
  lcp: number; // Largest Contentful Paint
  fid: number; // First Input Delay
  cls: number; // Cumulative Layout Shift
  fcp?: number; // First Contentful Paint
  ttfb?: number; // Time to First Byte
}

export interface BacklinkData {
  sourceUrl: string;
  targetUrl: string;
  anchorText: string;
  domainAuthority?: number;
  pageAuthority?: number;
  isFollowed: boolean;
  firstSeen?: string;
}

export interface SEOAuditComplete {
  id?: string;
  url: string;
  timestamp: string;
  overallScore: number;
  metrics: SEOMetrics;
  issues: SEOIssue[];
  suggestions: string[];
  brokenLinks?: BrokenLink[];
  duplicateContent?: DuplicateContent[];
  redirectChains?: RedirectChain[];
  structuredDataErrors?: StructuredDataError[];
  internalLinks?: InternalLink[];
  images?: ImageAnalysis[];
  mobileFriendliness?: MobileFriendliness;
  coreWebVitals?: CoreWebVitals;
}

export interface SEOIssue {
  type: 'error' | 'warning' | 'info';
  category: string;
  description: string;
  element?: string;
  recommendation: string;
  severity?: number;
}

export interface CrawlResult {
  url: string;
  statusCode: number;
  title?: string;
  metaDescription?: string;
  h1?: string[];
  canonicalUrl?: string;
  indexable: boolean;
  crawledAt: string;
}

export interface SEOFormData {
  url: string;
  includeBacklinks?: boolean;
  checkMobile?: boolean;
  depth?: number;
}

export interface PerformanceBudget {
  metric: string;
  budget: number;
  actual: number;
  status: 'pass' | 'fail' | 'warning';
}

export interface CrawlResultsSummary {
  summary: {
    totalPages: number;
    pagesWithIssues: number;
    orphanedPages: number;
    avgLoadTime: number;
    issueBreakdown: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
  };
}

export interface ImageResultsSummary {
  summary: {
    totalImages: number;
    imagesWithoutAlt: number;
    oversizedImages: number;
    totalSize: number;
    avgSize: number;
    lazyLoadedImages: number;
  };
}

export interface RedirectResultsSummary {
  redirectChains: Array<{
    source: string;
    destination: string;
    statusCode: number;
    chainLength: number;
  }>;
}

export interface RedirectAnalysisResults {
  totalRedirects: number;
  chains: number;
  maxChainLength: number;
  total404s: number;
  avgChainLength?: number;
  totalIssues: number;
}

export interface DuplicateAnalysisResults {
  totalPages: number;
  exactDuplicates: number;
  nearDuplicates: number;
  similarPages: number;
  thinContent: number;
  avgWordCount: number;
}

export interface SecurityAnalysisResults {
  securityScore: number;
  protocol: string;
  isHttps: boolean;
  criticalIssues: number;
  checks?: Array<{
    name: string;
    status: string;
    message?: string;
  }>;
}

export interface LinkStructureResults {
  summary: {
    totalPages: number;
    totalInternalLinks: number;
    orphanedPages: number;
    pagesWithNoOutgoingLinks: number;
    pagesWithNoIncomingLinks: number;
    avgPageRank?: number;
  };
}

export interface MobileAnalysisResults {
  summary: {
    mobileScore: number;
    hasViewport: boolean;
    isTouchFriendly: boolean;
    hasResponsiveImages: boolean;
    hasMobileFonts: boolean;
    issues?: string[];
  };
}

export interface PerformanceBudgetResults {
  score: number;
  passedBudget: boolean;
  totalPageSize: number;
  totalRequests: number;
  thirdPartyResources: number;
  violations?: Array<{
    metric: string;
    message: string;
  }>;
}
