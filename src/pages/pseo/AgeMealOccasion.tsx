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
import { ArrowRight, ShoppingCart, Star } from 'lucide-react';
import type {
  AgeMealOccasionContent,
  PseoRelatedPage,
  PseoFaqItem,
  MealIdeaCard,
  SampleDayPlan,
} from '@/types/pseo';

// ---------------------------------------------------------------------------
// Shared sub-components
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

// ---------------------------------------------------------------------------
// Meal ideas grid
// ---------------------------------------------------------------------------

function MealIdeasGrid({ items }: { items: MealIdeaCard[] }) {
  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {items.map((item) => (
        <Card key={item.name} className="hover:shadow-md transition-shadow">
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
// Sample plan table
// ---------------------------------------------------------------------------

function SamplePlanTable({ days }: { days: SampleDayPlan[] }) {
  if (days.length === 0) return null;

  // Collect all unique meal slots across all days
  const allSlots = Array.from(
    new Set(days.flatMap((d) => d.meals.map((m) => m.slot)))
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" role="table">
        <thead>
          <tr className="border-b">
            <th className="py-3 px-3 text-left font-semibold" scope="col">Day</th>
            {allSlots.map((slot) => (
              <th key={slot} className="py-3 px-3 text-left font-semibold" scope="col">
                {slot}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => {
            const mealsBySlot = new Map(day.meals.map((m) => [m.slot, m.item]));
            return (
              <tr key={day.day} className="border-b last:border-0">
                <td className="py-3 px-3 font-medium">{day.day}</td>
                {allSlots.map((slot) => (
                  <td key={slot} className="py-3 px-3 text-muted-foreground">
                    {mealsBySlot.get(slot) ?? '\u2014'}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface AgeMealOccasionProps {
  content: AgeMealOccasionContent;
  relatedPages: PseoRelatedPage[];
}

export function AgeMealOccasion({ content, relatedPages }: AgeMealOccasionProps) {
  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 pb-16">
      {/* 1. Hero */}
      <PseoHero
        headline={content.headline}
        subheadline={content.subheadline}
        intro={content.intro}
      />

      <Separator />

      {/* 2. "Why [occasion] is hard at [age]" */}
      <section className="py-10" aria-labelledby="why-hard-heading">
        <h2 id="why-hard-heading" className="text-2xl font-bold mb-4">
          {content.whyHard.heading}
        </h2>
        <p className="text-foreground/80 leading-relaxed">{content.whyHard.body}</p>
      </section>

      <Separator />

      {/* 3. Key principle highlight */}
      <section className="py-10" aria-labelledby="key-principle-heading">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-6 flex gap-4 items-start">
            <Star className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h2
                id="key-principle-heading"
                className="text-lg font-bold mb-2"
              >
                {content.keyPrinciple.title}
              </h2>
              <p className="text-foreground/80 leading-relaxed">
                {content.keyPrinciple.description}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* 4. Meal ideas grid (30-40 items) */}
      <section className="py-10" aria-labelledby="meal-ideas-heading">
        <h2 id="meal-ideas-heading" className="text-2xl font-bold mb-6">
          {content.mealIdeas.heading}
        </h2>
        <MealIdeasGrid items={content.mealIdeas.items} />
      </section>

      <Separator />

      {/* 5. 5-day sample plan table */}
      <section className="py-10" aria-labelledby="sample-plan-heading">
        <h2 id="sample-plan-heading" className="text-2xl font-bold mb-6">
          {content.samplePlan.heading}
        </h2>
        <Card>
          <CardContent className="p-0 sm:p-2">
            <SamplePlanTable days={content.samplePlan.days} />
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* 6. Shopping list CTA */}
      <section
        className="py-10 my-6 rounded-lg bg-primary/5 border border-primary/10 text-center px-6"
        aria-labelledby="shopping-cta-heading"
      >
        <ShoppingCart className="h-8 w-8 text-primary mx-auto mb-3" aria-hidden="true" />
        <h2 id="shopping-cta-heading" className="text-2xl font-bold mb-3">
          {content.shoppingCta.heading}
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto mb-6">
          {content.shoppingCta.body}
        </p>
        <Button asChild size="lg">
          <Link to="/auth">
            Generate My Shopping List
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </section>

      <Separator />

      {/* 7. FAQ accordion */}
      <PseoFaqAccordion faqs={content.faqs} />

      <Separator />

      {/* 8. Related pages grid */}
      <PseoRelatedPages pages={relatedPages} />

      {/* 9. CTA block */}
      <PseoCtaBlock
        heading="Plan age-appropriate meals in minutes"
        body="EatPal builds personalized meal plans based on your child's age, preferences, and nutritional needs."
      />
    </article>
  );
}

export default AgeMealOccasion;
