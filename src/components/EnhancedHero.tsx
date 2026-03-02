import { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { LazyFoodOrbit } from '@/components/LazyFoodOrbit';
import { Link } from 'react-router-dom';
import { useInView } from '@/hooks/useInView';
import { useReducedMotion } from '@/hooks/useReducedMotion';

// Dynamically import GSAP only when needed (deferred loading)
let gsapModule: typeof import("gsap") | null = null;

const loadGSAP = async () => {
  if (!gsapModule) {
    gsapModule = await import("gsap");
  }
  return gsapModule.gsap;
};

/**
 * Animated counter that counts up from 0 to a target value when in view.
 * Respects prefers-reduced-motion by showing the final value immediately.
 */
function AnimatedCounter({
  end,
  suffix = '',
  prefix = '',
  decimals = 0,
  duration = 2000,
  inView,
  reducedMotion,
}: {
  end: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  duration?: number;
  inView: boolean;
  reducedMotion: boolean;
}) {
  const [count, setCount] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!inView || hasAnimated.current) return;
    hasAnimated.current = true;

    if (reducedMotion) {
      setCount(end);
      return;
    }

    let startTime: number | null = null;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);

      // Ease out cubic for natural deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(eased * end);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        setCount(end);
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [inView, end, duration, reducedMotion]);

  let formatted: string;
  if (decimals > 0) {
    formatted = `${prefix}${count.toFixed(decimals)}${suffix}`;
  } else {
    const rounded = Math.floor(count);
    formatted = rounded >= 1000
      ? `${prefix}${(rounded / 1000).toFixed(rounded >= 10000 ? 0 : 1).replace(/\.0$/, '')}K${suffix}`
      : `${prefix}${rounded.toLocaleString()}${suffix}`;
  }

  return <>{formatted}</>;
}

/**
 * Enhanced Hero Section with Trust Signals and 3D Elements
 * Optimized with deferred GSAP loading for better performance
 */
export function EnhancedHero() {
  const containerRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const subheadlineRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const { ref: statsInViewRef, inView: statsInView } = useInView({ threshold: 0.3, triggerOnce: true });
  const reducedMotion = useReducedMotion();

  // Merge the two refs for the stats container
  const setStatsRef = useCallback((node: HTMLDivElement | null) => {
    (statsRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    (statsInViewRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  }, [statsInViewRef]);

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
    };

    // Delay animation initialization to not block initial render
    const timer = setTimeout(initAnimations, 100);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  const stats: Array<{ numericValue: number; suffix: string; label: string; icon: string; decimals?: number }> = [
    { numericValue: 2000, suffix: '+', label: 'Families Helped', icon: '👨‍👩‍👧' },
    { numericValue: 200, suffix: '+', label: 'Feeding Therapists', icon: '🩺' },
    { numericValue: 100, suffix: 'K+', label: 'Mealtime Data Points', icon: '📊' },
    { numericValue: 4.8, suffix: '', label: 'Parent Rating', icon: '⭐', decimals: 1 },
  ];

  return (
    <section ref={containerRef} className="relative py-20 bg-gradient-to-b from-background via-trust-softPink/5 to-secondary/10 overflow-hidden min-h-[85vh] flex items-center">
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
            Turn Mealtime Battles Into
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
          Created alongside feeding therapists and backed by 100K+ real mealtime data points.
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

        {/* Animated Stats - Trust Signals */}
        <div
          ref={setStatsRef}
          className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto mt-20"
        >
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="stat-card group cursor-default bg-white/60 dark:bg-black/20 backdrop-blur-md rounded-2xl p-6 border border-white/20 shadow-sm hover:shadow-md transition-all"
            >
              <div className="text-3xl mb-3">{stat.icon}</div>
              <div className="text-3xl md:text-4xl font-heading font-bold text-primary mb-2 transition-colors group-hover:text-primary/80">
                <AnimatedCounter
                  end={stat.numericValue}
                  suffix={stat.suffix}
                  decimals={stat.decimals ?? 0}
                  duration={2000}
                  inView={statsInView}
                  reducedMotion={reducedMotion}
                />
              </div>
              <div className="text-xs md:text-sm text-muted-foreground font-medium">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
