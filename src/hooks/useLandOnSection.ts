/**
 * `?section=<key>`: land on one section of a page once it has rendered.
 *
 * Reads the param once, after `ready` turns true (a gate skeleton has no
 * sections to land on), scrolls the matching element into view, moves focus
 * to its h2 so a keyboard or screen-reader user starts there too, and then
 * drops the param with a replace so Back or a refresh do not replay it.
 * An unknown key still drops the param and leaves the page where it is.
 *
 * Used by Progress, where /dashboard/analytics redirects to
 * ?section=numbers. Insights keeps its own ?from= handling.
 */
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export const SECTION_PARAM = 'section';

export function useLandOnSection(ready: boolean, targets: Readonly<Record<string, string>>): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const prefersReducedMotion = useReducedMotion();
  const handled = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (handled.current) return;
    const key = searchParams.get(SECTION_PARAM);
    if (key === null) {
      handled.current = true;
      return;
    }
    if (!ready) return;
    handled.current = true;

    const targetId = Object.prototype.hasOwnProperty.call(targets, key) ? targets[key] : null;
    const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';
    // Clearing the param re-renders the page; the frame is not cancelled in a
    // cleanup for that reason, and does nothing once the page has unmounted.
    requestAnimationFrame(() => {
      if (!mounted.current || !targetId) return;
      const section = document.getElementById(targetId);
      if (!section) return;
      section.scrollIntoView?.({ behavior, block: 'start' });
      const heading = section.querySelector<HTMLElement>('h2');
      if (heading) {
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    });

    const next = new URLSearchParams(searchParams);
    next.delete(SECTION_PARAM);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, ready, targets, prefersReducedMotion]);
}
