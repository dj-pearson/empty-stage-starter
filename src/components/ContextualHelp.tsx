import { ReactNode, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle, Info, Lightbulb, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContextualHelpProps {
  content: ReactNode;
  title?: string;
  type?: "info" | "tip" | "warning" | "help";
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
  iconClassName?: string;
}

export function ContextualHelp({
  content,
  title,
  type = "info",
  side = "top",
  className,
  iconClassName,
}: ContextualHelpProps) {
  const Icon = {
    info: Info,
    tip: Lightbulb,
    warning: AlertCircle,
    help: HelpCircle,
  }[type];

  const iconColor = {
    info: "text-blue-500",
    tip: "text-yellow-500",
    warning: "text-orange-500",
    help: "text-muted-foreground",
  }[type];

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center justify-center rounded-full hover:bg-muted transition-colors",
              className
            )}
            onClick={(e) => e.preventDefault()}
          >
            <Icon className={cn("h-4 w-4", iconColor, iconClassName)} />
            <span className="sr-only">Help</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs">
          {title && <div className="font-semibold mb-1">{title}</div>}
          <div className="text-sm">{content}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Inline help component for form fields
interface InlineHelpProps {
  children: ReactNode;
  className?: string;
}

export function InlineHelp({ children, className }: InlineHelpProps) {
  return (
    <div
      className={cn(
        "text-sm text-muted-foreground mt-1 flex items-start gap-1",
        className
      )}
    >
      <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </div>
  );
}

// Expandable help section
interface HelpSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function HelpSection({
  title,
  children,
  defaultOpen = false,
  className,
}: HelpSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={cn("border rounded-lg p-4 bg-muted/50", className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full text-left font-medium hover:text-primary transition-colors"
      >
        <HelpCircle className="h-4 w-4" />
        <span>{title}</span>
        <svg
          className={cn(
            "ml-auto h-4 w-4 transition-transform",
            isOpen && "rotate-180"
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {isOpen && <div className="mt-3 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

// Feature hint badge - for highlighting new features
interface FeatureHintProps {
  children: ReactNode;
  hint: string;
  persistent?: boolean;
  storageKey?: string;
}

export function FeatureHint({
  children,
  hint,
  persistent = true,
  storageKey,
}: FeatureHintProps) {
  const [dismissed, setDismissed] = useState(() => {
    if (persistent && storageKey) {
      return localStorage.getItem(`hint-dismissed-${storageKey}`) === "true";
    }
    return false;
  });

  const handleDismiss = () => {
    setDismissed(true);
    if (persistent && storageKey) {
      localStorage.setItem(`hint-dismissed-${storageKey}`, "true");
    }
  };

  if (dismissed) return <>{children}</>;

  return (
    <TooltipProvider>
      <Tooltip open={!dismissed} onOpenChange={(open) => !open && handleDismiss()}>
        <TooltipTrigger asChild>
          <div className="relative inline-block">{children}</div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold mb-1">Tip</div>
              <div className="text-sm">{hint}</div>
            </div>
            <button
              onClick={handleDismiss}
              className="text-muted-foreground hover:text-foreground ml-2"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Keyboard shortcut hint
interface ShortcutHintProps {
  shortcut: string;
  description: string;
}

export function ShortcutHint({ shortcut, description }: ShortcutHintProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <kbd className="px-2 py-1 text-xs font-semibold bg-muted border border-border rounded">
        {shortcut}
      </kbd>
      <span className="text-muted-foreground">{description}</span>
    </div>
  );
}
