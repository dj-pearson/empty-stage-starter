import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SEOHead } from '@/components/SEOHead';
import { BreadcrumbSchema } from '@/components/schema/BreadcrumbSchema';
import { FAQSchema } from '@/components/schema/FAQSchema';
import { getMealIdeasPage, MEAL_IDEAS_PAGES } from '@/lib/meal-ideas-content';
import NotFound from '@/pages/NotFound';

/**
 * /picky-eater/:slug -- the meal-occasion cluster.
 *
 * These pages target the largest commercial keyword group in this niche, and the one
 * the site ranked for nowhere: roughly forty phrases at the 5,000/month tier built on
 * "[meal] for picky eaters" and its "fussy eaters" counterpart. The content and the
 * rules it follows live in src/lib/meal-ideas-content.ts; this file only renders it.
 *
 * The page is ordered for extraction as much as for reading. The direct answer is the
 * first thing under the h1, because assistants quote the sentence that answers the
 * question and the existing blog posts bury theirs under an anecdote. The FAQ block
 * carries FAQPage markup for the same reason.
 *
 * An unrecognised slug renders NotFound rather than an empty shell, matching
 * ComparisonPage: a guessed URL should get the real 404 with its noindex head, not a
 * thin page Google will index.
 */
export default function MealIdeasPage() {
  const { slug } = useParams<{ slug: string }>();
  const page = getMealIdeasPage(slug);

  if (!page) return <NotFound />;

  const canonical = `https://tryeatpal.com/picky-eater/${page.slug}`;
  const related = page.related
    .map((relatedSlug) => MEAL_IDEAS_PAGES.find((candidate) => candidate.slug === relatedSlug))
    .filter((candidate): candidate is (typeof MEAL_IDEAS_PAGES)[number] => Boolean(candidate));

  return (
    <>
      <SEOHead
        title={`${page.title} | EatPal`}
        description={page.metaDescription}
        canonicalUrl={canonical}
        ogType="article"
        aiPurpose={page.answer}
        aiAudience="Parents of picky eaters and fussy eaters looking for meal ideas that work with a narrow accepted food list, including families managing ARFID"
      />
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://tryeatpal.com/' },
          { name: page.h1, url: canonical },
        ]}
      />
      <FAQSchema faqs={page.faqs} />

      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-sm">
          <div className="container mx-auto flex items-center justify-between px-4 py-4">
            <Link to="/" className="flex items-center gap-2" aria-label="EatPal home">
              <img src="/Logo-Green.webp" alt="EatPal" className="block h-8 dark:hidden" />
              <img src="/Logo-White.webp" alt="EatPal" className="hidden h-8 dark:block" />
            </Link>
            <Link to="/blog">
              <Button variant="ghost" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                All articles
              </Button>
            </Link>
          </div>
        </header>

        <main id="main-content" className="container mx-auto max-w-3xl px-4 py-12">
          <h1 className="font-heading text-4xl font-bold text-primary md:text-5xl">{page.h1}</h1>

          {/* The direct answer, first. See the note at the top of this file. */}
          <p className="mt-6 border-l-2 border-primary pl-4 text-lg font-medium leading-relaxed">
            {page.answer}
          </p>

          {page.intro.map((paragraph) => (
            <p key={paragraph} className="mt-4 leading-relaxed text-muted-foreground">
              {paragraph}
            </p>
          ))}

          <h2 className="mt-12 font-heading text-2xl font-bold">Start from a food they already eat</h2>
          <p className="mt-2 text-muted-foreground">
            Each group below begins with an accepted food and ends with one small step out from
            it. Change one attribute at a time and keep the rest the same.
          </p>

          {page.groups.map((group) => (
            <section key={group.anchor} className="mt-8">
              <h3 className="font-heading text-xl font-semibold text-primary">{group.anchor}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{group.why}</p>
              <ul className="mt-3 space-y-2">
                {group.ideas.map((idea) => (
                  <li key={idea} className="leading-relaxed">
                    {idea}
                  </li>
                ))}
              </ul>
              <p className="mt-3 rounded-lg bg-primary/5 p-4 text-sm">
                <strong className="font-semibold">One step out: </strong>
                {group.nextStep}
              </p>
            </section>
          ))}

          <h2 className="mt-12 font-heading text-2xl font-bold">What to do instead</h2>
          <dl className="mt-4 space-y-5">
            {page.insteadOf.map((item) => (
              <div key={item.dont}>
                <dt className="font-semibold">{item.dont}</dt>
                <dd className="mt-1 leading-relaxed text-muted-foreground">{item.instead}</dd>
              </div>
            ))}
          </dl>

          <h2 className="mt-12 font-heading text-2xl font-bold">Common questions</h2>
          <dl className="mt-4 space-y-5">
            {page.faqs.map((faq) => (
              <div key={faq.question}>
                <dt className="font-semibold">{faq.question}</dt>
                <dd className="mt-1 leading-relaxed text-muted-foreground">{faq.answer}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-12 rounded-xl bg-primary/5 p-8">
            <h2 className="font-heading text-xl font-bold">Free tools for this</h2>
            <p className="mt-2 text-muted-foreground">No account needed for any of these.</p>
            <ul className="mt-4 grid list-none gap-4 p-0 sm:grid-cols-3">
              <li>
                <Link to="/picky-eater-quiz" className="font-semibold text-primary hover:underline">
                  Picky eater quiz
                </Link>
                <p className="mt-1 text-sm text-muted-foreground">
                  Two minutes to identify which eating pattern you are dealing with.
                </p>
              </li>
              <li>
                <Link to="/meal-plan" className="font-semibold text-primary hover:underline">
                  Meal plan generator
                </Link>
                <p className="mt-1 text-sm text-muted-foreground">
                  Five days of meals built around the foods your child already accepts.
                </p>
              </li>
              <li>
                <Link
                  to="/budget-calculator"
                  className="font-semibold text-primary hover:underline"
                >
                  Grocery budget calculator
                </Link>
                <p className="mt-1 text-sm text-muted-foreground">
                  What a week costs when half the list is safe foods.
                </p>
              </li>
            </ul>
          </div>

          {related.length > 0 && (
            <nav className="mt-12" aria-label="Related meal ideas">
              <h2 className="font-heading text-2xl font-bold">More meal ideas</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {related.map((item) => (
                  <li key={item.slug}>
                    <Link
                      to={`/picky-eater/${item.slug}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {item.h1}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </main>
      </div>
    </>
  );
}
