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
import { cn } from '@/lib/utils';
import { ArrowRight, CheckCircle2, Clock, Lightbulb, AlertTriangle } from 'lucide-react';
import type {
  FoodChainingGuideContent,
  PseoRelatedPage,
  PseoFaqItem,
  FoodChainStep,
  IntroductionTechnique,
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

function PseoCtaBlock({
  heading,
  body,
}: {
  heading: string;
  body: string;
}) {
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

function PseoProgressionTable({ steps }: { steps: FoodChainStep[] }) {
  if (steps.length === 0) return null;

  const stageIcons = [
    <CheckCircle2 key="s1" className="h-5 w-5 text-green-600" aria-hidden="true" />,
    <ArrowRight key="s2" className="h-5 w-5 text-blue-600" aria-hidden="true" />,
    <Lightbulb key="s3" className="h-5 w-5 text-amber-600" aria-hidden="true" />,
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" role="table">
        <thead>
          <tr className="border-b">
            <th className="py-3 px-4 text-left font-semibold" scope="col">Stage</th>
            <th className="py-3 px-4 text-left font-semibold" scope="col">Description</th>
            <th className="py-3 px-4 text-left font-semibold" scope="col">Foods</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step, idx) => (
            <tr key={idx} className="border-b last:border-0">
              <td className="py-3 px-4 align-top">
                <span className="flex items-center gap-2 font-medium">
                  {stageIcons[idx] ?? null}
                  {step.stage}
                </span>
              </td>
              <td className="py-3 px-4 align-top text-muted-foreground">
                {step.description}
              </td>
              <td className="py-3 px-4 align-top">
                <div className="flex flex-wrap gap-1.5">
                  {step.foods.map((food) => (
                    <Badge key={food} variant="secondary" className="text-xs">
                      {food}
                    </Badge>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Techniques timeline
// ---------------------------------------------------------------------------

function TechniquesList({ techniques }: { techniques: IntroductionTechnique[] }) {
  if (techniques.length === 0) return null;

  return (
    <ol className="space-y-4" aria-label="Introduction techniques">
      {techniques.map((t) => (
        <li key={t.step} className="flex gap-4">
          <span
            className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground text-sm font-bold"
            aria-hidden="true"
          >
            {t.step}
          </span>
          <div className="flex-1">
            <h4 className="font-semibold text-foreground">{t.title}</h4>
            <p className="text-sm text-muted-foreground mt-1">{t.description}</p>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {t.timeline}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface FoodChainingGuideProps {
  content: FoodChainingGuideContent;
  relatedPages: PseoRelatedPage[];
}

export function FoodChainingGuide({ content, relatedPages }: FoodChainingGuideProps) {
  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 pb-16">
      {/* 1. Hero */}
      <PseoHero
        headline={content.headline}
        subheadline={content.subheadline}
        intro={content.intro}
      />

      <Separator />

      {/* 2. Validation - "Why [food] is a great starting point" */}
      <section className="py-10" aria-labelledby="validation-heading">
        <h2 id="validation-heading" className="text-2xl font-bold mb-4">
          {content.validation.heading}
        </h2>
        <p className="text-foreground/80 leading-relaxed mb-4">
          {content.validation.body}
        </p>
        {content.validation.properties.length > 0 && (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2" aria-label="Key properties">
            {content.validation.properties.map((prop) => (
              <li key={prop} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <span>{prop}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Separator />

      {/* 3. "What is food chaining?" explainer */}
      <section className="py-10" aria-labelledby="explainer-heading">
        <h2 id="explainer-heading" className="text-2xl font-bold mb-4">
          {content.explainer.heading}
        </h2>
        <p className="text-foreground/80 leading-relaxed">{content.explainer.body}</p>
      </section>

      <Separator />

      {/* 4. 3-step progression table */}
      <section className="py-10" aria-labelledby="progression-heading">
        <h2 id="progression-heading" className="text-2xl font-bold mb-6">
          Food Chaining Progression
        </h2>
        <Card>
          <CardContent className="p-0 sm:p-2">
            <PseoProgressionTable steps={content.progression} />
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* 5. Shared properties explanation */}
      <section className="py-10" aria-labelledby="shared-props-heading">
        <h2 id="shared-props-heading" className="text-2xl font-bold mb-4">
          {content.sharedProperties.heading}
        </h2>
        <p className="text-foreground/80 leading-relaxed">
          {content.sharedProperties.body}
        </p>
      </section>

      <Separator />

      {/* 6. Step-by-step introduction techniques */}
      <section className="py-10" aria-labelledby="techniques-heading">
        <h2 id="techniques-heading" className="text-2xl font-bold mb-6">
          Step-by-Step Introduction Techniques
        </h2>
        <TechniquesList techniques={content.techniques} />
      </section>

      <Separator />

      {/* 7. "What if it's refused?" troubleshooting */}
      <section className="py-10" aria-labelledby="troubleshooting-heading">
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10 dark:border-amber-900/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />
              <span id="troubleshooting-heading">{content.troubleshooting.heading}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground/80 leading-relaxed mb-4">
              {content.troubleshooting.body}
            </p>
            {content.troubleshooting.tips.length > 0 && (
              <ul className="space-y-2" aria-label="Troubleshooting tips">
                {content.troubleshooting.tips.map((tip, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <Lightbulb className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {/* 8. Progress tracking CTA */}
      <PseoCtaBlock
        heading={content.trackingCta.heading}
        body={content.trackingCta.body}
      />

      <Separator />

      {/* 9. FAQ accordion */}
      <PseoFaqAccordion faqs={content.faqs} />

      <Separator />

      {/* 10. Related pages grid */}
      <PseoRelatedPages pages={relatedPages} />

      {/* 11. Final CTA block */}
      <PseoCtaBlock
        heading="Ready to expand your child's diet?"
        body="EatPal makes food chaining easy with personalized plans, progress tracking, and expert guidance."
      />
    </article>
  );
}

export default FoodChainingGuide;
