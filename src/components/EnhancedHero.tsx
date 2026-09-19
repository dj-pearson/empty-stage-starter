import { useRef, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

// Dynamic import: Three.js bundle (~250KB) only loads on desktop viewports
const LazyFoodOrbit = lazy(() =>
  import('@/components/LazyFoodOrbit').then(m => ({ default: m.LazyFoodOrbit }))
);


/**
 * Enhanced Hero Section with Trust Signals and 3D Elements
 * Optimized with deferred GSAP loading for better performance
 */
export function EnhancedHero() {
  const containerRef = useRef<HTMLElement>(null);

  /*
   * US-772: the entrance timeline and the two ambient blobs are CSS now
   * (.hero-rise-* and .bg-blob-* in src/index.css), so this component no
   * longer pulls GSAP onto the landing route.
   *
   * It also fixes what the old code did rather than reproducing it. GSAP was
   * loaded inside requestIdleCallback and then ran `fromTo`, which sets
   * opacity 0 at the start of the tween -- on a headline the prerendered HTML
   * had already painted. So the H1 appeared, vanished, and faded back in, up
   * to 3 seconds later on a slow connection. The CSS animation starts at first
   * paint with `backwards` fill, so the hidden state is never a state the
   * reader sees, and `prefers-reduced-motion` turns all of it off -- which the
   * GSAP version did not.
   */

  /*
   * The animated trust-signal row that used to sit here is gone. It counted up to
   * "2,000+ Families Helped", "200+ Feeding Therapists", "100K+ Mealtime Data Points"
   * and a "4.8 Parent Rating" - none of it sourced, and the families figure
   * contradicted llms.txt, which claimed over 10,000 at the same time. Invented
   * traction is the worst thing to put in a hero: it is the first thing a visitor
   * reads and the easiest claim to disprove.
   *
   * Put it back when the numbers are real and can be pointed at. Until then the hero
   * leads on the method, which is true and is the actual differentiator.
   */

  return (
    <section ref={containerRef} className="relative py-20 bg-gradient-to-b from-background via-trust-softPink/5 to-secondary/10 overflow-hidden min-h-[85vh] flex items-center">
      {/* 3D Food Orbit Background (Desktop Only) - Lazy Loaded + Code Split */}
      <div className="absolute inset-0 z-0 opacity-80 hidden md:block">
        <Suspense fallback={<div className="w-full h-full" />}>
          <LazyFoodOrbit className="w-full h-full" />
        </Suspense>
      </div>

      {/* Decorative background elements - CSS keyframes, see src/index.css */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="bg-blob-1 absolute -top-1/4 -left-1/4 w-[800px] h-[800px] bg-trust-softPink/20 rounded-full blur-[120px]" />
        <div className="bg-blob-2 absolute -bottom-1/4 -right-1/4 w-[800px] h-[800px] bg-trust-warmOrange/20 rounded-full blur-[120px]" />
      </div>

      <div className="container mx-auto text-center max-w-5xl relative z-10">
        {/* Main Headline */}
        <h1
          className="hero-rise hero-rise-1 text-5xl md:text-7xl font-heading font-bold mb-8 leading-tight tracking-tight"
        >
          {/*
            The H1 is the strongest on-page relevance signal a page has, and this one
            used to read "Turn Mealtime Battles Into Steady Progress, One Safe Bite at a
            Time" — evocative, but containing none of the terms the page targets
            (picky eater / ARFID / meal planner / food chaining). The keyword phrase now
            leads; the original emotional line is kept as the second half so the brand
            voice survives.
          */}
          <span className="text-foreground">
            Meal Planning for Picky Eaters &amp; ARFID
          </span>
          <br />
          <span className="text-primary drop-shadow-sm">
            Steady Progress, One Safe Bite at a Time
          </span>
        </h1>

        {/* Subheadline */}
        <p
          className="hero-rise hero-rise-2 text-xl md:text-2xl text-muted-foreground mb-10 max-w-3xl mx-auto leading-relaxed font-light"
        >
          An AI-powered meal planning app built on{' '}
          <span className="text-foreground font-medium">food chaining science</span>{' '}
          to help families with extreme picky eating, ARFID, and autism-related feeding challenges.
        </p>

        {/* CTA Buttons */}
        <div
          className="hero-rise hero-rise-3 flex gap-6 justify-center flex-wrap items-start"
        >
          <div className="hover:scale-105 transition-transform duration-300 text-center">
            <Link to="/meal-plan">
              <Button
                size="lg"
                className="gap-2 text-lg px-10 py-7 shadow-xl hover:shadow-2xl transition-all bg-primary hover:bg-primary/90 text-white rounded-full"
              >
                Get Your Personalized 5-Day Plan <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground mt-2 font-medium">
              Takes 2 minutes. Tailored to your child's safe foods.
            </p>
          </div>
          <div className="hover:scale-105 transition-transform duration-300">
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-10 py-7 border-2 border-primary/20 hover:bg-primary/5 hover:border-primary/40 rounded-full backdrop-blur-sm"
              onClick={() =>
                document
                  .getElementById('therapist-section')
                  ?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              For Feeding Therapists →
            </Button>
          </div>
        </div>

        {/* Anxiety Reducer */}
        <p className="text-sm text-muted-foreground mt-6 font-medium opacity-80">
          <span className="text-primary">Free to start</span> • No credit card
          required • Evidence-based food chaining methodology
        </p>

      </div>
    </section>
  );
}
