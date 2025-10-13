import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere } from '@react-three/drei';
import * as THREE from 'three';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Individual physics ball
 */
interface PhysicsBallProps {
  position: [number, number, number];
  velocity: [number, number, number];
  color: string;
  size: number;
}

function PhysicsBall({ position: initialPosition, velocity: initialVelocity, color, size }: PhysicsBallProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const velocityRef = useRef<THREE.Vector3>(new THREE.Vector3(...initialVelocity));
  const positionRef = useRef<THREE.Vector3>(new THREE.Vector3(...initialPosition));
  const shouldReduceMotion = useReducedMotion();

  useFrame((state, delta) => {
    if (!meshRef.current || shouldReduceMotion) return;

    const velocity = velocityRef.current;
    const position = positionRef.current;

    // Apply gravity
    velocity.y -= 9.8 * delta;

    // Update position based on velocity
    position.x += velocity.x * delta;
    position.y += velocity.y * delta;
    position.z += velocity.z * delta;

    // Boundary collisions (bounce)
    const bounds = { x: 4, y: 3, z: 2 };

    // X bounds
    if (position.x > bounds.x || position.x < -bounds.x) {
      velocity.x *= -0.8; // Damping
      position.x = Math.max(-bounds.x, Math.min(bounds.x, position.x));
    }

    // Y bounds (floor and ceiling)
    if (position.y < -bounds.y) {
      velocity.y *= -0.85; // Bounce damping
      position.y = -bounds.y;
      velocity.x *= 0.95; // Friction
      velocity.z *= 0.95;
    }
    if (position.y > bounds.y) {
      velocity.y *= -0.8;
      position.y = bounds.y;
    }

    // Z bounds
    if (position.z > bounds.z || position.z < -bounds.z) {
      velocity.z *= -0.8;
      position.z = Math.max(-bounds.z, Math.min(bounds.z, position.z));
    }

    // Update mesh position
    meshRef.current.position.copy(position);

    // Slow rotation for visual interest
    meshRef.current.rotation.x += velocity.x * 0.1;
    meshRef.current.rotation.y += velocity.y * 0.1;
  });

  return (
    <mesh ref={meshRef} position={initialPosition}>
      <Sphere args={[size, 16, 16]}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.2}
          roughness={0.4}
          metalness={0.6}
        />
      </Sphere>
    </mesh>
  );
}

/**
 * Physics Ball Pit Scene
 */
function BallPitScene() {
  const shouldReduceMotion = useReducedMotion();

  // Generate random balls
  const balls = useMemo(() => {
    const colors = ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'];
    return Array.from({ length: 15 }, (_, i) => ({
      id: i,
      position: [
        (Math.random() - 0.5) * 6,
        Math.random() * 4 - 1,
        (Math.random() - 0.5) * 3,
      ] as [number, number, number],
      velocity: [
        (Math.random() - 0.5) * 2,
        Math.random() * 3,
        (Math.random() - 0.5) * 2,
      ] as [number, number, number],
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 0.3 + Math.random() * 0.3,
    }));
  }, []);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1} />
      <pointLight position={[0, 0, 5]} intensity={0.5} color="#7ED321" />

      {/* Render balls */}
      {!shouldReduceMotion &&
        balls.map((ball) => (
          <PhysicsBall
            key={ball.id}
            position={ball.position}
            velocity={ball.velocity}
            color={ball.color}
            size={ball.size}
          />
        ))}

      {/* Floor plane (invisible but helps with depth perception) */}
      <mesh position={[0, -3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial transparent opacity={0.05} color="#7ED321" />
      </mesh>
    </>
  );
}

/**
 * Interactive Physics Ball Pit
 * Fun, playful element for engagement
 */
interface BallPit3DProps {
  className?: string;
}

export function BallPit3D({ className = '' }: BallPit3DProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className={`${className} pointer-events-none`}>
      <Canvas
        camera={{ position: [0, 0, 10], fov: 50 }}
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
        {!shouldReduceMotion && <BallPitScene />}
      </Canvas>
    </div>
  );
}

/**
 * 2D Fallback for mobile
 */
export function BallPitFallback({ className = '' }: BallPit3DProps) {
  return (
    <div className={`${className} flex flex-wrap items-center justify-center gap-4 p-8`}>
      {['🔴', '🟢', '🔵', '🟡', '🟣', '🟠'].map((emoji, i) => (
        <span
          key={i}
          className="text-4xl opacity-50"
          style={{
            animation: `bounce 2s ease-in-out infinite`,
            animationDelay: `${i * 0.2}s`,
          }}
        >
          {emoji}
        </span>
      ))}
    </div>
  );
}

