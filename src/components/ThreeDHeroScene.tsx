import { Canvas } from '@react-three/fiber';
import { Float, Html, PerspectiveCamera } from '@react-three/drei';
import { Suspense, Component, ReactNode } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

// Error boundary for 3D canvas - prevents crashes from breaking the page
class Canvas3DErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    // Log error but don't crash the page
    console.warn('[ThreeDHeroScene] 3D rendering failed, falling back to static view:', error.message);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}

function FloatingEmoji({ emoji, position, delay = 0, speed = 1 }: { emoji: string; position: [number, number, number]; delay?: number; speed?: number }) {
  return (
    <Float speed={speed} rotationIntensity={1} floatIntensity={2} floatingRange={[-0.5, 0.5]}>
      <group position={position}>
        <Html transform>
          <div className="text-6xl select-none filter drop-shadow-lg" style={{ animationDelay: `${delay}s` }}>
            {emoji}
          </div>
        </Html>
      </group>
    </Float>
  );
}

function GlassShape({ position, scale, type, color }: { position: [number, number, number]; scale: number; type: 'torus' | 'sphere' | 'icosahedron'; color: string }) {
  return (
    <Float speed={2} rotationIntensity={2} floatIntensity={1}>
      <mesh position={position} scale={scale}>
        {type === 'torus' && <torusGeometry args={[1, 0.3, 16, 32]} />}
        {type === 'sphere' && <sphereGeometry args={[1, 32, 32]} />}
        {type === 'icosahedron' && <icosahedronGeometry args={[1, 0]} />}
        <meshPhysicalMaterial
          roughness={0.2}
          metalness={0.1}
          transmission={0.9} // Glass effect
          thickness={1.5} // Refraction
          color={color}
          transparent
          opacity={0.6}
        />
      </mesh>
    </Float>
  );
}

function SceneContent() {
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 10]} fov={50} />
      
      {/* Lighting for Glass Effect */}
      <ambientLight intensity={1} />
      <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={2} castShadow />
      <pointLight position={[-10, -10, -10]} intensity={1} color="#ffcccc" />
      
      {/* Additional lighting for glass effect reflections - no external HDR dependency */}
      <directionalLight position={[5, 5, 5]} intensity={0.5} color="#ffffff" />
      <directionalLight position={[-5, 5, -5]} intensity={0.3} color="#ffeecc" />

      {/* Floating Glass Shapes - Modern Abstract Background */}
      <GlassShape position={[-4, 2, -2]} scale={1.5} type="torus" color="#ff9999" />
      <GlassShape position={[4, -2, -3]} scale={2} type="sphere" color="#99ff99" />
      <GlassShape position={[5, 3, -5]} scale={1.2} type="icosahedron" color="#9999ff" />
      <GlassShape position={[-5, -3, -4]} scale={1.8} type="torus" color="#ffff99" />

      {/* Floating Fruits - Keeping the theme but making it 3D */}
      <FloatingEmoji emoji="🍎" position={[-2, 1, 0]} speed={1.5} />
      <FloatingEmoji emoji="🥦" position={[2, 2, 1]} speed={1.2} delay={1} />
      <FloatingEmoji emoji="🥕" position={[-3, -2, 0.5]} speed={1.8} delay={0.5} />
      <FloatingEmoji emoji="🍌" position={[3, -1, 0]} speed={1.3} delay={1.5} />
      <FloatingEmoji emoji="🍓" position={[0, 3, -1]} speed={1.6} delay={2} />
      <FloatingEmoji emoji="🥑" position={[0, -3, -1]} speed={1.4} delay={2.5} />
    </>
  );
}

export function ThreeDHeroScene({ className = '' }: { className?: string }) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return null; // Or return the fallback directly if preferred, but LazyFoodOrbit handles fallback logic
  }

  return (
    <div className={className}>
      <Canvas3DErrorBoundary fallback={null}>
        <Canvas dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
          <Suspense fallback={null}>
            <SceneContent />
          </Suspense>
        </Canvas>
      </Canvas3DErrorBoundary>
    </div>
  );
}
