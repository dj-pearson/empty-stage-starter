import { ReactNode } from 'react';
import { motion, LazyMotion, domAnimation, m } from 'framer-motion';
import { useInView } from '@/hooks/useInView';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface AnimatedSectionProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  staggerChildren?: boolean;
  once?: boolean;
}

/**
 * Reusable animated section component with accessibility support
 * Automatically respects user's motion preferences
 * Uses LazyMotion for 86% bundle size reduction
 */
export function AnimatedSection({
  children,
  className = '',
  delay = 0,
  direction = 'up',
  staggerChildren = false,
  once = true,
}: AnimatedSectionProps) {
  const { ref, inView } = useInView({ triggerOnce: once, threshold: 0.1 });
  const shouldReduceMotion = useReducedMotion();

  // Direction mappings
  const directionMap = {
    up: { y: shouldReduceMotion ? 0 : 30, x: 0 },
    down: { y: shouldReduceMotion ? 0 : -30, x: 0 },
    left: { x: shouldReduceMotion ? 0 : 30, y: 0 },
    right: { x: shouldReduceMotion ? 0 : -30, y: 0 },
  };

  const containerVariants = staggerChildren
    ? {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: shouldReduceMotion ? 0 : 0.1,
            delayChildren: shouldReduceMotion ? 0 : delay,
          },
        },
      }
    : undefined;

  const itemVariants = {
    hidden: {
      opacity: 0,
      ...directionMap[direction],
    },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0 : 0.6,
        delay: shouldReduceMotion ? 0 : delay,
        ease: [0.25, 0.46, 0.45, 0.94], // easeOutQuart
      },
    },
  };

  return (
    <LazyMotion features={domAnimation} strict>
      <m.div
        ref={ref as any}
        className={className}
        initial="hidden"
        animate={inView ? 'visible' : 'hidden'}
        variants={staggerChildren ? containerVariants : itemVariants}
      >
        {children}
      </m.div>
    </LazyMotion>
  );
}

/**
 * Child component for staggered animations
 * Use within AnimatedSection when staggerChildren is true
 */
export function AnimatedItem({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();

  const itemVariants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0 : 0.5,
        ease: [0.25, 0.46, 0.45, 0.94],
      },
    },
  };

  return (
    <m.div className={className} variants={itemVariants}>
      {children}
    </m.div>
  );
}

