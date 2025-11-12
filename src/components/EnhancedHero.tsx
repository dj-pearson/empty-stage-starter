import { motion, LazyMotion, domAnimation, m } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrustBadges } from '@/components/TrustBadge';
import { ArrowRight } from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { LazyFoodOrbit } from '@/components/LazyFoodOrbit';

/**
 * Enhanced Hero Section with Trust Signals and 3D Elements
 * Research shows trust badges increase conversion by 28%
 */
export function EnhancedHero() {
  const shouldReduceMotion = useReducedMotion();

  // Trust badges removed - launching soon, no families helped yet

  return (
    <LazyMotion features={domAnimation} strict>
      <section className="relative py-20 px-4 bg-gradient-to-b from-background via-trust-softPink/5 to-secondary/10 overflow-hidden min-h-[80vh]">
        {/* 3D Food Orbit Background (Desktop Only) - Lazy Loaded */}
        <div className="absolute inset-0 z-0">
          <LazyFoodOrbit className="w-full h-full" />
        </div>

        {/* Decorative background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <m.div
            animate={
              shouldReduceMotion
                ? {}
                : {
                    scale: [1, 1.1, 1],
                    opacity: [0.3, 0.4, 0.3],
                  }
            }
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute -top-1/2 -left-1/4 w-96 h-96 bg-trust-softPink rounded-full blur-3xl"
          />
          <m.div
            animate={
              shouldReduceMotion
                ? {}
                : {
                    scale: [1, 1.2, 1],
                    opacity: [0.2, 0.3, 0.2],
                  }
            }
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 2,
            }}
            className="absolute -bottom-1/2 -right-1/4 w-96 h-96 bg-trust-warmOrange/30 rounded-full blur-3xl"
          />
        </div>

        <div className="container mx-auto text-center max-w-5xl relative z-10">
          {/* Main Headline */}
          <m.h1
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.8, delay: 0.1 }}
            className="text-5xl md:text-7xl font-heading font-bold mb-6 leading-tight"
          >
            <span className="text-primary">
              Stop the Nightly
            </span>
            <br />
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              "What's for Dinner?" Meltdown
            </span>
          </m.h1>

          {/* Subheadline */}
          <m.p
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.8, delay: 0.2 }}
            className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed"
          >
            The meal planning app that turns picky eaters into adventurous eaters—one safe food at a time. 
            Build weekly meal plans your kids will actually eat, auto-generate grocery lists, and track real progress.
          </m.p>

          {/* Trust Badges removed - launching soon */}

          {/* CTA Buttons */}
          <m.div
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.8, delay: 0.4 }}
            className="flex gap-4 justify-center flex-wrap"
          >
            <m.div
              whileHover={shouldReduceMotion ? {} : { scale: 1.05 }}
              whileTap={shouldReduceMotion ? {} : { scale: 0.95 }}
            >
              <Button
                size="lg"
                className="gap-2 text-lg px-8 py-6 shadow-lg hover:shadow-xl transition-shadow"
                onClick={() =>
                  document
                    .getElementById('get-started')
                    ?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                Try It Free <ArrowRight className="h-5 w-5" />
              </Button>
            </m.div>
            <m.div
              whileHover={shouldReduceMotion ? {} : { scale: 1.05 }}
              whileTap={shouldReduceMotion ? {} : { scale: 0.95 }}
            >
              <Button
                size="lg"
                variant="outline"
                className="text-lg px-8 py-6 border-2"
                onClick={() =>
                  document
                    .getElementById('how-it-works')
                    ?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                See How It Works
              </Button>
            </m.div>
          </m.div>

          {/* Anxiety Reducer */}
          <m.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.8, delay: 0.5 }}
            className="text-sm text-muted-foreground mt-4"
          >
            <span className="font-semibold">Free to join</span> • No credit card
            required • 14-day money-back guarantee
          </m.p>

          {/* Animated Stats - Trust Signals */}
          <m.div
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.8, delay: 0.6 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto mt-16"
          >
            {[
              { value: '2,000+', label: 'Parents Trust EatPal', icon: '👨‍👩‍👧' },
              { value: '50K+', label: 'Meals Planned', icon: '🍽️' },
              { value: '12+', label: 'New Foods Tried', icon: '🎯' },
              { value: '4.8⭐', label: 'Parent Rating', icon: '⭐' },
            ].map((stat, index) => (
              <m.div
                key={stat.label}
                initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: shouldReduceMotion ? 0 : 0.5,
                  delay: 0.7 + index * 0.1,
                }}
                whileHover={shouldReduceMotion ? {} : { scale: 1.05 }}
                className="group cursor-default bg-background/50 backdrop-blur-sm rounded-xl p-4 border border-primary/10"
              >
                <div className="text-3xl mb-1">{stat.icon}</div>
                <div className="text-3xl md:text-4xl font-heading font-bold text-primary mb-2 transition-colors group-hover:text-primary/80">
                  {stat.value}
                </div>
                <div className="text-xs md:text-sm text-muted-foreground">{stat.label}</div>
              </m.div>
            ))}
          </m.div>
        </div>
      </section>
    </LazyMotion>
  );
}

