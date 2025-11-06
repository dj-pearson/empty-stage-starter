import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Plus,
  X,
  Users,
  BookOpen,
  ShoppingCart,
  Calendar,
  UtensilsCrossed,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { haptic } from "@/lib/haptics";

interface QuickAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  color: string;
}

export function QuickActionsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const toggleMenu = () => {
    haptic.light();
    setIsOpen(!isOpen);
  };

  const handleAction = (action: () => void) => {
    haptic.medium();
    action();
    setIsOpen(false);
  };

  const quickActions: QuickAction[] = [
    {
      id: "add-child",
      label: "Add Child",
      icon: Users,
      action: () => navigate("/kids"),
      color: "bg-blue-500 hover:bg-blue-600",
    },
    {
      id: "add-recipe",
      label: "Add Recipe",
      icon: BookOpen,
      action: () => navigate("/recipes"),
      color: "bg-green-500 hover:bg-green-600",
    },
    {
      id: "add-grocery",
      label: "Grocery List",
      icon: ShoppingCart,
      action: () => navigate("/grocery"),
      color: "bg-purple-500 hover:bg-purple-600",
    },
    {
      id: "add-meal",
      label: "Plan Meal",
      icon: Calendar,
      action: () => navigate("/planner"),
      color: "bg-orange-500 hover:bg-orange-600",
    },
    {
      id: "add-pantry",
      label: "Add to Pantry",
      icon: UtensilsCrossed,
      action: () => navigate("/pantry"),
      color: "bg-yellow-500 hover:bg-yellow-600",
    },
    {
      id: "ai-planner",
      label: "AI Planner",
      icon: Sparkles,
      action: () => navigate("/ai-planner"),
      color: "bg-pink-500 hover:bg-pink-600",
    },
  ];

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Quick Actions */}
      <div className="fixed bottom-20 right-4 z-50 md:bottom-6">
        {/* Action buttons */}
        <div
          className={cn(
            "flex flex-col-reverse gap-3 mb-3 transition-all duration-300 ease-out",
            isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
          )}
        >
          {quickActions.map((action, index) => (
            <button
              key={action.id}
              onClick={() => handleAction(action.action)}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-full shadow-lg text-white transition-all duration-200",
                action.color,
                "transform hover:scale-105"
              )}
              style={{
                transitionDelay: isOpen ? `${index * 50}ms` : "0ms",
              }}
            >
              <action.icon className="h-5 w-5" />
              <span className="font-medium text-sm whitespace-nowrap">
                {action.label}
              </span>
            </button>
          ))}
        </div>

        {/* Main toggle button */}
        <button
          onClick={toggleMenu}
          className={cn(
            "w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300",
            isOpen
              ? "bg-destructive hover:bg-destructive/90 rotate-45"
              : "bg-primary hover:bg-primary/90 rotate-0"
          )}
          aria-label={isOpen ? "Close quick actions" : "Open quick actions"}
        >
          {isOpen ? (
            <X className="h-6 w-6 text-white" />
          ) : (
            <Plus className="h-6 w-6 text-white" />
          )}
        </button>

        {/* Label hint (shows when closed) */}
        {!isOpen && (
          <div className="absolute right-16 top-1/2 -translate-y-1/2 bg-popover text-popover-foreground px-3 py-1 rounded-md shadow-md text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Quick Actions
          </div>
        )}
      </div>
    </>
  );
}

// Keyboard shortcut overlay for desktop users
export function KeyboardShortcutsOverlay() {
  const [isOpen, setIsOpen] = useState(false);

  // Show/hide with Shift+?
  useState(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === "?") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-6 z-40 p-2 bg-muted rounded-full shadow-md hover:shadow-lg transition-all hidden md:flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <kbd className="px-2 py-1 text-xs font-semibold bg-background border rounded">
          ?
        </kbd>
        <span className="pr-2">Shortcuts</span>
      </button>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={() => setIsOpen(false)}
      />
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-2xl mx-auto z-50 bg-card rounded-lg shadow-2xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Keyboard Shortcuts</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="font-semibold mb-3">Navigation</h3>
            <div className="space-y-2 text-sm">
              <ShortcutItem shortcut="⌘ K / Ctrl K" description="Command palette" />
              <ShortcutItem shortcut="?" description="Show shortcuts" />
              <ShortcutItem shortcut="Esc" description="Close dialog" />
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-3">Actions</h3>
            <div className="space-y-2 text-sm">
              <ShortcutItem shortcut="⌘ Z / Ctrl Z" description="Undo" />
              <ShortcutItem shortcut="⌘ Shift Z" description="Redo" />
              <ShortcutItem shortcut="⌘ S / Ctrl S" description="Save" />
            </div>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t text-sm text-muted-foreground">
          <p>Press <kbd className="px-2 py-1 text-xs font-semibold bg-muted border rounded">⌘ K</kbd> or <kbd className="px-2 py-1 text-xs font-semibold bg-muted border rounded">Ctrl K</kbd> to open the command palette for quick navigation.</p>
        </div>
      </div>
    </>
  );
}

function ShortcutItem({
  shortcut,
  description,
}: {
  shortcut: string;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{description}</span>
      <kbd className="px-2 py-1 text-xs font-semibold bg-muted border rounded">
        {shortcut}
      </kbd>
    </div>
  );
}
