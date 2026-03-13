import { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { BreadcrumbSchema } from '@/components/schema/BreadcrumbSchema';
import { FAQSchema } from '@/components/schema/FAQSchema';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import type { PseoPageRow, PseoPageContent } from '@/types/pseo';

const FoodChainingGuide = lazy(() => import('./FoodChainingGuide'));
const ChallengeMealOccasion = lazy(() => import('./ChallengeMealOccasion'));
const AgeMealOccasion = lazy(() => import('./AgeMealOccasion'));
const LandingPage = lazy(() => import('./LandingPage'));

function LoadingState() {
  return (
    <div className="min-h-screen flex items-center justify-center" role="status">
      <div className="text-center space-y-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
        <p className="text-muted-foreground text-sm">Loading page...</p>
      </div>
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-6xl font-bold text-primary">404</div>
        <h1 className="text-2xl font-bold">Page not found</h1>
        <p className="text-muted-foreground">
          This page doesn't exist or is no longer available.
        </p>
        <Button variant="ghost" asChild>
          <Link to="/">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to home
          </Link>
        </Button>
      </div>
    </div>
  );
}

function renderContent(page: PseoPageRow) {
  const content = page.content as PseoPageContent;
  const relatedPages = page.related_pages ?? [];

  switch (page.page_type) {
    case 'FOOD_CHAINING_GUIDE':
      return (
        <FoodChainingGuide
          content={content}
          relatedPages={relatedPages}
        />
      );
    case 'CHALLENGE_MEAL_OCCASION':
      return (
        <ChallengeMealOccasion
          content={content}
          relatedPages={relatedPages}
        />
      );
    case 'AGE_MEAL_OCCASION':
      return (
        <AgeMealOccasion
          content={content}
          relatedPages={relatedPages}
        />
      );
    case 'CHALLENGE_LANDING':
    case 'AGE_GROUP_LANDING':
    case 'MEAL_OCCASION_LANDING':
      return (
        <LandingPage
          content={content}
          relatedPages={relatedPages}
        />
      );
    default:
      return <NotFoundState />;
  }
}

export default function PseoPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<PseoPageRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNotFound, setIsNotFound] = useState(false);

  useEffect(() => {
    if (!slug) {
      setIsNotFound(true);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchPage() {
      setIsLoading(true);
      setIsNotFound(false);

      const { data, error } = await supabase
        .from('pseo_pages')
        .select('*')
        .eq('slug', slug)
        .eq('generation_status', 'published')
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setIsNotFound(true);
      } else {
        setPage(data as unknown as PseoPageRow);
      }

      setIsLoading(false);
    }

    fetchPage();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (isLoading) {
    return <LoadingState />;
  }

  if (isNotFound || !page) {
    return <NotFoundState />;
  }

  const content = page.content as PseoPageContent;
  const faqs = 'faqs' in content ? content.faqs : [];
  const breadcrumbSchemaItems = (page.breadcrumbs ?? []).map((b) => ({
    name: b.label,
    url: b.href,
  }));

  return (
    <>
      <Helmet>
        <title>{page.title} - EatPal</title>
        <meta name="description" content={page.meta_description} />
        <link rel="canonical" href={page.canonical_url} />
      </Helmet>

      {breadcrumbSchemaItems.length > 0 && (
        <BreadcrumbSchema items={breadcrumbSchemaItems} />
      )}

      {faqs.length > 0 && (
        <FAQSchema
          faqs={faqs.map((f) => ({
            question: f.question,
            answer: f.answer,
          }))}
        />
      )}

      <Suspense fallback={<LoadingState />}>
        {renderContent(page)}
      </Suspense>
    </>
  );
}
