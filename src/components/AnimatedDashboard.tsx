import { motion, LazyMotion, domAnimation, m } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CircleHelp } from 'lucide-react';

/**
 * Enhanced Dashboard Container with staggered entrance animations
 * Research shows this increases user engagement and perceived speed
 */

interface AnimatedDashboardProps {
  children: ReactNode;
  className?: string;
}

export function AnimatedDashboard({ children, className = '' }: AnimatedDashboardProps) {
  const shouldReduceMotion = useReducedMotion();

  const containerVariants = {
    // opacity honours the preference too (US-821). Neutralising y and scale
    // while still starting at 0 leaves a fade, and a fade is motion -- someone
    // who asked for less of it gets the dashboard materialising anyway. It
    // also means content sits at opacity 0 until framer-motion runs, so
    // anything reading the page before then sees invisible text.
    hidden: { opacity: shouldReduceMotion ? 1 : 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.08,
        delayChildren: shouldReduceMotion ? 0 : 0.1,
      },
    },
  };

  return (
    <LazyMotion features={domAnimation} strict>
      <m.div
        className={className}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {children}
      </m.div>
    </LazyMotion>
  );
}

/**
 * Animated Dashboard Panel - for individual sections
 */
interface AnimatedPanelProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function AnimatedPanel({ children, className = '', delay = 0 }: AnimatedPanelProps) {
  const shouldReduceMotion = useReducedMotion();

  const itemVariants = {
    hidden: {
      opacity: shouldReduceMotion ? 1 : 0,
      y: shouldReduceMotion ? 0 : 20,
      scale: shouldReduceMotion ? 1 : 0.98,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: shouldReduceMotion ? 0 : 0.5,
        delay: shouldReduceMotion ? 0 : delay,
      },
    },
  };

  return (
    <m.div className={className} variants={itemVariants}>
      {children}
    </m.div>
  );
}

/**
 * Animated Stat Card - for stats with count-up animation
 */
interface AnimatedStatCardProps {
  value: number;
  label: string;
  color?: string;
  suffix?: string;
  icon?: ReactNode;
  tooltip?: string;
}

export function AnimatedStatCard({
  value,
  label,
  color = 'text-primary',
  suffix = '',
  icon,
  tooltip,
}: AnimatedStatCardProps) {
  const shouldReduceMotion = useReducedMotion();

  const itemVariants = {
    hidden: {
      opacity: shouldReduceMotion ? 1 : 0,
      y: shouldReduceMotion ? 0 : 15,
      scale: shouldReduceMotion ? 1 : 0.95,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: shouldReduceMotion ? 0 : 0.4,
      },
    },
  };

  return (
    <m.div variants={itemVariants}>
      <m.div
        whileHover={
          shouldReduceMotion
            ? {}
            : {
                scale: 1.02,
                y: -2,
                transition: { duration: 0.2 },
              }
        }
        className="h-full"
      >
        <div className="relative overflow-hidden rounded-lg border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
          {icon && (
            <div className="mb-2 opacity-20">
              {icon}
            </div>
          )}
          <p className="text-sm text-muted-foreground mb-1">
            {tooltip ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1 cursor-help">
                      {label} <CircleHelp className="h-3 w-3 text-muted-foreground" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              label
            )}
          </p>
          <m.p
            initial={{ opacity: shouldReduceMotion ? 1 : 0, scale: shouldReduceMotion ? 1 : 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: shouldReduceMotion ? 0 : 0.5,
              delay: shouldReduceMotion ? 0 : 0.3,
              type: 'spring',
              stiffness: 200,
            }}
            className={`text-3xl font-bold ${color}`}
          >
            {value}
            {suffix}
          </m.p>
        </div>
      </m.div>
    </m.div>
  );
}

/**
 * Animated Action Card - for quick action buttons
 */
interface AnimatedActionCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  onClick: () => void;
  color?: string;
}

export function AnimatedActionCard({
  title,
  description,
  icon,
  onClick,
  color = 'primary',
}: AnimatedActionCardProps) {
  const shouldReduceMotion = useReducedMotion();

  const itemVariants = {
    hidden: {
      opacity: shouldReduceMotion ? 1 : 0,
      y: shouldReduceMotion ? 0 : 20,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0 : 0.5,
      },
    },
  };

  return (
    <m.div variants={itemVariants}>
      <m.button
        onClick={onClick}
        whileHover={
          shouldReduceMotion
            ? {}
            : {
                scale: 1.02,
                y: -4,
                transition: { duration: 0.2 },
              }
        }
        whileTap={
          shouldReduceMotion
            ? {}
            : {
                scale: 0.98,
                transition: { duration: 0.1 },
              }
        }
        className="w-full text-left"
      >
        <div className="relative overflow-hidden rounded-xl border-2 border-border bg-card p-6 hover:shadow-lg transition-shadow group">
          {/* Gradient overlay on hover */}
          <m.div
            initial={{ opacity: 0 }}
            whileHover={{ opacity: shouldReduceMotion ? 0 : 0.05 }}
            transition={{ duration: 0.3 }}
            className={`absolute inset-0 bg-gradient-to-br from-${color}/10 to-transparent pointer-events-none`}
          />

          <div className="relative flex items-start gap-4">
            <m.div
              whileHover={
                shouldReduceMotion
                  ? {}
                  : {
                      rotate: [0, -10, 10, 0],
                      transition: { duration: 0.5 },
                    }
              }
              className={`flex-shrink-0 w-12 h-12 rounded-xl bg-${color}/10 flex items-center justify-center text-${color}`}
            >
              {icon}
            </m.div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold mb-1 group-hover:text-primary transition-colors">
                {title}
              </h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <m.svg
              className="flex-shrink-0 w-5 h-5 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              initial={{ x: 0 }}
              whileHover={
                shouldReduceMotion ? {} : { x: 4, transition: { duration: 0.2 } }
              }
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </m.svg>
          </div>
        </div>
      </m.button>
    </m.div>
  );
}

/**
 * Animated Welcome Banner
 */
interface AnimatedWelcomeBannerProps {
  name: string;
  subtitle: string;
}

export function AnimatedWelcomeBanner({ name, subtitle }: AnimatedWelcomeBannerProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="text-center mb-12">
        <m.div
          initial={{ opacity: shouldReduceMotion ? 1 : 0, scale: shouldReduceMotion ? 1 : 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            duration: shouldReduceMotion ? 0 : 0.5,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full mb-4"
        >
          <m.span
            animate={
              shouldReduceMotion
                ? {}
                : {
                    rotate: [0, 20, 0],
                    transition: {
                      duration: 2,
                      repeat: Infinity,
                      repeatDelay: 3,
                    },
                  }
            }
          >
            ✨
          </m.span>
          <span className="text-sm font-medium">EatPal Meal Planner</span>
        </m.div>

        <m.h2
          initial={{ opacity: shouldReduceMotion ? 1 : 0, y: shouldReduceMotion ? 0 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: shouldReduceMotion ? 0 : 0.6,
            delay: shouldReduceMotion ? 0 : 0.1,
          }}
          className="text-4xl md:text-5xl font-bold mb-4 text-foreground"
        >
          Welcome, {name}!
        </m.h2>

        <m.p
          initial={{ opacity: shouldReduceMotion ? 1 : 0, y: shouldReduceMotion ? 0 : 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: shouldReduceMotion ? 0 : 0.6,
            delay: shouldReduceMotion ? 0 : 0.2,
          }}
          className="text-lg text-muted-foreground max-w-2xl mx-auto"
        >
          {subtitle}
        </m.p>
      </div>
    </LazyMotion>
  );
}

