import { useRef } from 'react';
import { m, LazyMotion, domAnimation, useScroll, useTransform, useSpring } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useIsDesktop } from '@/hooks/useIsDesktop';

/**
 * 3D Rotating Phone Mockup Showcase
 * Displays app screenshots in a premium 3D phone mockup
 */

interface Screenshot {
  src: string;
  alt: string;
  title: string;
  description: string;
}

interface ProductShowcase3DProps {
  screenshots?: Screenshot[];
  autoRotate?: boolean;
}

const defaultScreenshots: Screenshot[] = [
  {
    src: '/screenshots/meal-plan.png',
    alt: 'Weekly meal plan view',
    title: 'Weekly Meal Plans',
    description: '7-day personalized plans with safe foods and try bites'
  },
  {
    src: '/screenshots/progress.png',
    alt: 'Progress tracking dashboard',
    title: 'Track Progress',
    description: 'Visual dashboard showing foods tried and victories celebrated'
  },
  {
    src: '/screenshots/grocery.png',
    alt: 'Auto-generated grocery list',
    title: 'Smart Grocery Lists',
    description: 'Automatically generated from your meal plan'
  }
];

export function ProductShowcase3D({ 
  screenshots = defaultScreenshots,
  autoRotate = true 
}: ProductShowcase3DProps) {
  const ref = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const isDesktop = useIsDesktop(1024);
  
  // Scroll-based rotation
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  });
  
  // Smooth spring animation
  const rotateY = useSpring(
    useTransform(scrollYProgress, [0, 0.5, 1], autoRotate ? [-15, 0, 15] : [0, 0, 0]),
    { stiffness: 100, damping: 30 }
  );
  
  const y = useSpring(
    useTransform(scrollYProgress, [0, 0.5, 1], [100, 0, -100]),
    { stiffness: 100, damping: 30 }
  );
  
  const scale = useSpring(
    useTransform(scrollYProgress, [0, 0.3, 0.5, 0.7, 1], [0.8, 1, 1.05, 1, 0.8]),
    { stiffness: 100, damping: 30 }
  );

  // Fallback for mobile or reduced motion
  if (!isDesktop || shouldReduceMotion) {
    return (
      <section ref={ref} className="py-20 bg-gradient-to-b from-secondary/10 to-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-heading font-bold mb-4">
              See EatPal in Action
            </h2>
            <p className="text-xl text-muted-foreground">
              Everything you need to help your picky eater
            </p>
          </div>
          
          {/* Simple grid for mobile */}
          <div className="grid md:grid-cols-3 gap-8">
            {screenshots.map((screenshot, index) => (
              <div key={index} className="bg-white rounded-2xl shadow-lg overflow-hidden">
                <div className="aspect-[9/19] bg-gray-100 relative">
                  {/* Placeholder for screenshot */}
                  <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                    <span className="text-6xl">{index === 0 ? '🍽️' : index === 1 ? '📊' : '🛒'}</span>
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-bold mb-2">{screenshot.title}</h3>
                  <p className="text-gray-600">{screenshot.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <LazyMotion features={domAnimation} strict>
      <section ref={ref} className="py-32 bg-gradient-to-b from-secondary/10 to-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left Column - Text Content */}
            <div>
              <m.div
                initial={{ opacity: 0, x: shouldReduceMotion ? 0 : -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
              >
                <h2 className="text-4xl md:text-5xl font-heading font-bold mb-6">
                  A Beautiful App Your <br />
                  <span className="text-trust-green">Whole Family</span> Will Love
                </h2>
                <p className="text-xl text-muted-foreground mb-8">
                  Designed for busy parents who want the best for their picky eaters.
                  Simple, intuitive, and backed by pediatric nutrition science.
                </p>
                
                {/* Feature list */}
                <div className="space-y-4">
                  {screenshots.map((screenshot, index) => (
                    <m.div
                      key={index}
                      initial={{ opacity: 0, x: shouldReduceMotion ? 0 : -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.2 + (index * 0.1), duration: 0.5 }}
                      className="flex items-start gap-4 p-4 rounded-xl hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex-shrink-0 w-12 h-12 bg-trust-green/20 rounded-xl flex items-center justify-center">
                        <span className="text-2xl">
                          {index === 0 ? '🍽️' : index === 1 ? '📊' : '🛒'}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-bold text-lg mb-1">{screenshot.title}</h3>
                        <p className="text-gray-600">{screenshot.description}</p>
                      </div>
                    </m.div>
                  ))}
                </div>
              </m.div>
            </div>
            
            {/* Right Column - 3D Phone Mockup */}
            <div className="relative h-[700px] flex items-center justify-center perspective-1000">
              <m.div
                style={{
                  rotateY: shouldReduceMotion ? 0 : rotateY,
                  y: shouldReduceMotion ? 0 : y,
                  scale: shouldReduceMotion ? 1 : scale,
                  transformStyle: 'preserve-3d'
                }}
                className="relative"
              >
                {/* Phone Frame */}
                <div className="relative w-[300px] h-[620px] bg-gray-900 rounded-[3rem] shadow-2xl p-3">
                  {/* Screen */}
                  <div className="w-full h-full bg-white rounded-[2.5rem] overflow-hidden relative">
                    {/* Notch */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-7 bg-gray-900 rounded-b-3xl z-10" />
                    
                    {/* Screenshot Carousel */}
                    <m.div
                      animate={{
                        x: [0, -300, -600, 0]
                      }}
                      transition={{
                        duration: 12,
                        repeat: Infinity,
                        ease: "linear"
                      }}
                      className="flex h-full"
                    >
                      {[...screenshots, screenshots[0]].map((screenshot, index) => (
                        <div 
                          key={index}
                          className="flex-shrink-0 w-[276px] h-full bg-gradient-to-br from-trust-softPink/20 to-trust-blue/10 flex items-center justify-center"
                        >
                          {/* Placeholder content */}
                          <div className="text-center p-8">
                            <div className="text-6xl mb-4">
                              {index === 0 ? '🍽️' : index === 1 ? '📊' : '🛒'}
                            </div>
                            <h4 className="font-bold text-lg mb-2">{screenshot.title}</h4>
                            <p className="text-sm text-gray-600">{screenshot.description}</p>
                          </div>
                        </div>
                      ))}
                    </m.div>
                  </div>
                  
                  {/* Side buttons */}
                  <div className="absolute -left-1 top-24 w-1 h-12 bg-gray-800 rounded-l" />
                  <div className="absolute -left-1 top-40 w-1 h-16 bg-gray-800 rounded-l" />
                  <div className="absolute -right-1 top-32 w-1 h-20 bg-gray-800 rounded-r" />
                </div>
                
                {/* Floating elements for depth */}
                <m.div
                  animate={{
                    y: [0, -20, 0],
                    rotate: [0, 5, 0]
                  }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="absolute -right-12 top-20 text-6xl"
                  style={{ transform: 'translateZ(100px)' }}
                >
                  🍎
                </m.div>
                <m.div
                  animate={{
                    y: [0, 20, 0],
                    rotate: [0, -5, 0]
                  }}
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 1
                  }}
                  className="absolute -left-12 bottom-32 text-5xl"
                  style={{ transform: 'translateZ(80px)' }}
                >
                  🥦
                </m.div>
              </m.div>
            </div>
          </div>
        </div>
      </section>
    </LazyMotion>
  );
}
