import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SEOHead } from '@/components/SEOHead';
import { BreadcrumbSchema } from '@/components/schema/BreadcrumbSchema';
import { comparisonPages, comparisonPath } from '@/lib/comparison-content';

/**
 * /compare -- index of the EatPal vs X pages.
 *
 * Also the internal-link hub for the cluster: every comparison page links back
 * here, and this is what /pricing, the guides index and the footer point at, so
 * a new competitor page inherits the links by being added to comparisonTargets.
 */
export default function Compare() {
  return (
    <>
      <SEOHead
        title="Compare EatPal with other meal planning apps | EatPal"
        description="Honest comparisons between EatPal and the meal planning, recipe and feeding-therapy tools families actually consider. Each one says where the other tool is the better choice."
        keywords="eatpal alternatives, picky eater app comparison, ARFID meal planner comparison, meal planning app for kids"
        canonicalUrl="https://tryeatpal.com/compare"
      />
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://tryeatpal.com/' },
          { name: 'Compare', url: 'https://tryeatpal.com/compare' },
        ]}
      />

      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-sm">
          <div className="container mx-auto flex items-center justify-between px-4 py-4">
            <Link to="/" className="flex items-center gap-2">
              <img src="/Logo-Green.webp" alt="EatPal" className="block h-8 dark:hidden" />
              <img src="/Logo-White.webp" alt="EatPal" className="hidden h-8 dark:block" />
            </Link>
            <Link to="/">
              <Button variant="ghost" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to home
              </Button>
            </Link>
          </div>
        </header>

        <main id="main-content" className="container mx-auto max-w-3xl px-4 py-12">
          <h1 className="font-heading text-4xl font-bold text-primary md:text-5xl">
            How EatPal compares
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            Most meal planning apps are built for households that eat a normal range of food. EatPal
            is built for a child who eats six things. That difference decides most of these
            comparisons, and it means the answer is sometimes the other product.
          </p>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Every page below names at least one thing the other tool does better, and none of them
            quote a competitor&apos;s price, because those change faster than a page can be kept
            honest.
          </p>

          <ul className="mt-12 space-y-4">
            {comparisonPages.map((page) => (
              <li key={page.slug}>
                <Link
                  to={comparisonPath(page.slug)}
                  className="group flex items-start justify-between gap-6 rounded-xl border p-6 transition-colors hover:bg-muted/40"
                >
                  <span>
                    <span className="block font-heading text-xl font-semibold">
                      EatPal vs {page.competitor}
                    </span>
                    <span className="mt-2 block text-muted-foreground">{page.differentiator}</span>
                  </span>
                  <ArrowRight
                    className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>

          <section aria-labelledby="not-sure" className="mt-16 rounded-xl bg-muted/40 p-8">
            <h2 id="not-sure" className="font-heading text-2xl font-semibold">
              Not sure which problem you have?
            </h2>
            <p className="mt-3 text-muted-foreground">
              Ordinary picky eating, sensory-driven refusal and ARFID need different responses. The
              quiz sorts that out before you commit to any tool, including this one.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/picky-eater-quiz">
                <Button size="lg">Take the picky eater quiz</Button>
              </Link>
              <Link to="/guides">
                <Button size="lg" variant="outline">
                  Browse the guides
                </Button>
              </Link>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
