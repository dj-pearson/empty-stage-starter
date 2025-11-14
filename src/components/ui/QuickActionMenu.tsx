import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickAction {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  shortcut?: string;
}

interface QuickActionMenuProps {
  actions: QuickAction[];
  position?: 'bottom-right' | 'bottom-center';
}

export function QuickActionMenu({ actions, position = 'bottom-right' }: QuickActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  const positionClasses = {
    'bottom-right': 'bottom-20 right-4 md:bottom-6 md:right-6',
    'bottom-center': 'bottom-20 left-1/2 -translate-x-1/2 md:bottom-6',
  };

  return (
    <div className={cn('fixed z-40', positionClasses[position])}>
      {/* Action buttons - shown when open */}
      {isOpen && (
        <div className="flex flex-col gap-2 mb-4 animate-in slide-in-from-bottom-4 fade-in duration-200">
          {actions.map((action, index) => {
            const Icon = action.icon;
            return (
              <div
                key={index}
                className="flex items-center gap-2 justify-end group"
              >
                {/* Label tooltip */}
                <div className="hidden md:flex bg-popover text-popover-foreground text-sm px-3 py-2 rounded-md shadow-md opacity-0 group-hover:opacity-100 transition-opacity">
                  {action.label}
                  {action.shortcut && (
                    <kbd className="ml-2 px-1.5 py-0.5 text-xs bg-muted rounded">
                      {action.shortcut}
                    </kbd>
                  )}
                </div>

                {/* Mobile label - always visible on mobile */}
                <span className="md:hidden text-sm font-medium bg-popover px-3 py-2 rounded-md shadow-md">
                  {action.label}
                </span>

                {/* Action button */}
                <Button
                  onClick={() => {
                    action.onClick();
                    setIsOpen(false);
                  }}
                  size="icon"
                  className="h-12 w-12 rounded-full shadow-lg"
                  variant="secondary"
                >
                  <Icon className="h-5 w-5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Main FAB button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        size="icon"
        className={cn(
          'h-14 w-14 rounded-full shadow-lg transition-transform',
          isOpen && 'rotate-45'
        )}
      >
        {isOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </Button>
    </div>
  );
}
