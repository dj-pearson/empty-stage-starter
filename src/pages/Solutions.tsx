import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SEOHead } from '@/components/SEOHead';
import { BreadcrumbSchema } from '@/components/schema/BreadcrumbSchema';
import { solutionPages, solutionPath } from '@/lib/solutions-content';

/**
 * /solutions -- index of the situation pages.
 *
 * Also the internal-link hub for the cluster, the same way /compare is for the
 * comparison pages: the footer and the guides index point here, so a new
 * situation page inherits its crawl path by being added to
 * src/lib/solutions-content.ts rather than by remembering to link it in three
 * places.
 */
export default function Solutions() {
  return (
    <>
      <SEOHead
        title="Meal planning for your situation | EatPal"
        description="Pages for the feeding situations EatPal is actually built for: ARFID, autistic and sensory-sensitive eaters, and households feeding several kids with different safe foods."
        keywords="ARFID meal planning, autism feeding, sensory food aversion, meal planning for several kids, picky eater app"
        canonicalUrl="https://tryeatpal.com/solutions"
      />
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://tryeatpal.com/' },
          { name: 'Solutions', url: 'https://tryeatpal.com/solutions' },
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
            Which situation are you in?
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            &quot;Picky eating&quot; covers a toddler refusing broccoli and a nine-year-old who has
            eaten the same four foods for two years. Those need different answers, and the pages
            below say which parts of EatPal apply to each one.
          </p>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Each page also lists what the app does not do for that situation. There are audiences
            missing from this list on purpose: if a page is not here, the feature behind it is not
            built yet.
          </p>

          <ul className="mt-12 space-y-4">
            {solutionPages.map((page) => (
              <li key={page.slug}>
                <Link
                  to={solutionPath(page.slug)}
                  className="group flex items-start justify-between gap-6 rounded-xl border p-6 transition-colors hover:bg-muted/40"
                >
                  <span>
                    <span className="block font-heading text-xl font-semibold">{page.title}</span>
                    <span className="mt-2 block text-muted-foreground">{page.summary}</span>
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
              Not sure which one you are reading about?
            </h2>
            <p className="mt-3 text-muted-foreground">
              The quiz sorts ordinary selective eating from sensory-driven refusal and from the
              pattern that needs a clinician, and it is free.
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
