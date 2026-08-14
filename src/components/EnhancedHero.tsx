import { useRef, useEffect, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

// Dynamic import: Three.js bundle (~250KB) only loads on desktop viewports
const LazyFoodOrbit = lazy(() =>
  import('@/components/LazyFoodOrbit').then(m => ({ default: m.LazyFoodOrbit }))
);

// Dynamically import GSAP only when needed (deferred loading)
let gsapModule: typeof import("gsap") | null = null;

const loadGSAP = async () => {
  if (!gsapModule) {
    gsapModule = await import("gsap");
  }
  return gsapModule.gsap;
};


/**
 * Enhanced Hero Section with Trust Signals and 3D Elements
 * Optimized with deferred GSAP loading for better performance
 */
export function EnhancedHero() {
  const containerRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const subheadlineRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let mounted = true;

    const initAnimations = async () => {
      const gsap = await loadGSAP();
      if (!mounted || !containerRef.current) return;

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      // Use fromTo to ensure consistent starting state
      tl.fromTo(headlineRef.current,
        { y: 50, opacity: 0 },
        { y: 0, opacity: 1, duration: 1 }
      )
        .fromTo(subheadlineRef.current,
          { y: 30, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.8 },
          "-=0.6"
        )
        .fromTo(ctaRef.current,
          { y: 20, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.8 },
          "-=0.6"
        );

      // Ambient background animation - optimized 2D
      gsap.to(".bg-blob-1", {
        scale: 1.1,
        rotation: 10,
        duration: 15,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut"
      });

      gsap.to(".bg-blob-2", {
        scale: 1.2,
        rotation: -10,
        duration: 18,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        delay: 2
      });
    };

    // Defer animation initialization until browser is idle to avoid blocking LCP
    let idleHandle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if ('requestIdleCallback' in window) {
      idleHandle = (window as any).requestIdleCallback(initAnimations, { timeout: 3000 });
    } else {
      timer = setTimeout(initAnimations, 1000);
    }

    return () => {
      mounted = false;
      if (idleHandle !== undefined && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(idleHandle);
      }
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

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

      {/* Decorative background elements - Optimized CSS/GSAP */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="bg-blob-1 absolute -top-1/4 -left-1/4 w-[800px] h-[800px] bg-trust-softPink/20 rounded-full blur-[120px]" />
        <div className="bg-blob-2 absolute -bottom-1/4 -right-1/4 w-[800px] h-[800px] bg-trust-warmOrange/20 rounded-full blur-[120px]" />
      </div>

      <div className="container mx-auto text-center max-w-5xl relative z-10">
        {/* Main Headline */}
        <h1
          ref={headlineRef}
          className="text-5xl md:text-7xl font-heading font-bold mb-8 leading-tight tracking-tight"
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
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent drop-shadow-sm">
            Steady Progress, One Safe Bite at a Time
          </span>
        </h1>

        {/* Subheadline */}
        <p
          ref={subheadlineRef}
          className="text-xl md:text-2xl text-muted-foreground mb-10 max-w-3xl mx-auto leading-relaxed font-light"
        >
          An AI-powered meal planning app built on{' '}
          <span className="text-foreground font-medium">food chaining science</span>{' '}
          to help families with extreme picky eating, ARFID, and autism-related feeding challenges.
        </p>

        {/* CTA Buttons */}
        <div
          ref={ctaRef}
          className="flex gap-6 justify-center flex-wrap items-start"
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
