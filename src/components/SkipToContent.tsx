/**
 * Skip to Content Link
 *
 * Accessibility component that allows keyboard users to skip navigation
 * and jump directly to main content.
 *
 * Usage:
 * ```tsx
 * <SkipToContent />
 * <nav>...</nav>
 * <main id="main-content">...</main>
 * ```
 */

interface SkipToContentProps {
  /**
   * ID of the main content element to skip to
   * @default "main-content"
   */
  targetId?: string;
  /**
   * Text to display in the skip link
   * @default "Skip to main content"
   */
  text?: string;
  /**
   * Custom className for styling
   */
  className?: string;
}

/**
 * US-837: the link now moves FOCUS, not just the scroll position.
 *
 * `<a href="#main-content">` scrolls to the target, and in Chrome, Safari and
 * Edge that is all it does when the target is a plain <div> or <main>: those
 * elements are not focusable, so the browser leaves focus where it was. The
 * next Tab therefore goes back into the navigation the user just asked to
 * skip, which is the one thing the link exists to prevent. Only Firefox moves
 * focus on its own.
 *
 * So the click handler finds the target, makes it programmatically focusable
 * (tabindex="-1", which keeps it out of the tab order), focuses it and scrolls
 * it into view. Doing it here rather than adding tabIndex to every page means
 * the 32 pages that already declare id="main-content" did not have to change.
 *
 * The fallback matters as much as the focus: a page with no #main-content used
 * to make this a dead link. It now falls back to the first <main> or
 * [role="main"] landmark, so any page with a landmark works whether or not
 * somebody remembered the id.
 */
export function findSkipTarget(
  doc: Pick<Document, 'getElementById' | 'querySelector'>,
  targetId: string,
): HTMLElement | null {
  return (
    (doc.getElementById(targetId) as HTMLElement | null) ??
    (doc.querySelector('main') as HTMLElement | null) ??
    (doc.querySelector('[role="main"]') as HTMLElement | null)
  );
}

/** Focus `target` without adding it to the tab order. Returns false if absent. */
export function focusSkipTarget(target: HTMLElement | null): boolean {
  if (!target) return false;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus();
  target.scrollIntoView();
  return true;
}

export function SkipToContent({
  targetId = 'main-content',
  text = 'Skip to main content',
  className,
}: SkipToContentProps) {
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (focusSkipTarget(findSkipTarget(document, targetId))) {
      // Focus has moved; let the browser skip its own scroll-to-anchor so the
      // two do not fight over the final position.
      event.preventDefault();
    }
  };

  return (
    <a
      href={`#${targetId}`}
      onClick={handleClick}
      className={
        className ||
        'sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2'
      }
    >
      {text}
    </a>
  );
}

/**
 * Visually hidden component for screen readers
 *
 * Usage:
 * ```tsx
 * <VisuallyHidden>Additional context for screen readers</VisuallyHidden>
 * ```
 */
interface VisuallyHiddenProps {
  children: React.ReactNode;
  /**
   * Element type to render
   * @default "span"
   */
  as?: 'span' | 'div' | 'p';
}

export function VisuallyHidden({ children, as: Component = 'span' }: VisuallyHiddenProps) {
  return <Component className="sr-only">{children}</Component>;
}

/**
 * Accessible Icon Button
 *
 * Button with icon that includes accessible label
 *
 * Usage:
 * ```tsx
 * <AccessibleIconButton
 *   icon={<Menu />}
 *   label="Open navigation menu"
 *   onClick={handleClick}
 * />
 * ```
 */
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AccessibleIconButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

export function AccessibleIconButton({
  icon,
  label,
  onClick,
  variant = 'ghost',
  size = 'icon',
  className,
  disabled = false,
  type = 'button',
}: AccessibleIconButtonProps) {
  return (
    <Button
      type={type}
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={disabled}
      className={className}
      aria-label={label}
    >
      {icon}
      <VisuallyHidden>{label}</VisuallyHidden>
    </Button>
  );
}

/**
 * Focus trap utility
 *
 * Traps keyboard focus within a container (useful for modals, dialogs)
 *
 * Usage:
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * useFocusTrap(containerRef, isOpen);
 * ```
 */
import { useEffect, RefObject } from 'react';

export function useFocusTrap(containerRef: RefObject<HTMLElement>, active: boolean = true) {
  useEffect(() => {
    if (!active || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          lastElement?.focus();
          e.preventDefault();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          firstElement?.focus();
          e.preventDefault();
        }
      }
    };

    // Focus first element on mount
    firstElement?.focus();

    container.addEventListener('keydown', handleTabKey);

    return () => {
      container.removeEventListener('keydown', handleTabKey);
    };
  }, [containerRef, active]);
}

/**
 * Announce to screen readers
 *
 * Dynamically announce messages to screen reader users
 *
 * Usage:
 * ```tsx
 * const announce = useAnnounce();
 * announce('Item added to cart', 'polite');
 * ```
 */
import { useCallback } from 'react';

export function useAnnounce() {
  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', priority === 'assertive' ? 'alert' : 'status');
    announcement.setAttribute('aria-live', priority);
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;

    document.body.appendChild(announcement);

    // Remove after announcement
    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  }, []);

  return announce;
}

/**
 * Live region component for dynamic content updates
 *
 * Usage:
 * ```tsx
 * <LiveRegion priority="polite">
 *   {statusMessage}
 * </LiveRegion>
 * ```
 */
interface LiveRegionProps {
  children: React.ReactNode;
  priority?: 'polite' | 'assertive';
  atomic?: boolean;
  relevant?: 'additions' | 'removals' | 'text' | 'all';
}

export function LiveRegion({
  children,
  priority = 'polite',
  atomic = true,
  relevant = 'all',
}: LiveRegionProps) {
  return (
    <div
      role={priority === 'assertive' ? 'alert' : 'status'}
      aria-live={priority}
      aria-atomic={atomic}
      aria-relevant={relevant}
      className="sr-only"
    >
      {children}
    </div>
  );
}
