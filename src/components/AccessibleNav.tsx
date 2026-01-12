import * as React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

/**
 * Accessible Navigation Components
 *
 * These components ensure proper semantic structure for navigation:
 * - Uses <nav> element with aria-label
 * - Uses <ul>/<li> for list semantics
 * - Marks current page with aria-current
 * - Supports keyboard navigation
 * - Proper focus management for dropdowns
 */

interface NavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
  children?: NavItem[];
  badge?: string | number;
}

interface AccessibleNavProps {
  /** Navigation items */
  items: NavItem[];
  /** Navigation label for screen readers */
  ariaLabel: string;
  /** Additional className */
  className?: string;
  /** Orientation of the navigation */
  orientation?: 'horizontal' | 'vertical';
  /** Whether to show icons */
  showIcons?: boolean;
}

export function AccessibleNav({
  items,
  ariaLabel,
  className,
  orientation = 'horizontal',
  showIcons = true,
}: AccessibleNavProps) {
  const location = useLocation();

  const isCurrentPage = (href: string) => {
    if (href === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(href);
  };

  return (
    <nav aria-label={ariaLabel} className={className}>
      <ul
        className={cn(
          'flex gap-1',
          orientation === 'vertical' && 'flex-col'
        )}
        role="menubar"
        aria-orientation={orientation}
      >
        {items.map((item, index) => (
          <NavListItem
            key={item.href}
            item={item}
            isCurrentPage={isCurrentPage}
            showIcons={showIcons}
            index={index}
            orientation={orientation}
          />
        ))}
      </ul>
    </nav>
  );
}

interface NavListItemProps {
  item: NavItem;
  isCurrentPage: (href: string) => boolean;
  showIcons: boolean;
  index: number;
  orientation: 'horizontal' | 'vertical';
}

function NavListItem({
  item,
  isCurrentPage,
  showIcons,
  index,
  orientation,
}: NavListItemProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLUListElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const hasChildren = item.children && item.children.length > 0;

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (hasChildren) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(!isOpen);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
      if (e.key === 'ArrowDown' && isOpen && menuRef.current) {
        e.preventDefault();
        const firstItem = menuRef.current.querySelector('a, button') as HTMLElement;
        firstItem?.focus();
      }
    }
  };

  const current = isCurrentPage(item.href);

  if (hasChildren) {
    return (
      <li role="none" className="relative">
        <button
          ref={buttonRef}
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          onClick={() => setIsOpen(!isOpen)}
          onKeyDown={handleKeyDown}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-md',
            'text-sm font-medium transition-colors',
            'hover:bg-accent hover:text-accent-foreground',
            'focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-ring focus-visible:ring-offset-2',
            current && 'bg-accent text-accent-foreground'
          )}
        >
          {showIcons && item.icon && (
            <span aria-hidden="true">{item.icon}</span>
          )}
          {item.label}
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform',
              isOpen && 'rotate-180'
            )}
            aria-hidden="true"
          />
        </button>

        {isOpen && (
          <ul
            ref={menuRef}
            role="menu"
            aria-label={`${item.label} submenu`}
            className={cn(
              'absolute z-50 mt-1 min-w-[200px]',
              'bg-popover border rounded-md shadow-lg',
              'py-1',
              orientation === 'horizontal' ? 'left-0' : 'left-full top-0 ml-1'
            )}
          >
            {item.children!.map((child, childIndex) => (
              <li key={child.href} role="none">
                <Link
                  to={child.href}
                  role="menuitem"
                  aria-current={isCurrentPage(child.href) ? 'page' : undefined}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2',
                    'text-sm transition-colors',
                    'hover:bg-accent hover:text-accent-foreground',
                    'focus-visible:outline-none focus-visible:bg-accent',
                    isCurrentPage(child.href) && 'bg-accent/50'
                  )}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setIsOpen(false);
                      buttonRef.current?.focus();
                    }
                  }}
                >
                  {showIcons && child.icon && (
                    <span aria-hidden="true">{child.icon}</span>
                  )}
                  {child.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <li role="none">
      <Link
        to={item.href}
        role="menuitem"
        aria-current={current ? 'page' : undefined}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-md',
          'text-sm font-medium transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          'focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-ring focus-visible:ring-offset-2',
          current && 'bg-accent text-accent-foreground'
        )}
      >
        {showIcons && item.icon && (
          <span aria-hidden="true">{item.icon}</span>
        )}
        {item.label}
        {item.badge && (
          <span
            className="ml-auto px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded-full"
            aria-label={`${item.badge} notifications`}
          >
            {item.badge}
          </span>
        )}
      </Link>
    </li>
  );
}

/**
 * Breadcrumb Navigation
 *
 * Provides context about the user's location within the site.
 * Critical for WCAG 2.4.8 (Location) compliance.
 */
interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbNavProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function BreadcrumbNav({ items, className }: BreadcrumbNavProps) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex items-center gap-2 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={index} className="flex items-center gap-2">
              {index > 0 && (
                <span aria-hidden="true" className="text-muted-foreground">
                  /
                </span>
              )}
              {isLast || !item.href ? (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={cn(
                    isLast ? 'font-medium' : 'text-muted-foreground'
                  )}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.href}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Tab Navigation
 *
 * Accessible tab list with proper ARIA attributes.
 */
interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface TabNavProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  ariaLabel: string;
  className?: string;
}

export function TabNav({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel,
  className,
}: TabNavProps) {
  const tabListRef = React.useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    const enabledTabs = tabs.filter((t) => !t.disabled);
    const currentEnabledIndex = enabledTabs.findIndex(
      (t) => t.id === tabs[currentIndex].id
    );

    let newIndex: number | null = null;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        newIndex = currentEnabledIndex > 0
          ? currentEnabledIndex - 1
          : enabledTabs.length - 1;
        break;
      case 'ArrowRight':
        e.preventDefault();
        newIndex = currentEnabledIndex < enabledTabs.length - 1
          ? currentEnabledIndex + 1
          : 0;
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = enabledTabs.length - 1;
        break;
    }

    if (newIndex !== null) {
      const newTabId = enabledTabs[newIndex].id;
      onTabChange(newTabId);

      // Focus the new tab
      const tabButton = tabListRef.current?.querySelector(
        `[data-tab-id="${newTabId}"]`
      ) as HTMLElement;
      tabButton?.focus();
    }
  };

  return (
    <div
      ref={tabListRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex border-b', className)}
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          role="tab"
          data-tab-id={tab.id}
          id={`tab-${tab.id}`}
          aria-selected={activeTab === tab.id}
          aria-controls={`tabpanel-${tab.id}`}
          tabIndex={activeTab === tab.id ? 0 : -1}
          disabled={tab.disabled}
          onClick={() => !tab.disabled && onTabChange(tab.id)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 border-b-2 -mb-px',
            'text-sm font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-ring focus-visible:ring-offset-2',
            activeTab === tab.id
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
            tab.disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          {tab.icon && <span aria-hidden="true">{tab.icon}</span>}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Tab Panel wrapper
 */
interface TabPanelProps {
  id: string;
  activeTab: string;
  children: React.ReactNode;
  className?: string;
}

export function TabPanel({ id, activeTab, children, className }: TabPanelProps) {
  const isActive = id === activeTab;

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${id}`}
      aria-labelledby={`tab-${id}`}
      hidden={!isActive}
      tabIndex={0}
      className={cn(isActive && className)}
    >
      {isActive && children}
    </div>
  );
}

export default AccessibleNav;
