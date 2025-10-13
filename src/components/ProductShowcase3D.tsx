import { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { RoundedBox, PerspectiveCamera, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * 3D Phone Mockup with rotating showcase
 */
function PhoneMockup3D() {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useFrame((state) => {
    if (!groupRef.current || shouldReduceMotion) return;

    // Continuous slow rotation
    const rotationSpeed = hovered ? 0.005 : 0.002;
    groupRef.current.rotation.y += rotationSpeed;

    // Gentle floating motion
    groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
  });

  return (
    <group
      ref={groupRef}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* Phone body */}
      <RoundedBox
        args={[1.5, 3, 0.2]}
        radius={0.15}
        smoothness={4}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color="#1f2937"
          metalness={0.9}
          roughness={0.1}
        />
      </RoundedBox>

      {/* Screen */}
      <RoundedBox
        args={[1.35, 2.7, 0.05]}
        radius={0.1}
        smoothness={4}
        position={[0, 0, 0.13]}
      >
        <meshStandardMaterial
          color="#000000"
          emissive="#7ED321"
          emissiveIntensity={0.3}
          metalness={0.5}
          roughness={0.2}
        />
      </RoundedBox>

      {/* Screen glow effect */}
      <mesh position={[0, 0, 0.15]}>
        <planeGeometry args={[1.2, 2.5]} />
        <meshBasicMaterial
          color="#7ED321"
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Camera notch */}
      <mesh position={[0, 1.2, 0.13]}>
        <cylinderGeometry args={[0.05, 0.05, 0.1, 16]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
    </group>
  );
}

/**
 * Product Showcase Scene
 */
function ProductShowcaseScene() {
  return (
    <>
      {/* Camera */}
      <PerspectiveCamera makeDefault position={[0, 0, 6]} fov={45} />

      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1} castShadow />
      <pointLight position={[-5, 5, 5]} intensity={0.5} color="#7ED321" />
      <spotLight
        position={[0, 10, 0]}
        angle={0.3}
        penumbra={1}
        intensity={0.5}
        castShadow
      />

      {/* Environment for reflections */}
      <Environment preset="city" />

      {/* Phone mockup */}
      <PhoneMockup3D />

      {/* Platform/pedestal */}
      <mesh position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[2, 64]} />
        <meshStandardMaterial
          color="#f3f4f6"
          metalness={0.1}
          roughness={0.8}
          transparent
          opacity={0.5}
        />
      </mesh>
    </>
  );
}

/**
 * 3D Product Showcase Component
 * Rotating phone mockup for features section
 */
interface ProductShowcase3DProps {
  className?: string;
}

export function ProductShowcase3D({ className = '' }: ProductShowcase3DProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className={className}>
      <Canvas
        shadows
        style={{
          width: '100%',
          height: '100%',
          background: 'transparent',
        }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
      >
        {!shouldReduceMotion && <ProductShowcaseScene />}
      </Canvas>
    </div>
  );
}

/**
 * 2D Fallback - static image with subtle animation
 */
export function ProductShowcaseFallback({ className = '' }: ProductShowcase3DProps) {
  return (
    <div className={`${className} flex items-center justify-center`}>
      <div className="relative">
        {/* Phone frame */}
        <div className="w-48 h-96 bg-gray-800 rounded-3xl shadow-2xl p-2 animate-float">
          {/* Screen */}
          <div className="w-full h-full bg-gradient-to-br from-trust-green to-trust-blue rounded-2xl flex items-center justify-center">
            <span className="text-6xl">📱</span>
          </div>
        </div>

        {/* Shadow */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-4 bg-black/20 rounded-full blur-xl" />
      </div>
    </div>
  );
}

