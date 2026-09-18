import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

/**
 * US-772: the same parallax, on framer-motion instead of GSAP ScrollTrigger.
 *
 * This component was the only importer of @gsap/react in the tree, and one of
 * two importers of gsap. framer-motion is already a dependency and already
 * animates eighteen other files here, so the parallax costs nothing extra;
 * ScrollTrigger cost a chunk the landing page fetched to move eight decorative
 * blobs.
 *
 * `useScroll` with `offset` gives the same window GSAP's
 * `start: "top top", end: "bottom top"` described, and `useTransform` is the
 * scrub. What is new is `useReducedMotion`: the GSAP version moved these for
 * everyone, including the people who asked their operating system not to.
 */

interface ParallaxElement {
  icon?: string;
  shape?: "circle" | "square" | "triangle";
  color?: string;
  size: number;
  top: string;
  left: string;
  depth: number; // 1 = close/fast, 0.1 = far/slow
  rotation?: number;
}

const DEFAULT_ELEMENTS: ParallaxElement[] = [
  // Food Icons
  { icon: "🥕", size: 60, top: "10%", left: "5%", depth: 0.5, rotation: 15 },
  { icon: "🥦", size: 50, top: "25%", left: "85%", depth: 0.8, rotation: -10 },
  { icon: "🍎", size: 70, top: "60%", left: "10%", depth: 0.4, rotation: 20 },
  { icon: "🍌", size: 55, top: "80%", left: "90%", depth: 0.6, rotation: -15 },
  { icon: "🥑", size: 45, top: "40%", left: "80%", depth: 0.3, rotation: 5 },

  // Abstract Shapes (using new palette)
  { shape: "circle", color: "bg-primary/10", size: 200, top: "15%", left: "70%", depth: 0.2 },
  { shape: "circle", color: "bg-secondary/10", size: 300, top: "50%", left: "-5%", depth: 0.15 },
  { shape: "circle", color: "bg-accent/10", size: 150, top: "85%", left: "60%", depth: 0.25 },
];

/** How far a depth-1 element travels across the container's scroll window. */
const TRAVEL_PX = 500;

/** GSAP added 45 degrees to each element's resting rotation over the scrub. */
const ROTATION_SWEEP_DEG = 45;

function ParallaxItem({
  element,
  progress,
  still,
}: {
  element: ParallaxElement;
  progress: ReturnType<typeof useScroll>["scrollYProgress"];
  still: boolean;
}) {
  const resting = element.rotation ?? 0;
  const y = useTransform(progress, [0, 1], [0, -(element.depth * TRAVEL_PX)]);
  const rotate = useTransform(progress, [0, 1], [resting, resting + ROTATION_SWEEP_DEG]);

  return (
    <motion.div
      className={`parallax-item flex items-center justify-center absolute ${element.color || ""}`}
      style={{
        top: element.top,
        left: element.left,
        // Held at the resting transform under reduced motion rather than
        // unmounted: the blobs are part of the composition, it is the movement
        // that was not asked for.
        y: still ? 0 : y,
        rotate: still ? resting : rotate,
      }}
      data-depth={element.depth}
      data-rotation={element.rotation}
    >
      {element.icon && <span style={{ fontSize: element.size }}>{element.icon}</span>}
      {element.shape === "circle" && (
        <div
          className={`rounded-full ${element.color}`}
          style={{ width: element.size, height: element.size, filter: "blur(40px)" }}
        />
      )}
    </motion.div>
  );
}

export function ParallaxBackground({ className = "" }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  // "start start" to "end start" is GSAP's top-top/bottom-top window: the
  // scrub runs from the container's top meeting the viewport's top until its
  // bottom does.
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
      aria-hidden="true"
    >
      {DEFAULT_ELEMENTS.map((element, i) => (
        <ParallaxItem
          key={i}
          element={element}
          progress={scrollYProgress}
          still={Boolean(prefersReducedMotion)}
        />
      ))}
    </div>
  );
}
