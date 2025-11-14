import { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  Star,
  Flame,
  Trophy,
  Target,
  TrendingUp,
  Award,
  Sparkles,
  CheckCircle2,
  Lock,
} from 'lucide-react';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: 'star' | 'flame' | 'trophy' | 'target' | 'trending' | 'award' | 'sparkles';
  unlocked: boolean;
  progress?: number; // 0-100
  total?: number;
  unlockedDate?: string;
  rarity?: 'common' | 'rare' | 'epic' | 'legendary';
}

interface AchievementBadgeProps {
  achievement: Achievement;
  size?: 'sm' | 'md' | 'lg';
  showProgress?: boolean;
}

const iconMap = {
  star: Star,
  flame: Flame,
  trophy: Trophy,
  target: Target,
  trending: TrendingUp,
  award: Award,
  sparkles: Sparkles,
};

const rarityColors = {
  common: {
    bg: 'bg-gray-500/10 dark:bg-gray-400/10',
    border: 'border-gray-500/20',
    text: 'text-gray-700 dark:text-gray-300',
    icon: 'text-gray-600 dark:text-gray-400',
  },
  rare: {
    bg: 'bg-blue-500/10 dark:bg-blue-400/10',
    border: 'border-blue-500/20',
    text: 'text-blue-700 dark:text-blue-300',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  epic: {
    bg: 'bg-purple-500/10 dark:bg-purple-400/10',
    border: 'border-purple-500/20',
    text: 'text-purple-700 dark:text-purple-300',
    icon: 'text-purple-600 dark:text-purple-400',
  },
  legendary: {
    bg: 'bg-yellow-500/10 dark:bg-yellow-400/10',
    border: 'border-yellow-500/20',
    text: 'text-yellow-700 dark:text-yellow-300',
    icon: 'text-yellow-600 dark:text-yellow-400',
  },
};

export function AchievementBadge({
  achievement,
  size = 'md',
  showProgress = true,
}: AchievementBadgeProps) {
  const Icon = iconMap[achievement.icon];
  const rarity = achievement.rarity || 'common';
  const colors = rarityColors[rarity];

  const sizeClasses = {
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  const iconSizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
  };

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all',
        achievement.unlocked
          ? `${colors.bg} ${colors.border} hover:shadow-lg hover:scale-105`
          : 'bg-muted/50 border-dashed opacity-60 grayscale'
      )}
    >
      <CardContent className={sizeClasses[size]}>
        <div className="flex flex-col items-center text-center gap-3">
          {/* Icon */}
          <div
            className={cn(
              'rounded-full p-3 transition-all',
              achievement.unlocked ? colors.bg : 'bg-muted'
            )}
          >
            {achievement.unlocked ? (
              <Icon className={cn(iconSizeClasses[size], colors.icon)} />
            ) : (
              <Lock className={cn(iconSizeClasses[size], 'text-muted-foreground')} />
            )}
          </div>

          {/* Title & Description */}
          <div>
            <h4
              className={cn(
                'font-semibold mb-1',
                size === 'sm' && 'text-sm',
                size === 'md' && 'text-base',
                size === 'lg' && 'text-lg',
                achievement.unlocked ? colors.text : 'text-muted-foreground'
              )}
            >
              {achievement.title}
            </h4>
            <p
              className={cn(
                'text-muted-foreground',
                size === 'sm' && 'text-xs',
                size === 'md' && 'text-sm',
                size === 'lg' && 'text-base'
              )}
            >
              {achievement.description}
            </p>
          </div>

          {/* Progress or Date */}
          {achievement.unlocked ? (
            <>
              {achievement.unlockedDate && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Unlocked {achievement.unlockedDate}</span>
                </div>
              )}
              {rarity !== 'common' && (
                <Badge variant="outline" className={cn('text-xs', colors.text)}>
                  {rarity.charAt(0).toUpperCase() + rarity.slice(1)}
                </Badge>
              )}
            </>
          ) : (
            <>
              {showProgress && typeof achievement.progress === 'number' && achievement.total && (
                <div className="w-full space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span>
                      {achievement.progress} / {achievement.total}
                    </span>
                  </div>
                  <Progress value={(achievement.progress / achievement.total) * 100} className="h-1.5" />
                </div>
              )}
            </>
          )}
        </div>

        {/* Shine effect for unlocked achievements */}
        {achievement.unlocked && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shine_3s_ease-in-out_infinite]" />
        )}
      </CardContent>
    </Card>
  );
}

// Predefined achievements
export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-bite',
    title: 'First Bite',
    description: 'Logged your first try bite',
    icon: 'star',
    unlocked: false,
    rarity: 'common',
  },
  {
    id: 'week-streak',
    title: 'Week Warrior',
    description: '7 days of consistent meal logging',
    icon: 'flame',
    unlocked: false,
    rarity: 'rare',
  },
  {
    id: 'bullseye',
    title: 'Bullseye',
    description: '5 successful try bites in a row',
    icon: 'target',
    unlocked: false,
    rarity: 'epic',
  },
  {
    id: 'food-explorer',
    title: 'Food Explorer',
    description: 'Try 25 new foods',
    icon: 'trophy',
    unlocked: false,
    progress: 0,
    total: 25,
    rarity: 'epic',
  },
  {
    id: 'rainbow-eater',
    title: 'Rainbow Eater',
    description: 'Eat foods from all color groups',
    icon: 'sparkles',
    unlocked: false,
    rarity: 'legendary',
  },
  {
    id: 'progress-pro',
    title: 'Progress Pro',
    description: '30 days of tracking',
    icon: 'trending',
    unlocked: false,
    progress: 0,
    total: 30,
    rarity: 'rare',
  },
  {
    id: 'pantry-pro',
    title: 'Pantry Pro',
    description: '50+ foods in pantry',
    icon: 'award',
    unlocked: false,
    progress: 0,
    total: 50,
    rarity: 'rare',
  },
];
