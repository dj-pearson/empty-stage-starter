import { ReactNode } from 'react';
import { Sparkles, Heart, TrendingUp, Star, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MotivationalMessageProps {
  type?: 'greeting' | 'encouragement' | 'celebration' | 'tip' | 'progress';
  time?: 'morning' | 'afternoon' | 'evening';
  message?: string;
  event?: 'refusal' | 'success' | 'streak' | 'milestone';
  className?: string;
  childName?: string;
}

const getTimeBasedGreeting = (time?: 'morning' | 'afternoon' | 'evening', childName?: string): string => {
  const now = new Date().getHours();
  const actualTime = time || (now < 12 ? 'morning' : now < 17 ? 'afternoon' : 'evening');
  const name = childName || "your child";

  const greetings = {
    morning: [
      `Good morning! ${name}'s breakfast is ready to go 🌅`,
      "Rise and shine! Let's start the day deliciously ☀️",
      "Morning! Ready to make mealtime magical? ✨",
    ],
    afternoon: [
      "Lunch time! Remember: Progress, not perfection 💪",
      "Afternoon! Every bite is a step forward 🎯",
      "Time to refuel! You're doing great 🌟",
    ],
    evening: [
      "Dinner crew, assemble! You've got this 🍽️",
      "Evening time! Let's make dinner delightful 🌙",
      "Dinner's ready! One meal at a time 💫",
    ],
  };

  const messages = greetings[actualTime];
  return messages[Math.floor(Math.random() * messages.length)];
};

const getEncouragementMessage = (event?: string, childName?: string): string => {
  const name = childName || "They";

  const messages = {
    refusal: [
      "That's okay! Some foods take 10+ tries. You're doing great ❤️",
      "No worries! Every 'no' gets us closer to a 'yes' 💙",
      "Perfectly normal! Keep offering without pressure 🌈",
    ],
    success: [
      `Woohoo! ${name} ate it all! Victory dance time 💃`,
      "Amazing! That's huge progress! 🎉",
      "Fantastic job! Celebration mode activated! 🎊",
    ],
    streak: [
      "You're on fire! Keep up the consistency! 🔥",
      "Amazing streak! This is how habits form! ⭐",
      "Incredible dedication! You're crushing it! 💪",
    ],
    milestone: [
      "New milestone achieved! You're amazing! 🏆",
      "What an accomplishment! So proud! 🌟",
      "Milestone unlocked! This is incredible! 🎯",
    ],
  };

  if (event && event in messages) {
    const eventMessages = messages[event as keyof typeof messages];
    return eventMessages[Math.floor(Math.random() * eventMessages.length)];
  }

  // Default encouragement
  const defaultMessages = [
    "Every meal is progress, no matter the result! 💙",
    "You're building healthy eating habits together! 🌱",
    "Small steps lead to big wins! Keep going! ✨",
    "Your patience and consistency matter! 💚",
  ];

  return defaultMessages[Math.floor(Math.random() * defaultMessages.length)];
};

const getTipMessage = (): string => {
  const tips = [
    "💡 Tip: Kids may need to see a food 10-15 times before trying it!",
    "💡 Tip: Try serving new foods alongside favorite ones!",
    "💡 Tip: Let your child explore food without pressure to eat it!",
    "💡 Tip: Eating together as a family helps picky eaters!",
    "💡 Tip: Keep portions small - they can always ask for more!",
    "💡 Tip: Praise trying over eating - effort is what counts!",
  ];

  return tips[Math.floor(Math.random() * tips.length)];
};

const getIcon = (type?: string): ReactNode => {
  const icons = {
    greeting: Sparkles,
    encouragement: Heart,
    celebration: Trophy,
    tip: Star,
    progress: TrendingUp,
  };

  const IconComponent = icons[(type as keyof typeof icons)] || Sparkles;
  return <IconComponent className="h-5 w-5" />;
};

export function MotivationalMessage({
  type = 'greeting',
  time,
  message,
  event,
  className,
  childName,
}: MotivationalMessageProps) {
  let displayMessage = message;

  if (!displayMessage) {
    switch (type) {
      case 'greeting':
        displayMessage = getTimeBasedGreeting(time, childName);
        break;
      case 'encouragement':
        displayMessage = getEncouragementMessage(event, childName);
        break;
      case 'celebration':
        displayMessage = getEncouragementMessage(event || 'success', childName);
        break;
      case 'tip':
        displayMessage = getTipMessage();
        break;
      case 'progress':
        displayMessage = getEncouragementMessage('streak', childName);
        break;
      default:
        displayMessage = getEncouragementMessage(undefined, childName);
    }
  }

  const bgColors = {
    greeting: 'bg-primary/5 border-primary/20',
    encouragement: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800',
    celebration: 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800',
    tip: 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800',
    progress: 'bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800',
  };

  const textColors = {
    greeting: 'text-primary',
    encouragement: 'text-blue-700 dark:text-blue-300',
    celebration: 'text-green-700 dark:text-green-300',
    tip: 'text-yellow-700 dark:text-yellow-300',
    progress: 'text-purple-700 dark:text-purple-300',
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border',
        bgColors[type],
        className
      )}
    >
      <div className={cn('mt-0.5', textColors[type])}>
        {getIcon(type)}
      </div>
      <p className={cn('text-sm font-medium flex-1', textColors[type])}>
        {displayMessage}
      </p>
    </div>
  );
}
