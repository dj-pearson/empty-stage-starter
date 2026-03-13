import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';
import type {
  LandingPageContent,
  PseoRelatedPage,
  PseoFaqItem,
  HubLink,
  StatFact,
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
// Hub links grid (child pages)
// ---------------------------------------------------------------------------

function HubLinksGrid({ links }: { links: HubLink[] }) {
  if (links.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {links.map((link) => (
        <Card key={link.slug} className="group hover:shadow-md transition-shadow">
          <Link to={`/guides/${link.slug}`} className="block h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base group-hover:text-primary transition-colors">
                {link.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{link.description}</p>
              <span className="inline-flex items-center gap-1 text-sm text-primary font-medium mt-3">
                Read guide
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </CardContent>
          </Link>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats / facts section
// ---------------------------------------------------------------------------

function StatsSection({ stats }: { stats: StatFact[] }) {
  if (stats.length === 0) return null;

  return (
    <div
      className={cn(
        'grid gap-4',
        stats.length <= 3
          ? 'grid-cols-1 sm:grid-cols-3'
          : 'grid-cols-2 sm:grid-cols-4'
      )}
    >
      {stats.map((stat, idx) => (
        <div
          key={idx}
          className="text-center p-4 rounded-lg bg-muted/40 border"
        >
          <div className="text-2xl md:text-3xl font-bold text-primary">
            {stat.value}
          </div>
          <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface LandingPageProps {
  content: LandingPageContent;
  relatedPages: PseoRelatedPage[];
}

export function LandingPage({ content, relatedPages }: LandingPageProps) {
  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 pb-16">
      {/* 1. Hero */}
      <PseoHero
        headline={content.headline}
        subheadline={content.subheadline}
        intro={content.intro}
      />

      <Separator />

      {/* 2. Overview content */}
      <section className="py-10" aria-labelledby="overview-heading">
        <h2 id="overview-heading" className="text-2xl font-bold mb-4">
          {content.overview.heading}
        </h2>
        <p className="text-foreground/80 leading-relaxed">{content.overview.body}</p>
      </section>

      <Separator />

      {/* 3. Hub links to child pages */}
      <section className="py-10" aria-labelledby="guides-heading">
        <h2 id="guides-heading" className="text-2xl font-bold mb-6">
          Explore Our Guides
        </h2>
        <HubLinksGrid links={content.hubLinks} />
      </section>

      <Separator />

      {/* 4. Key stats / facts */}
      {content.stats.length > 0 && (
        <>
          <section className="py-10" aria-labelledby="stats-heading">
            <h2 id="stats-heading" className="text-2xl font-bold mb-6">
              Key Facts
            </h2>
            <StatsSection stats={content.stats} />
          </section>
          <Separator />
        </>
      )}

      {/* 5. FAQ accordion */}
      <PseoFaqAccordion faqs={content.faqs} />

      <Separator />

      {/* 6. CTA block */}
      <PseoCtaBlock
        heading="Start planning better meals today"
        body="EatPal gives you personalized meal plans, nutrition tracking, and expert guidance for every stage of childhood."
      />
    </article>
  );
}

export default LandingPage;
