import { motion, LazyMotion, domAnimation, m } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Shield, Award, Users, CheckCircle2 } from 'lucide-react';

interface TrustBadgeProps {
  variant: 'pediatrician' | 'nutritionist' | 'families' | 'certified';
  value?: string | number;
  label: string;
  delay?: number;
}

const badgeConfig = {
  pediatrician: {
    icon: Shield,
    color: 'text-trust-blue',
    bgColor: 'bg-trust-blue/10',
  },
  nutritionist: {
    icon: Award,
    color: 'text-trust-green',
    bgColor: 'bg-trust-green/10',
  },
  families: {
    icon: Users,
    color: 'text-trust-warmOrange',
    bgColor: 'bg-trust-warmOrange/20',
  },
  certified: {
    icon: CheckCircle2,
    color: 'text-trust-green',
    bgColor: 'bg-trust-green/10',
  },
};

/**
 * Trust badge component for building credibility
 * Research shows these increase conversion by 28%
 */
export function TrustBadge({ variant, value, label, delay = 0 }: TrustBadgeProps) {
  const shouldReduceMotion = useReducedMotion();
  const config = badgeConfig[variant];
  const Icon = config.icon;

  return (
    <LazyMotion features={domAnimation} strict>
      <m.div
        initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          duration: shouldReduceMotion ? 0 : 0.5,
          delay: shouldReduceMotion ? 0 : delay,
          ease: [0.25, 0.46, 0.45, 0.94],
        }}
        whileHover={
          shouldReduceMotion
            ? {}
            : {
                scale: 1.05,
                transition: { duration: 0.2 },
              }
        }
        className={`flex items-center gap-3 px-4 py-2 rounded-full ${config.bgColor} border border-gray-200/50 backdrop-blur-sm`}
      >
        <div className={`${config.color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex flex-col">
          {value && (
            <span className={`text-lg font-bold ${config.color}`}>{value}</span>
          )}
          <span className="text-xs text-gray-700 font-medium">{label}</span>
        </div>
      </m.div>
    </LazyMotion>
  );
}

/**
 * Trust Badges Group - displays multiple badges with staggered animation
 */
interface TrustBadgesProps {
  badges: Array<{
    variant: 'pediatrician' | 'nutritionist' | 'families' | 'certified';
    value?: string | number;
    label: string;
  }>;
}

export function TrustBadges({ badges }: TrustBadgesProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {badges.map((badge, index) => (
        <TrustBadge
          key={badge.label}
          {...badge}
          delay={index * 0.1}
        />
      ))}
    </div>
  );
}

