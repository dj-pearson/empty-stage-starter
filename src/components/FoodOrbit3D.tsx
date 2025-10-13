import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, Text3D, Float } from '@react-three/drei';
import * as THREE from 'three';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Individual floating food emoji sphere
 */
interface FoodItemProps {
  emoji: string;
  position: [number, number, number];
  orbitRadius: number;
  orbitSpeed: number;
  color: string;
}

function FoodItem({ emoji, position, orbitRadius, orbitSpeed, color }: FoodItemProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const shouldReduceMotion = useReducedMotion();
  
  // Randomize initial rotation for variety
  const initialRotation = useMemo(() => Math.random() * Math.PI * 2, []);
  
  useFrame((state) => {
    if (!meshRef.current || shouldReduceMotion) return;
    
    const time = state.clock.getElapsedTime();
    
    // Orbital motion
    const angle = initialRotation + time * orbitSpeed;
    meshRef.current.position.x = position[0] + Math.cos(angle) * orbitRadius;
    meshRef.current.position.z = position[2] + Math.sin(angle) * orbitRadius;
    
    // Gentle bobbing
    meshRef.current.position.y = position[1] + Math.sin(time * 0.5) * 0.3;
    
    // Slow rotation
    meshRef.current.rotation.y += 0.01;
  });

  return (
    <Float
      speed={shouldReduceMotion ? 0 : 1.5}
      rotationIntensity={shouldReduceMotion ? 0 : 0.5}
      floatIntensity={shouldReduceMotion ? 0 : 0.5}
    >
      <mesh ref={meshRef} position={position}>
        {/* Sphere with emoji texture */}
        <Sphere args={[0.5, 32, 32]}>
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.2}
            roughness={0.5}
            metalness={0.3}
          />
        </Sphere>
        
        {/* Emoji as text (simplified - in production you'd use textures) */}
        <mesh position={[0, 0, 0.51]}>
          <planeGeometry args={[0.8, 0.8]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </mesh>
    </Float>
  );
}

/**
 * 3D Scene with orbiting food items
 */
function FoodOrbitScene() {
  const shouldReduceMotion = useReducedMotion();
  
  // Define food items with positions and colors
  const foodItems = useMemo(() => [
    { emoji: '🍎', position: [2, 1, 0] as [number, number, number], color: '#ef4444', orbitRadius: 0.5, orbitSpeed: 0.3 },
    { emoji: '🥦', position: [-2, 0.5, 0] as [number, number, number], color: '#22c55e', orbitRadius: 0.4, orbitSpeed: 0.4 },
    { emoji: '🥕', position: [0, 2, -1] as [number, number, number], color: '#f97316', orbitRadius: 0.6, orbitSpeed: 0.25 },
    { emoji: '🍌', position: [1.5, -1, 1] as [number, number, number], color: '#fbbf24', orbitRadius: 0.5, orbitSpeed: 0.35 },
    { emoji: '🍓', position: [-1.5, 1.5, 1] as [number, number, number], color: '#dc2626', orbitRadius: 0.3, orbitSpeed: 0.45 },
    { emoji: '🍊', position: [0, -0.5, -2] as [number, number, number], color: '#fb923c', orbitRadius: 0.4, orbitSpeed: 0.3 },
  ], []);

  return (
    <>
      {/* Ambient light for overall scene */}
      <ambientLight intensity={0.5} />
      
      {/* Directional light for depth */}
      <directionalLight position={[10, 10, 5]} intensity={1} />
      
      {/* Point light for highlights */}
      <pointLight position={[0, 5, 5]} intensity={0.5} color="#7ED321" />
      
      {/* Render food items */}
      {foodItems.map((item, index) => (
        <FoodItem
          key={index}
          emoji={item.emoji}
          position={item.position}
          orbitRadius={item.orbitRadius}
          orbitSpeed={item.orbitSpeed}
          color={item.color}
        />
      ))}
      
      {/* Optional: Add orbit controls for debugging (remove in production) */}
      {/* <OrbitControls enableZoom={false} enablePan={false} /> */}
    </>
  );
}

/**
 * 3D Food Orbit Component
 * Desktop-only floating food visualization for hero section
 */
interface FoodOrbit3DProps {
  className?: string;
}

export function FoodOrbit3D({ className = '' }: FoodOrbit3DProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className={`${className} pointer-events-none`}>
      <Canvas
        camera={{ position: [0, 0, 8], fov: 45 }}
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
        {!shouldReduceMotion && <FoodOrbitScene />}
      </Canvas>
    </div>
  );
}

/**
 * Simple 2D fallback for mobile/reduced motion
 */
export function FoodOrbitFallback({ className = '' }: FoodOrbit3DProps) {
  return (
    <div className={`${className} flex items-center justify-center gap-8 text-6xl opacity-30`}>
      <span className="animate-bounce" style={{ animationDelay: '0s' }}>🍎</span>
      <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>🥦</span>
      <span className="animate-bounce" style={{ animationDelay: '0.4s' }}>🥕</span>
      <span className="animate-bounce" style={{ animationDelay: '0.6s' }}>🍌</span>
      <span className="animate-bounce" style={{ animationDelay: '0.8s' }}>🍓</span>
    </div>
  );
}

