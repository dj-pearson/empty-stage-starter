import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SEOHead } from '@/components/SEOHead';
import { BreadcrumbSchema } from '@/components/schema/BreadcrumbSchema';
import { ComparisonSchema } from '@/components/schema/ComparisonSchema';
import { comparisonCanonical, eatpalSchemaItem, getComparison } from '@/lib/comparison-content';
import NotFound from '@/pages/NotFound';

/**
 * /compare/:slug -- one honest EatPal vs X page per entry in comparisonTargets.
 *
 * The content, and the rules it has to follow, live in
 * src/lib/comparison-content.ts. This file only renders it.
 *
 * An unrecognised slug renders NotFound rather than an empty shell, so a stale
 * link or a guessed URL gets the real 404 page with its noindex head instead of
 * a thin page that Google will happily index.
 */
export default function ComparisonPage() {
  const { slug } = useParams<{ slug: string }>();
  const page = getComparison(slug);

  if (!page) return <NotFound />;

  const competitorFeatures = page.rows.map((row) => row.dimension);

  return (
    <>
      <SEOHead
        title={`${page.title} | EatPal`}
        description={`${page.competitorSummary} Here is how it compares with EatPal on ${page.rows.length} points, including where ${page.competitor} is the better choice.`}
        keywords={`eatpal vs ${page.competitor.toLowerCase()}, ${page.competitor.toLowerCase()} alternative, picky eater meal planning app, ARFID meal planner`}
        canonicalUrl={comparisonCanonical(page.slug)}
        ogType="article"
      />
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://tryeatpal.com/' },
          { name: 'Compare', url: 'https://tryeatpal.com/compare' },
          { name: page.title, url: comparisonCanonical(page.slug) },
        ]}
      />
      <ComparisonSchema
        listName={page.title}
        description={page.differentiator}
        items={[
          eatpalSchemaItem,
          {
            name: page.competitor,
            description: page.competitorSummary,
            ...(page.competitorUrl ? { url: page.competitorUrl } : {}),
            features: competitorFeatures,
          },
        ]}
      />

      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-sm">
          <div className="container mx-auto flex items-center justify-between px-4 py-4">
            <Link to="/" className="flex items-center gap-2">
              <img src="/Logo-Green.webp" alt="EatPal" className="block h-8 dark:hidden" />
              <img src="/Logo-White.webp" alt="EatPal" className="hidden h-8 dark:block" />
            </Link>
            <Link to="/compare">
              <Button variant="ghost" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                All comparisons
              </Button>
            </Link>
          </div>
        </header>

        <main id="main-content" className="container mx-auto max-w-3xl px-4 py-12">
          <h1 className="font-heading text-4xl font-bold text-primary md:text-5xl">{page.title}</h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            {page.competitorSummary}
          </p>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{page.verdict}</p>

          <section aria-labelledby="side-by-side" className="mt-14">
            <h2 id="side-by-side" className="font-heading text-2xl font-semibold">
              Side by side
            </h2>
            <div className="mt-6 overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
                <caption className="sr-only">
                  EatPal compared with {page.competitor} across {page.rows.length} dimensions
                </caption>
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th scope="col" className="px-4 py-3 font-semibold">
                      <span className="sr-only">What is being compared</span>
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      EatPal
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      {page.competitor}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((row) => (
                    <tr key={row.dimension} className="border-b last:border-b-0 align-top">
                      <th scope="row" className="px-4 py-4 font-medium">
                        {row.dimension}
                      </th>
                      <td className="px-4 py-4 text-muted-foreground">{row.eatpal}</td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {row.competitor}
                        {row.competitorWins && (
                          <span className="mt-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            {page.competitor} wins this one
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Prices are deliberately not listed here. They change often enough that any number on
              this page would be wrong within a quarter.
              {page.competitorUrl ? (
                <>
                  {' '}
                  Check{' '}
                  <a
                    href={page.competitorUrl}
                    className="inline-flex items-center gap-1 underline underline-offset-4"
                    rel="noopener noreferrer nofollow"
                    target="_blank"
                  >
                    {page.competitor}
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>{' '}
                  and{' '}
                  <Link to="/pricing" className="underline underline-offset-4">
                    our pricing page
                  </Link>
                  .
                </>
              ) : (
                <>
                  {' '}
                  Ours is on the{' '}
                  <Link to="/pricing" className="underline underline-offset-4">
                    pricing page
                  </Link>
                  .
                </>
              )}
            </p>
          </section>

          <section aria-labelledby="choose-them" className="mt-14">
            <h2 id="choose-them" className="font-heading text-2xl font-semibold">
              Choose {page.competitor} if
            </h2>
            <ul className="mt-6 space-y-4">
              {page.chooseThemIf.map((reason) => (
                <li key={reason} className="text-muted-foreground leading-relaxed">
                  {reason}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="choose-eatpal" className="mt-14">
            <h2 id="choose-eatpal" className="font-heading text-2xl font-semibold">
              Choose EatPal if
            </h2>
            <ul className="mt-6 space-y-4">
              {page.chooseEatPalIf.map((reason) => (
                <li key={reason} className="text-muted-foreground leading-relaxed">
                  {reason}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="next" className="mt-16 rounded-xl bg-muted/40 p-8">
            <h2 id="next" className="font-heading text-2xl font-semibold">
              Try it on your own child&apos;s food list
            </h2>
            <p className="mt-3 text-muted-foreground">
              The quiz takes a couple of minutes and tells you which feeding pattern you are
              actually dealing with before you pay for anything.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/picky-eater-quiz">
                <Button size="lg">Take the picky eater quiz</Button>
              </Link>
              <Link to="/pricing">
                <Button size="lg" variant="outline">
                  See pricing
                </Button>
              </Link>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
