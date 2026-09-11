import * as React from "react";

import { below } from "@/lib/breakpoints";

/**
 * Is the viewport narrower than Tailwind's `md:`?
 *
 * ONE SOURCE FOR THE BOUNDARY. `below('md')` is the same media query Tailwind's
 * `md:` prefix flips on, from src/lib/breakpoints.ts, which is checked against
 * the resolved Tailwind config (US-825). A hardcoded 768 here is how a hook and
 * a class name end up disagreeing at exactly iPad width.
 *
 * IT ANSWERS ON THE FIRST RENDER, which is US-865 and not a detail. This hook
 * used to start at `undefined` and coerce to false, so every consumer got
 * "desktop" for one render and the truth on the next. src/pages/Dashboard.tsx
 * now picks WHICH SHELL TO MOUNT from this, so a wrong first answer would mount
 * the desktop shell on a phone, throw it away, and mount the mobile one -- a
 * flash, and the routed page mounted twice for nothing.
 *
 * The synchronous read is guarded for an environment with no matchMedia (a
 * prerender pass, a jsdom test without it), where false is the right default:
 * the prerendered pages are the public ones, which are desktop-first.
 */
function readIsMobile(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(below("md")).matches;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(readIsMobile);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(below("md"));
    const onChange = () => setIsMobile(query.matches);
    // Read again on mount: a resize between render and effect is rare, and a
    // test that sets the viewport after the first render is not.
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
