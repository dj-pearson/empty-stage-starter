import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { LazyFoodOrbit } from '@/components/LazyFoodOrbit';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

/**
 * Enhanced Hero Section with Trust Signals and 3D Elements
 * Optimized with GSAP for performance
 */
export function EnhancedHero() {
  const containerRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const subheadlineRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
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
      )
      .fromTo(".stat-card",
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          stagger: 0.1
        },
        "-=0.4"
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

  }, { scope: containerRef });

  return (
    <section ref={containerRef} className="relative py-20 px-4 bg-gradient-to-b from-background via-trust-softPink/5 to-secondary/10 overflow-hidden min-h-[85vh] flex items-center">
      {/* 3D Food Orbit Background (Desktop Only) - Lazy Loaded */}
      <div className="absolute inset-0 z-0 opacity-80 hidden md:block">
        <LazyFoodOrbit className="w-full h-full" />
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
          <span className="text-foreground">
            Stop the Nightly
          </span>
          <br />
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent drop-shadow-sm">
            "What's for Dinner?" Meltdown
          </span>
        </h1>

        {/* Subheadline */}
        <p
          ref={subheadlineRef}
          className="text-xl md:text-2xl text-muted-foreground mb-10 max-w-3xl mx-auto leading-relaxed font-light"
        >
          The meal planning app that turns picky eaters into adventurous eaters—one safe food at a time.
          Build weekly meal plans your kids will actually eat, auto-generate grocery lists, and track real progress.
        </p>

        {/* CTA Buttons */}
        <div
          ref={ctaRef}
          className="flex gap-6 justify-center flex-wrap"
        >
          <div className="hover:scale-105 transition-transform duration-300">
            <Link to="/auth?tab=signup">
              <Button
                size="lg"
                className="gap-2 text-lg px-10 py-7 shadow-xl hover:shadow-2xl transition-all bg-primary hover:bg-primary/90 text-white rounded-full"
              >
                Try It Free <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
          </div>
          <div className="hover:scale-105 transition-transform duration-300">
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-10 py-7 border-2 border-primary/20 hover:bg-primary/5 hover:border-primary/40 rounded-full backdrop-blur-sm"
              onClick={() =>
                document
                  .getElementById('how-it-works')
                  ?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              See How It Works
            </Button>
          </div>
        </div>

        {/* Anxiety Reducer */}
        <p className="text-sm text-muted-foreground mt-6 font-medium opacity-80">
          <span className="text-primary">Free to join</span> • No credit card
          required • 14-day money-back guarantee
        </p>

        {/* Animated Stats - Trust Signals */}
        <div
          ref={statsRef}
          className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto mt-20"
        >
          {[
            { value: '2,000+', label: 'Parents Trust EatPal', icon: '👨‍👩‍👧' },
            { value: '50K+', label: 'Meals Planned', icon: '🍽️' },
            { value: '12+', label: 'New Foods Tried', icon: '🎯' },
            { value: '4.8⭐', label: 'Parent Rating', icon: '⭐' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="stat-card group cursor-default bg-white/60 dark:bg-black/20 backdrop-blur-md rounded-2xl p-6 border border-white/20 shadow-sm hover:shadow-md transition-all"
            >
              <div className="text-3xl mb-3">{stat.icon}</div>
              <div className="text-3xl md:text-4xl font-heading font-bold text-primary mb-2 transition-colors group-hover:text-primary/80">
                {stat.value}
              </div>
              <div className="text-xs md:text-sm text-muted-foreground font-medium">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
