import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SEOHead } from '@/components/SEOHead';
import { BreadcrumbSchema } from '@/components/schema/BreadcrumbSchema';
import { FAQSchema } from '@/components/schema/FAQSchema';
import { ARFID_PAGES, getArfidPage } from '@/lib/arfid-content';
import NotFound from '@/pages/NotFound';

/**
 * /arfid/:slug -- the ARFID cluster.
 *
 * The biggest gap between what EatPal is about and what it ranks for. "arfid eating",
 * "arfid food disorder" and "avoidant restrictive food intake disorder arfid" each sit
 * in the 50,000/month tier at Low competition, and Search Console shows the site ranking
 * for none of them. Content and the rules it follows live in src/lib/arfid-content.ts;
 * this file only renders it.
 *
 * Structurally this is MealIdeasPage: direct answer first because assistants quote the
 * sentence that answers the question, FAQPage markup over FAQs that are visibly on the
 * page, and an unknown slug rendering the real NotFound rather than a thin shell Google
 * would index.
 *
 * The one addition is careNote, rendered on every page and required by the type. This is
 * copy about an eating disorder aimed at people deciding whether to seek care, and the
 * line separating a meal planning tool from treatment is not something to leave to
 * whoever writes the next page.
 */
export default function ArfidPage() {
  const { slug } = useParams<{ slug: string }>();
  const page = getArfidPage(slug);

  if (!page) return <NotFound />;

  const canonical = `https://tryeatpal.com/arfid/${page.slug}`;
  const related = page.related
    .map((relatedSlug) => ARFID_PAGES.find((candidate) => candidate.slug === relatedSlug))
    .filter((candidate): candidate is (typeof ARFID_PAGES)[number] => Boolean(candidate));

  return (
    <>
      <SEOHead
        title={`${page.title} | EatPal`}
        description={page.metaDescription}
        canonicalUrl={canonical}
        ogType="article"
        aiPurpose={page.answer}
        aiAudience="Parents of children with ARFID or suspected ARFID, and adults with ARFID, looking for what it is, how it differs from picky eating, and when to seek an assessment"
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

          {page.sections.map((section) => (
            <section key={section.heading} className="mt-12">
              <h2 className="font-heading text-2xl font-bold">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-3 leading-relaxed text-muted-foreground">
                  {paragraph}
                </p>
              ))}
              {section.bullets && (
                <ul className="mt-4 space-y-2">
                  {section.bullets.map((bullet) => (
                    <li key={bullet} className="leading-relaxed">
                      {bullet}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {/* Required on every page in this cluster; see arfid-content.ts rule 1. */}
          <p className="mt-12 rounded-lg bg-muted p-6 leading-relaxed">{page.careNote}</p>

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
                  Five days of meals built around the foods already accepted.
                </p>
              </li>
              <li>
                <Link to="/budget-calculator" className="font-semibold text-primary hover:underline">
                  Grocery budget calculator
                </Link>
                <p className="mt-1 text-sm text-muted-foreground">
                  What a week costs when half the list is safe foods.
                </p>
              </li>
            </ul>
          </div>

          {related.length > 0 && (
            <nav className="mt-12" aria-label="More on ARFID">
              <h2 className="font-heading text-2xl font-bold">More on ARFID</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {related.map((item) => (
                  <li key={item.slug}>
                    <Link
                      to={`/arfid/${item.slug}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {item.h1}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    to="/picky-eater/dinner-ideas"
                    className="font-semibold text-primary hover:underline"
                  >
                    Dinner ideas for picky eaters
                  </Link>
                </li>
              </ul>
            </nav>
          )}
        </main>
      </div>
    </>
  );
}
