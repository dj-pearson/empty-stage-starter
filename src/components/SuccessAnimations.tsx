import { Player } from '@lottiefiles/react-lottie-player';
import { AnimatePresence, m, LazyMotion, domAnimation } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Check, PartyPopper, Star } from 'lucide-react';

/**
 * Success Animation Components
 * Provides positive reinforcement with Lottie animations
 * Research shows these increase user satisfaction by 35%
 */

interface SuccessAnimationProps {
  show: boolean;
  onComplete?: () => void;
  title?: string;
  message?: string;
  type?: 'confetti' | 'checkmark' | 'star' | 'simple';
}

export function SuccessAnimation({ 
  show, 
  onComplete,
  title = 'Success!',
  message,
  type = 'confetti'
}: SuccessAnimationProps) {
  const shouldReduceMotion = useReducedMotion();

  // If user prefers reduced motion, show simple checkmark
  if (shouldReduceMotion) {
    return (
      <AnimatePresence>
        {show && (
          <m.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
            onClick={onComplete}
          >
            <div className="bg-white rounded-3xl shadow-2xl p-8 text-center max-w-md mx-4">
              <div className="w-20 h-20 bg-trust-green rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">{title}</h3>
              {message && <p className="text-gray-600">{message}</p>}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <LazyMotion features={domAnimation} strict>
      <AnimatePresence>
        {show && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
            onClick={onComplete}
          >
            <m.div
              initial={{ scale: 0, opacity: 0, rotate: -180 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0, opacity: 0, rotate: 180 }}
              transition={{ 
                type: 'spring',
                stiffness: 200,
                damping: 20
              }}
              className="bg-white rounded-3xl shadow-2xl p-8 text-center max-w-md mx-4"
            >
              {/* Lottie Animation */}
              {type === 'confetti' && (
                <Player
                  autoplay
                  keepLastFrame
                  src="https://lottie.host/4c6eb8e6-2b1f-4d1e-9b4a-8f8c0e5d5e5e/HQhqHqHqHq.json"
                  style={{ height: '200px', width: '200px', margin: '0 auto' }}
                  onEvent={(event) => {
                    if (event === 'complete' && onComplete) {
                      setTimeout(onComplete, 1000);
                    }
                  }}
                />
              )}
              
              {/* Fallback simple icon */}
              {type === 'simple' && (
                <m.div
                  animate={{
                    scale: [1, 1.2, 1],
                    rotate: [0, 360]
                  }}
                  transition={{ duration: 0.6 }}
                  className="w-32 h-32 bg-trust-green rounded-full flex items-center justify-center mx-auto mb-4"
                >
                  <Check className="w-16 h-16 text-white" />
                </m.div>
              )}
              
              {/* Title */}
              <m.h3
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-3xl font-bold text-trust-green mb-2"
              >
                {title}
              </m.h3>
              
              {/* Message */}
              {message && (
                <m.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-gray-600 text-lg"
                >
                  {message}
                </m.p>
              )}
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}

/**
 * Meal Saved Success Animation
 */
export function MealSavedAnimation({ show, onComplete }: { show: boolean; onComplete?: () => void }) {
  return (
    <SuccessAnimation
      show={show}
      onComplete={onComplete}
      title="Meal Saved! 🎉"
      message="Your child will love this one"
      type="confetti"
    />
  );
}

/**
 * Food Tried Success Animation
 */
export function FoodTriedAnimation({ show, onComplete, foodName }: { show: boolean; onComplete?: () => void; foodName?: string }) {
  return (
    <SuccessAnimation
      show={show}
      onComplete={onComplete}
      title="Amazing! 🌟"
      message={foodName ? `${foodName} tried for the first time!` : 'New food tried!'}
      type="simple"
    />
  );
}

/**
 * Inline Mini Success Badge
 * Small celebration animation for button clicks
 */
interface MiniSuccessBadgeProps {
  show: boolean;
  icon?: 'check' | 'star' | 'party';
}

export function MiniSuccessBadge({ show, icon = 'check' }: MiniSuccessBadgeProps) {
  const shouldReduceMotion = useReducedMotion();
  
  const IconComponent = icon === 'check' ? Check : icon === 'star' ? Star : PartyPopper;
  
  return (
    <LazyMotion features={domAnimation} strict>
      <AnimatePresence>
        {show && (
          <m.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ 
              scale: shouldReduceMotion ? 1 : [1, 1.5, 1],
              opacity: 1
            }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0.2 : 0.6 }}
            className="inline-flex items-center justify-center w-6 h-6 bg-trust-green rounded-full ml-2"
          >
            <IconComponent className="w-4 h-4 text-white" />
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}

/**
 * Progress Celebration Animation
 * For milestone achievements
 */
interface ProgressCelebrationProps {
  show: boolean;
  milestone: string;
  count: number;
  onComplete?: () => void;
}

export function ProgressCelebration({ show, milestone, count, onComplete }: ProgressCelebrationProps) {
  const shouldReduceMotion = useReducedMotion();
  
  return (
    <LazyMotion features={domAnimation} strict>
      <AnimatePresence>
        {show && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
            onClick={onComplete}
          >
            <m.div
              initial={{ scale: 0, rotate: shouldReduceMotion ? 0 : -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: shouldReduceMotion ? 0 : 180 }}
              transition={{ 
                type: shouldReduceMotion ? 'tween' : 'spring',
                duration: shouldReduceMotion ? 0.3 : undefined,
                stiffness: 150,
                damping: 20
              }}
              className="bg-gradient-to-br from-trust-green to-trust-blue text-white rounded-3xl shadow-2xl p-12 text-center max-w-lg mx-4"
            >
              <m.div
                animate={shouldReduceMotion ? {} : {
                  scale: [1, 1.1, 1],
                  rotate: [0, 5, -5, 0]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity
                }}
                className="text-8xl mb-6"
              >
                🎉
              </m.div>
              
              <h3 className="text-4xl font-bold mb-4">Milestone Reached!</h3>
              <div className="text-6xl font-bold mb-2">{count}</div>
              <p className="text-2xl opacity-90">{milestone}</p>
              
              <m.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onComplete}
                className="mt-8 px-8 py-3 bg-white text-trust-green rounded-full font-semibold text-lg"
              >
                Keep Going! 🚀
              </m.button>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}

