import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SEOHead } from '@/components/SEOHead';
import { BreadcrumbSchema } from '@/components/schema/BreadcrumbSchema';
import { FAQSchema } from '@/components/schema/FAQSchema';
import { MedicalWebPageSchema } from '@/components/schema/MedicalWebPageSchema';
import { getSolution, solutionCanonical, solutionsDisclaimer } from '@/lib/solutions-content';
import NotFound from '@/pages/NotFound';

/**
 * /solutions/:slug -- one page per audience the product genuinely serves.
 *
 * The content, and the rules it has to follow, live in
 * src/lib/solutions-content.ts. This file only renders it.
 *
 * An unrecognised slug renders NotFound rather than an empty shell. That matters
 * more here than on /compare: /solutions/* used to be a catch-all 301 to /guides,
 * so every stale link in the wild lands on this route and must not become a thin
 * indexable page.
 *
 * Pages carrying `medical` emit MedicalWebPageSchema with no reviewedBy and show
 * the disclaimer in the body. Nobody clinical has read this copy and the page
 * says so.
 */
export default function SolutionPage() {
  const { slug } = useParams<{ slug: string }>();
  const page = getSolution(slug);

  if (!page) return <NotFound />;

  return (
    <>
      <SEOHead
        title={page.metaTitle}
        description={page.metaDescription}
        keywords={page.keywords}
        canonicalUrl={solutionCanonical(page.slug)}
        ogType="article"
      />
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://tryeatpal.com/' },
          { name: 'Solutions', url: 'https://tryeatpal.com/solutions' },
          { name: page.title, url: solutionCanonical(page.slug) },
        ]}
      />
      <FAQSchema faqs={page.faqs.map((faq) => ({ question: faq.question, answer: faq.answer }))} />
      {page.medical && (
        <MedicalWebPageSchema
          name={page.title}
          description={page.metaDescription}
          url={solutionCanonical(page.slug)}
          medicalAudience="CareGiver"
          about={page.medical.about}
          mentions={page.medical.mentions}
        />
      )}

      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-sm">
          <div className="container mx-auto flex items-center justify-between px-4 py-4">
            <Link to="/" className="flex items-center gap-2">
              <img src="/Logo-Green.webp" alt="EatPal" className="block h-8 dark:hidden" />
              <img src="/Logo-White.webp" alt="EatPal" className="hidden h-8 dark:block" />
            </Link>
            <Link to="/solutions">
              <Button variant="ghost" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                All situations
              </Button>
            </Link>
          </div>
        </header>

        <main id="main-content" className="container mx-auto max-w-3xl px-4 py-12">
          <h1 className="font-heading text-4xl font-bold text-primary md:text-5xl">{page.title}</h1>
          {page.intro.map((paragraph) => (
            <p key={paragraph} className="mt-6 text-lg leading-relaxed text-muted-foreground">
              {paragraph}
            </p>
          ))}

          <section aria-labelledby="what-it-does" className="mt-14">
            <h2 id="what-it-does" className="font-heading text-2xl font-semibold">
              What the app actually does here
            </h2>
            <ul className="mt-6 space-y-6">
              {page.capabilities.map((capability) => (
                <li key={capability.name} className="flex gap-3">
                  <Check className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <span>
                    <span className="block font-medium">{capability.name}</span>
                    <span className="mt-1 block leading-relaxed text-muted-foreground">
                      {capability.what}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="what-it-does-not" className="mt-14">
            <h2 id="what-it-does-not" className="font-heading text-2xl font-semibold">
              What it does not do
            </h2>
            <ul className="mt-6 space-y-4">
              {page.limits.map((limit) => (
                <li key={limit} className="leading-relaxed text-muted-foreground">
                  {limit}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="questions" className="mt-14">
            <h2 id="questions" className="font-heading text-2xl font-semibold">
              Questions
            </h2>
            <dl className="mt-6 space-y-6">
              {page.faqs.map((faq) => (
                <div key={faq.question}>
                  <dt className="font-medium">{faq.question}</dt>
                  <dd className="mt-1 leading-relaxed text-muted-foreground">{faq.answer}</dd>
                </div>
              ))}
            </dl>
          </section>

          {page.medical && (
            <section
              aria-labelledby="disclaimer"
              className="mt-14 rounded-xl border border-primary/20 bg-primary/5 p-6"
            >
              <h2 id="disclaimer" className="font-heading text-lg font-semibold">
                About this page
              </h2>
              <p className="mt-2 leading-relaxed text-muted-foreground">{solutionsDisclaimer}</p>
            </section>
          )}

          <section aria-labelledby="next" className="mt-16 rounded-xl bg-muted/40 p-8">
            <h2 id="next" className="font-heading text-2xl font-semibold">
              Start with your own child&apos;s food list
            </h2>
            <p className="mt-3 text-muted-foreground">
              The quiz takes a couple of minutes and tells you which feeding pattern you are
              actually dealing with before you pay for anything.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/picky-eater-quiz">
                <Button size="lg">Take the picky eater quiz</Button>
              </Link>
              <Link to="/compare">
                <Button size="lg" variant="outline">
                  Compare with other apps
                </Button>
              </Link>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
