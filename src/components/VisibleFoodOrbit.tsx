import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * DRAMATIC ballpit-style floating food emojis
 * BIG movements, rotation, and scale changes!
 */
interface VisibleFoodOrbitProps {
  className?: string;
}

export function VisibleFoodOrbit({ className = '' }: VisibleFoodOrbitProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <VisibleFoodFallback className={className} />;
  }

  return (
    <div className={`${className} absolute inset-0 pointer-events-none overflow-hidden`}>
      {/* DRAMATIC floating food emojis with BIG ballpit-style movements */}
      
      {/* Apple - BIG drift with rotation & scale */}
      <div className="absolute text-8xl animate-drift opacity-70 hover:opacity-100 transition-opacity" 
           style={{ top: '15%', left: '15%', animationDelay: '0s', animationDuration: '5s' }}>
        🍎
      </div>
      
      {/* Broccoli - dramatic wiggle */}
      <div className="absolute text-7xl animate-wiggle opacity-65 hover:opacity-100 transition-opacity" 
           style={{ top: '25%', right: '10%', animationDelay: '0.8s', animationDuration: '4s' }}>
        🥦
      </div>
      
      {/* Carrot - BIG orbital motion */}
      <div className="absolute text-8xl animate-orbit opacity-70 hover:opacity-100 transition-opacity" 
           style={{ top: '55%', left: '8%', animationDelay: '1.5s', animationDuration: '7s' }}>
        🥕
      </div>
      
      {/* Banana - fast drift */}
      <div className="absolute text-7xl animate-drift opacity-60 hover:opacity-100 transition-opacity" 
           style={{ top: '70%', right: '12%', animationDelay: '2.2s', animationDuration: '5.5s' }}>
        🍌
      </div>
      
      {/* Strawberry - bouncy motion */}
      <div className="absolute text-6xl animate-bounce-dynamic opacity-60 hover:opacity-100 transition-opacity" 
           style={{ top: '8%', left: '45%', animationDelay: '0.3s', animationDuration: '3.5s' }}>
        🍓
      </div>
      
      {/* Orange - slow orbital */}
      <div className="absolute text-7xl animate-orbit opacity-65 hover:opacity-100 transition-opacity" 
           style={{ bottom: '18%', left: '5%', animationDelay: '1s', animationDuration: '8s' }}>
        🍊
      </div>
      
      {/* Lettuce - wiggle motion */}
      <div className="absolute text-7xl animate-wiggle opacity-60 hover:opacity-100 transition-opacity" 
           style={{ top: '18%', right: '5%', animationDelay: '1.8s', animationDuration: '4.5s' }}>
        🥬
      </div>
      
      {/* Tomato - bouncy */}
      <div className="absolute text-8xl animate-bounce-dynamic opacity-70 hover:opacity-100 transition-opacity" 
           style={{ bottom: '12%', right: '38%', animationDelay: '2.5s', animationDuration: '4s' }}>
        🍅
      </div>

      {/* Extra items for more movement */}
      <div className="absolute text-6xl animate-drift opacity-50 hover:opacity-100 transition-opacity" 
           style={{ top: '40%', right: '25%', animationDelay: '3s', animationDuration: '6s' }}>
        🫐
      </div>
      
      <div className="absolute text-7xl animate-wiggle opacity-55 hover:opacity-100 transition-opacity" 
           style={{ bottom: '35%', left: '30%', animationDelay: '3.5s', animationDuration: '4.2s' }}>
        🥑
      </div>
    </div>
  );
}

/**
 * Simple fallback for reduced motion
 */
export function VisibleFoodFallback({ className = '' }: VisibleFoodOrbitProps) {
  const foods = ['🍎', '🥦', '🥕', '🍌', '🍓', '🍊', '🥬', '🍅', '🫐', '🥑'];
  
  return (
    <div className={`${className} flex flex-wrap items-center justify-center gap-8 p-12 opacity-30`}>
      {foods.map((emoji, i) => (
        <span
          key={i}
          className="text-6xl"
          style={{
            animationDelay: `${i * 0.2}s`,
          }}
        >
          {emoji}
        </span>
      ))}
    </div>
  );
}

