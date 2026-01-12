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
 * - Announces the new page title when navigation occurs
 * - Respects user preference for page change announcements
 * - Manages focus to the main content area on navigation
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
  const announcementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only announce if the path actually changed
    if (previousPath.current === location.pathname) return;
    previousPath.current = location.pathname;

    // Check if user wants page change announcements
    if (!preferences.announcePageChanges) return;

    // Small delay to allow the new page to render and update the title
    const timeoutId = setTimeout(() => {
      const pageTitle = getPageTitle?.() || document.title || 'Page loaded';

      // Announce the page change
      announce(`Navigated to ${pageTitle}`, 'polite');

      // Optionally focus the main content
      if (focusMainContent) {
        const mainContent = document.getElementById('main-content') ||
          document.querySelector('main');
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
  }, [location.pathname, preferences.announcePageChanges, focusMainContent, getPageTitle, announce]);

  // Hidden live region for route announcements
  return (
    <div
      ref={announcementRef}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    />
  );
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
