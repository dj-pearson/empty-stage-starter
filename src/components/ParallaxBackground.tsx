import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

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

export function ParallaxBackground({ className = "" }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!containerRef.current) return;

    const elements = gsap.utils.toArray<HTMLElement>(".parallax-item");

    elements.forEach((el) => {
      const depth = parseFloat(el.dataset.depth || "0.1");
      const rotation = parseFloat(el.dataset.rotation || "0");

      // Create a smoother parallax effect with scrub
      gsap.to(el, {
        y: -(depth * 500), // Move up as we scroll down
        rotation: rotation + 45,
        ease: "none",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "bottom top",
          scrub: 1, // Smooth scrubbing
        },
      });
    });
  }, { scope: containerRef });

  return (
    <div ref={containerRef} className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {DEFAULT_ELEMENTS.map((el, i) => (
        <div
          key={i}
          className={`parallax-item flex items-center justify-center absolute ${el.color || ""}`}
          style={{
            top: el.top,
            left: el.left,
          }}
          data-depth={el.depth}
          data-rotation={el.rotation}
        >
          {el.icon && <span style={{ fontSize: el.size }}>{el.icon}</span>}
          {el.shape === "circle" && (
            <div
              className={`rounded-full ${el.color}`}
              style={{ width: el.size, height: el.size, filter: "blur(40px)" }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
