import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAccessibility } from '@/contexts/AccessibilityContext';

/**
 * Route Announcer Component
 *
 * Announces page navigation changes to screen reader users.
 * This is critical for WCAG 2.4.2 (Page Titled) compliance.
 *
 * Features:
 * - Announces the new page title when navigation occurs, through the
 *   provider's persistent live region (it renders no region of its own)
 * - Respects user preference for page change announcements
 * - Moves focus to the main content on navigation when asked, either by the
 *   `focusMainContent` prop or by the user's "Move focus to the page heading
 *   on navigation" preference (stored as screenReaderMode)
 */

interface RouteAnnouncerProps {
  /** Whether to automatically focus main content on route change */
  focusMainContent?: boolean;
  /** Custom page title getter (defaults to document.title) */
  getPageTitle?: () => string;
}

export function RouteAnnouncer({
  focusMainContent = false,
  getPageTitle,
}: RouteAnnouncerProps = {}) {
  const location = useLocation();
  const { preferences, announce } = useAccessibility();
  const previousPath = useRef(location.pathname);
  const shouldFocus = focusMainContent || preferences.screenReaderMode;

  useEffect(() => {
    // Only announce if the path actually changed
    if (previousPath.current === location.pathname) return;
    previousPath.current = location.pathname;

    const shouldAnnounce = preferences.announcePageChanges;
    if (!shouldAnnounce && !shouldFocus) return;

    // Small delay to allow the new page to render and update the title
    const timeoutId = setTimeout(() => {
      const pageTitle = getPageTitle?.() || document.title || 'Page loaded';

      // Announce the page change
      if (shouldAnnounce) announce(`Navigated to ${pageTitle}`, 'polite');

      // Optionally focus the main content: its first heading when there is
      // one, so a screen reader starts reading at the page's name.
      if (shouldFocus) {
        const main = document.getElementById('main-content') || document.querySelector('main');
        const mainContent = main?.querySelector<HTMLElement>('h1') ?? main;
        if (mainContent) {
          mainContent.setAttribute('tabindex', '-1');
          mainContent.focus({ preventScroll: true });
          // Remove tabindex after focus to maintain natural tab order
          setTimeout(() => {
            mainContent.removeAttribute('tabindex');
          }, 100);
        }
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [location.pathname, preferences.announcePageChanges, shouldFocus, getPageTitle, announce]);

  return null;
}

/**
 * Hook to announce route changes programmatically
 */
export function useRouteAnnouncement() {
  const { announce, preferences } = useAccessibility();

  const announceRoute = (message: string) => {
    if (preferences.announcePageChanges) {
      announce(message, 'polite');
    }
  };

  return announceRoute;
}

export default RouteAnnouncer;
