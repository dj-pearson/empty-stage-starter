import { useRef, useState } from 'react';
import { m, LazyMotion, domAnimation, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * 3D Card Tilt Effect
 * Adds depth and interactivity to cards on hover
 */

interface Card3DTiltProps {
  children: React.ReactNode;
  className?: string;
  tiltIntensity?: number;
  glareEffect?: boolean;
}

export function Card3DTilt({ 
  children, 
  className = '',
  tiltIntensity = 15,
  glareEffect = true
}: Card3DTiltProps) {
  const ref = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const [isHovered, setIsHovered] = useState(false);
  
  // Motion values for mouse position
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  // Spring physics for smooth movement
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [tiltIntensity, -tiltIntensity]), {
    stiffness: 200,
    damping: 20
  });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-tiltIntensity, tiltIntensity]), {
    stiffness: 200,
    damping: 20
  });
  
  // Glare effect position
  const glareX = useTransform(mouseX, [-0.5, 0.5], [0, 100]);
  const glareY = useTransform(mouseY, [-0.5, 0.5], [0, 100]);
  
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current || shouldReduceMotion) return;
    
    const rect = ref.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    
    mouseX.set(x);
    mouseY.set(y);
  };
  
  const handleMouseLeave = () => {
    setIsHovered(false);
    mouseX.set(0);
    mouseY.set(0);
  };
  
  if (shouldReduceMotion) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }
  
  return (
    <LazyMotion features={domAnimation} strict>
      <m.div
        ref={ref}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
          perspective: 1000
        }}
        className={`relative ${className}`}
      >
        {/* Glare effect overlay */}
        {glareEffect && isHovered && (
          <m.div
            style={{
              background: `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.3) 0%, transparent 50%)`,
            }}
            className="absolute inset-0 pointer-events-none z-10 rounded-inherit"
          />
        )}
        
        {/* Content with depth */}
        <div style={{ transform: 'translateZ(50px)' }}>
          {children}
        </div>
      </m.div>
    </LazyMotion>
  );
}

/**
 * Feature Card with 3D Tilt Effect
 * Pre-styled card component for features
 */
interface FeatureCard3DProps {
  icon: string;
  title: string;
  description: string;
  features?: string[];
}

export function FeatureCard3D({ icon, title, description, features }: FeatureCard3DProps) {
  const shouldReduceMotion = useReducedMotion();
  
  return (
    <Card3DTilt className="h-full min-h-[380px]">
      <m.div
        whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
        className="h-full bg-card dark:bg-card rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-shadow border-2 border-border dark:border-border flex flex-col"
      >
        {/* Icon */}
        <div className="text-6xl mb-4 flex-shrink-0">{icon}</div>
        
        {/* Title */}
        <h3 className="text-2xl font-bold mb-3 text-card-foreground dark:text-card-foreground flex-shrink-0">{title}</h3>
        
        {/* Description */}
        <p className="text-muted-foreground dark:text-muted-foreground leading-relaxed flex-grow">{description}</p>
        
        {/* Features list if provided */}
        {features && features.length > 0 && (
          <ul className="space-y-2 mt-4 flex-shrink-0">
            {features.map((feature, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground dark:text-muted-foreground">
                <span className="text-trust-green mt-0.5">✓</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        )}
      </m.div>
    </Card3DTilt>
  );
}

