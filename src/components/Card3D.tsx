import { useRef, useState } from 'react';
import { m, LazyMotion, domAnimation } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * 3D Card with tilt effect on hover
 * Creates depth perception through transform3d
 */

interface Card3DProps {
  children: React.ReactNode;
  className?: string;
  intensity?: number; // 1-10, how much tilt
  glare?: boolean; // Show light glare effect
}

export function Card3D({
  children,
  className = '',
  intensity = 5,
  glare = true,
}: Card3DProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [glarePosition, setGlarePosition] = useState({ x: 50, y: 50 });
  const shouldReduceMotion = useReducedMotion();

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current || shouldReduceMotion) return;

    const card = cardRef.current;
    const rect = card.getBoundingClientRect();
    
    // Get mouse position relative to card center
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // Calculate rotation (range: -intensity to +intensity degrees)
    const rotX = ((y - centerY) / centerY) * -intensity;
    const rotY = ((x - centerX) / centerX) * intensity;
    
    setRotateX(rotX);
    setRotateY(rotY);
    
    // Calculate glare position (percentage)
    if (glare) {
      setGlarePosition({
        x: (x / rect.width) * 100,
        y: (y / rect.height) * 100,
      });
    }
  };

  const handleMouseLeave = () => {
    if (shouldReduceMotion) return;
    setRotateX(0);
    setRotateY(0);
    setGlarePosition({ x: 50, y: 50 });
  };

  return (
    <LazyMotion features={domAnimation} strict>
      <m.div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        animate={{
          rotateX: shouldReduceMotion ? 0 : rotateX,
          rotateY: shouldReduceMotion ? 0 : rotateY,
        }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 30,
        }}
        style={{
          transformStyle: 'preserve-3d',
          perspective: '1000px',
        }}
        className={`relative ${className}`}
      >
        {/* Card content with 3D transform */}
        <div
          style={{
            transform: 'translateZ(50px)',
            transformStyle: 'preserve-3d',
          }}
        >
          {children}
        </div>

        {/* Glare effect overlay */}
        {glare && !shouldReduceMotion && (
          <m.div
            className="absolute inset-0 pointer-events-none rounded-inherit"
            animate={{
              background: `radial-gradient(circle at ${glarePosition.x}% ${glarePosition.y}%, rgba(255,255,255,0.15) 0%, transparent 50%)`,
            }}
            transition={{ duration: 0.2 }}
          />
        )}

        {/* Subtle shadow for depth */}
        <m.div
          className="absolute inset-0 -z-10 bg-black/10 rounded-inherit blur-xl"
          animate={{
            x: shouldReduceMotion ? 0 : rotateY * 2,
            y: shouldReduceMotion ? 0 : rotateX * 2,
            opacity: shouldReduceMotion ? 0 : Math.abs(rotateX) + Math.abs(rotateY) > 2 ? 0.3 : 0.1,
          }}
          transition={{ duration: 0.2 }}
        />
      </m.div>
    </LazyMotion>
  );
}

/**
 * Simplified version for less intense effect
 */
export function CardSubtle3D({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <Card3D intensity={2} glare={false} className={className}>{children}</Card3D>;
}

