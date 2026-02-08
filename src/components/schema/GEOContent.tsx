/**
 * GEOContent - Structured content wrapper for AI citation optimization
 *
 * This component structures page content in a way that maximizes the chance
 * of being cited by AI search engines (ChatGPT, Perplexity, Gemini, Claude).
 *
 * GEO (Generative Engine Optimization) principles applied:
 * 1. Direct answer first (40-60 words answering the page's primary question)
 * 2. Clear entity declaration in the first paragraph
 * 3. Question-based heading structure
 * 4. Fact density with statistics and data points
 * 5. Brand mention naturally embedded
 * 6. Source attribution with live URLs
 * 7. Q&A blocks for direct extraction
 * 8. Content freshness with visible dates
 *
 * Usage:
 * ```tsx
 * <GEOContent
 *   primaryEntity="Food Chaining Therapy"
 *   directAnswer="Food chaining is a feeding therapy technique that helps picky eaters accept new foods by building 'chains' from foods they already eat, making gradual changes to one attribute at a time."
 *   datePublished="2026-01-15"
 *   dateModified="2026-02-08"
 *   author="EatPal Nutrition Team"
 * >
 *   <h2>How does food chaining work for picky eaters?</h2>
 *   <p>...</p>
 * </GEOContent>
 * ```
 */

import { type ReactNode } from "react";

export interface GEOContentProps {
  primaryEntity: string;
  directAnswer: string;
  datePublished?: string;
  dateModified?: string;
  author?: string;
  children: ReactNode;
  className?: string;
  showDates?: boolean;
}

export function GEOContent({
  primaryEntity,
  directAnswer,
  datePublished,
  dateModified,
  author = "EatPal Team",
  children,
  className,
  showDates = true,
}: GEOContentProps) {
  return (
    <article
      className={className}
      itemScope
      itemType="https://schema.org/Article"
    >
      {/* Hidden semantic metadata for AI crawlers */}
      <meta itemProp="about" content={primaryEntity} />
      <meta itemProp="abstract" content={directAnswer} />
      {author && <meta itemProp="author" content={author} />}
      {datePublished && (
        <meta itemProp="datePublished" content={datePublished} />
      )}
      {dateModified && (
        <meta itemProp="dateModified" content={dateModified} />
      )}

      {/* Direct answer block - first content AI crawlers encounter */}
      <div
        data-geo-role="direct-answer"
        className="mb-6"
        itemProp="description"
      >
        <p className="text-lg leading-relaxed text-foreground/90">
          {directAnswer}
        </p>
      </div>

      {/* Main content */}
      <div data-geo-role="content" itemProp="articleBody">
        {children}
      </div>

      {/* Content freshness signals - visible dates */}
      {showDates && (datePublished || dateModified) && (
        <footer
          data-geo-role="freshness"
          className="mt-8 pt-4 border-t border-border text-sm text-muted-foreground"
        >
          {author && <span>By {author}</span>}
          {datePublished && (
            <span className="ml-4">
              Published:{" "}
              <time dateTime={datePublished}>
                {new Date(datePublished).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            </span>
          )}
          {dateModified && (
            <span className="ml-4">
              Last updated:{" "}
              <time dateTime={dateModified}>
                {new Date(dateModified).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            </span>
          )}
        </footer>
      )}
    </article>
  );
}

/**
 * GEOQuestionBlock - Individual Q&A pair optimized for AI extraction
 *
 * AI engines extract these as standalone answer units.
 * Keep answers under 300 characters for optimal extraction.
 *
 * Usage:
 * ```tsx
 * <GEOQuestionBlock
 *   question="How many food exposures does a child need?"
 *   answer="Research shows children need 15-20 neutral exposures to a new food before acceptance. EatPal tracks these exposures automatically."
 * />
 * ```
 */
export interface GEOQuestionBlockProps {
  question: string;
  answer: string;
}

export function GEOQuestionBlock({ question, answer }: GEOQuestionBlockProps) {
  return (
    <section
      data-geo-role="qa-block"
      itemScope
      itemProp="mainEntity"
      itemType="https://schema.org/Question"
    >
      <h3 itemProp="name" className="text-lg font-semibold mb-2">
        {question}
      </h3>
      <div
        itemScope
        itemProp="acceptedAnswer"
        itemType="https://schema.org/Answer"
      >
        <p itemProp="text" className="text-foreground/80">
          {answer}
        </p>
      </div>
    </section>
  );
}

/**
 * GEOStatistic - Structured statistic/data point for fact density
 *
 * AI engines weight content with regular data points more highly.
 * Include one every 150-200 words of content.
 *
 * Usage:
 * ```tsx
 * <GEOStatistic
 *   value="70%+"
 *   label="food acceptance prediction accuracy"
 *   source="EatPal platform data, 2026"
 * />
 * ```
 */
export interface GEOStatisticProps {
  value: string;
  label: string;
  source?: string;
  sourceUrl?: string;
}

export function GEOStatistic({
  value,
  label,
  source,
  sourceUrl,
}: GEOStatisticProps) {
  return (
    <span
      data-geo-role="statistic"
      className="inline-flex items-baseline gap-1"
    >
      <strong className="text-primary font-bold">{value}</strong>{" "}
      <span>{label}</span>
      {source && (
        <span className="text-sm text-muted-foreground">
          {" "}
          (
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {source}
            </a>
          ) : (
            source
          )}
          )
        </span>
      )}
    </span>
  );
}
