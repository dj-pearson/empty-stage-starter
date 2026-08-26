import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { getPageSEO } from '@/lib/seo-config';
import { BreadcrumbNavigation } from '@/components/BreadcrumbNavigation';
import { Footer } from '@/components/Footer';
import { CardSkeleton } from '@/components/loading';
import { logger } from '@/lib/logger';
import { pathnameForSlug } from '@/lib/pseo/slug';
import type { PseoPageType } from '@/types/pseo';

/**
 * /guides — hub page for the programmatic guide library.
 *
 * Two problems this solves.
 *
 * 1. Every generated guide's first breadcrumb points at `/guides` (see
 *    buildBreadcrumbs in src/lib/pseo/generator.ts), and nothing served that path —
 *    so each guide declared a BreadcrumbList whose root URL 404'd.
 *
 * 2. Nothing in the public site linked into the guide library at all. The only links
 *    to /guides/* came from other guides and the admin dashboard, which makes the
 *    whole cluster an island: a crawler arriving on the homepage had no path to any
 *    of it. A hub page linked from the footer gives the cluster a single entry point
 *    and spreads internal link equity across it.
 */

interface GuideRow {
  slug: string;
  title: string;
  meta_description: string | null;
  page_type: PseoPageType;
}

/** Display grouping. Order here is the order sections render in. */
const GROUPS: { heading: string; blurb: string; types: PseoPageType[] }[] = [
  {
    heading: 'Food chaining guides',
    blurb:
      'Step-by-step chains that start from a food your child already accepts and move outward in small, predictable changes.',
    types: ['FOOD_CHAINING_GUIDE', 'FOOD_CHAINING_AGE_COMBO', 'FOOD_CHALLENGE_COMBO'],
  },
  {
    heading: 'By feeding challenge',
    blurb:
      'Guides organised around a specific challenge — ARFID, sensory aversion, autism-related feeding difficulty — and the mealtimes they show up in.',
    types: ['CHALLENGE_LANDING', 'CHALLENGE_MEAL_OCCASION'],
  },
  {
    heading: 'By age group',
    blurb: 'What selective eating looks like at each stage, and what actually helps at that age.',
    types: ['AGE_GROUP_LANDING', 'AGE_MEAL_OCCASION'],
  },
  {
    heading: 'By mealtime',
    blurb: 'Breakfast, lunch, dinner and snacks — planned around a short list of safe foods.',
    types: ['MEAL_OCCASION_LANDING'],
  },
  {
    heading: 'Dietary restrictions',
    blurb: 'Working within an allergy or restriction while still expanding what your child eats.',
    types: ['FOOD_DIETARY_RESTRICTION'],
  },
];

export default function GuidesIndex() {
  const [guides, setGuides] = useState<GuideRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from('pseo_pages')
        .select('slug, title, meta_description, page_type')
        .eq('generation_status', 'published')
        .order('title', { ascending: true });

      if (cancelled) return;

      if (error) {
        logger.warn('[GuidesIndex] failed to load guides', error);
        setFailed(true);
      } else {
        setGuides((data ?? []) as GuideRow[]);
      }
      setIsLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const sections = GROUPS.map((group) => ({
    ...group,
    items: guides.filter((guide) => group.types.includes(guide.page_type)),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      <SEOHead {...getPageSEO('guides')!} />

      {/* An ItemList of the guides themselves tells search engines this is a hub over a
          known set of pages rather than a navigational stub. Only emitted once there is
          something to list. */}
      {guides.length > 0 && (
        <Helmet>
          <script type="application/ld+json">
            {JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'CollectionPage',
              '@id': 'https://tryeatpal.com/guides#collection',
              url: 'https://tryeatpal.com/guides',
              name: 'EatPal Guides',
              description:
                'Practical guides for feeding picky eaters and children with ARFID, organised by food, feeding challenge, age and mealtime.',
              isPartOf: { '@id': 'https://tryeatpal.com/#website' },
              mainEntity: {
                '@type': 'ItemList',
                numberOfItems: guides.length,
                itemListElement: guides.slice(0, 100).map((guide, index) => ({
                  '@type': 'ListItem',
                  position: index + 1,
                  name: guide.title,
                  url: `https://tryeatpal.com${pathnameForSlug(guide.slug)}`,
                })),
              },
            })}
          </script>
        </Helmet>
      )}

      <div id="main-content" className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-10 max-w-5xl">
          <BreadcrumbNavigation
            items={[
              { name: 'Home', url: '/' },
              { name: 'Guides', url: '/guides' },
            ]}
          />

          <header className="mt-6 mb-12 max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-heading font-bold mb-4">
              Guides for feeding picky eaters
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Every guide starts from the same place your child does: the foods they already
              accept. Browse by a specific safe food, by the feeding challenge you're working
              through, by your child's age, or by the mealtime that's hardest right now. Each
              one lays out concrete steps you can try this week, drawn from food chaining —
              the feeding therapy method of moving outward from accepted foods in small,
              predictable changes rather than introducing something entirely new.
            </p>
            {/* US-647: in the header rather than the empty state below, which only
                renders when the library fails to load. This is the crawl path from the
                guide cluster into /compare. */}
            <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
              Still deciding whether EatPal is the right tool at all? The{' '}
              <Link to="/compare" className="text-primary hover:underline">
                comparisons with other meal planning apps
              </Link>{' '}
              say where each of them is the better choice.
            </p>
            {/* US-649: the crawl path from the guide cluster into /solutions, in the
                header for the same reason the /compare link above is. */}
            <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
              If you already know which situation you are in, the{' '}
              <Link to="/solutions" className="text-primary hover:underline">
                pages for ARFID, sensory feeding and several kids at once
              </Link>{' '}
              say which parts of the app apply, and which do not.
            </p>
          </header>

          {isLoading && (
            <div className="grid gap-4 md:grid-cols-2">
              <CardSkeleton />
              <CardSkeleton />
            </div>
          )}

          {!isLoading && sections.length === 0 && (
            <div className="max-w-2xl space-y-4 text-muted-foreground leading-relaxed">
              <p>
                {failed
                  ? "We couldn't load the guide library just now. Please try again in a moment."
                  : 'New guides are being written and will appear here as they are published.'}
              </p>
              <p>
                In the meantime, the{' '}
                <Link to="/picky-eater-quiz" className="text-primary hover:underline">
                  picky eater quiz
                </Link>{' '}
                will point you at a starting approach, and the{' '}
                <Link to="/meal-plan" className="text-primary hover:underline">
                  meal plan builder
                </Link>{' '}
                turns your child's safe foods into a week of meals. Our{' '}
                <Link to="/blog" className="text-primary hover:underline">
                  blog
                </Link>{' '}
                covers ARFID, sensory aversion and food chaining in more depth.
              </p>
            </div>
          )}

          {sections.map((section) => (
            <section key={section.heading} className="mb-14">
              <h2 className="text-2xl font-heading font-semibold mb-2">{section.heading}</h2>
              <p className="text-muted-foreground mb-6 max-w-2xl">{section.blurb}</p>
              <ul className="grid gap-3 md:grid-cols-2">
                {section.items.map((guide) => (
                  <li key={guide.slug}>
                    <Link
                      to={pathnameForSlug(guide.slug)}
                      className="block rounded-xl border p-4 hover:border-primary/40 transition-colors"
                    >
                      <span className="font-medium block mb-1">{guide.title}</span>
                      {guide.meta_description && (
                        <span className="text-sm text-muted-foreground line-clamp-2">
                          {guide.meta_description}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <Footer />
      </div>
    </>
  );
}
