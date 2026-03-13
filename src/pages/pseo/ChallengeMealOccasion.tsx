import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ArrowRight, XCircle, MessageSquareQuote } from 'lucide-react';
import type {
  ChallengeMealOccasionContent,
  PseoRelatedPage,
  PseoFaqItem,
  FoodIdeaCard,
} from '@/types/pseo';

// ---------------------------------------------------------------------------
// Shared sub-components (duplicated intentionally to keep each page-type
// file self-contained for tree-shaking when lazy-loaded)
// ---------------------------------------------------------------------------

function PseoHero({
  headline,
  subheadline,
  intro,
}: {
  headline: string;
  subheadline: string;
  intro: string;
}) {
  return (
    <section className="py-12 md:py-16 text-center" aria-labelledby="pseo-hero-heading">
      <h1
        id="pseo-hero-heading"
        className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-foreground"
      >
        {headline}
      </h1>
      <p className="mt-3 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
        {subheadline}
      </p>
      <p className="mt-6 text-base text-foreground/80 max-w-3xl mx-auto leading-relaxed">
        {intro}
      </p>
    </section>
  );
}

function PseoFaqAccordion({ faqs }: { faqs: PseoFaqItem[] }) {
  if (faqs.length === 0) return null;

  return (
    <section className="py-10" aria-labelledby="pseo-faq-heading">
      <h2 id="pseo-faq-heading" className="text-2xl font-bold mb-6">
        Frequently Asked Questions
      </h2>
      <Accordion type="single" collapsible className="w-full">
        {faqs.map((faq, idx) => (
          <AccordionItem key={idx} value={`faq-${idx}`}>
            <AccordionTrigger className="text-left text-base">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

function PseoRelatedPages({ pages }: { pages: PseoRelatedPage[] }) {
  if (pages.length === 0) return null;

  return (
    <section className="py-10" aria-labelledby="pseo-related-heading">
      <h2 id="pseo-related-heading" className="text-2xl font-bold mb-6">
        Related Guides
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {pages.map((page) => (
          <Card key={page.slug} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                <Link
                  to={`/guides/${page.slug}`}
                  className="hover:text-primary transition-colors"
                >
                  {page.title}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{page.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function PseoCtaBlock({ heading, body }: { heading: string; body: string }) {
  return (
    <section
      className="py-10 my-6 rounded-lg bg-primary/5 border border-primary/10 text-center px-6"
      aria-labelledby="pseo-cta-heading"
    >
      <h2 id="pseo-cta-heading" className="text-2xl font-bold mb-3">
        {heading}
      </h2>
      <p className="text-muted-foreground max-w-xl mx-auto mb-6">{body}</p>
      <Button asChild size="lg">
        <Link to="/auth">
          Get Started Free
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </section>
  );
}

function PseoFoodGrid({ items }: { items: FoodIdeaCard[] }) {
  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {items.map((item) => (
        <Card
          key={item.name}
          className="hover:shadow-md transition-shadow"
        >
          <CardContent className="p-3">
            <h4 className="font-medium text-sm leading-tight">{item.name}</h4>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {item.description}
            </p>
            {item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {item.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ChallengeMealOccasionProps {
  content: ChallengeMealOccasionContent;
  relatedPages: PseoRelatedPage[];
}

export function ChallengeMealOccasion({ content, relatedPages }: ChallengeMealOccasionProps) {
  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 pb-16">
      {/* 1. Hero */}
      <PseoHero
        headline={content.headline}
        subheadline={content.subheadline}
        intro={content.intro}
      />

      <Separator />

      {/* 2. "Why [occasion] is hard for [challenge] kids" */}
      <section className="py-10" aria-labelledby="why-hard-heading">
        <h2 id="why-hard-heading" className="text-2xl font-bold mb-4">
          {content.whyHard.heading}
        </h2>
        <p className="text-foreground/80 leading-relaxed">{content.whyHard.body}</p>
      </section>

      <Separator />

      {/* 3. Key principles grid */}
      <section className="py-10" aria-labelledby="principles-heading">
        <h2 id="principles-heading" className="text-2xl font-bold mb-6">
          {content.principles.heading}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {content.principles.items.map((item, idx) => (
            <Card key={idx}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator />

      {/* 4. Food ideas grid (25-30 items) */}
      <section className="py-10" aria-labelledby="food-ideas-heading">
        <h2 id="food-ideas-heading" className="text-2xl font-bold mb-6">
          {content.foodIdeas.heading}
        </h2>
        <PseoFoodGrid items={content.foodIdeas.items} />
      </section>

      <Separator />

      {/* 5. What to avoid */}
      <section className="py-10" aria-labelledby="avoid-heading">
        <h2 id="avoid-heading" className="text-2xl font-bold mb-4">
          {content.avoid.heading}
        </h2>
        <ul className="space-y-2" aria-label="Foods and approaches to avoid">
          {content.avoid.items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2 text-sm">
              <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <Separator />

      {/* 6. Real parent scenario */}
      <section className="py-10" aria-labelledby="scenario-heading">
        <h2 id="scenario-heading" className="text-2xl font-bold mb-4">
          Real Parent Scenario
        </h2>
        <Card className="bg-muted/30">
          <CardContent className="p-6 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <MessageSquareQuote className="h-5 w-5 text-primary" aria-hidden="true" />
                <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                  The Situation
                </h3>
              </div>
              <p className="text-foreground/80 leading-relaxed italic">
                &ldquo;{content.scenario.situation}&rdquo;
              </p>
            </div>
            <Separator />
            <div>
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">
                The Solution
              </h3>
              <p className="text-foreground/80 leading-relaxed">
                {content.scenario.solution}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* 7. FAQ accordion */}
      <PseoFaqAccordion faqs={content.faqs} />

      <Separator />

      {/* 8. Related pages grid */}
      <PseoRelatedPages pages={relatedPages} />

      {/* 9. CTA block */}
      <PseoCtaBlock
        heading="Make mealtimes easier"
        body="EatPal helps you plan meals your child will actually eat, with personalized suggestions and progress tracking."
      />
    </article>
  );
}

export default ChallengeMealOccasion;
