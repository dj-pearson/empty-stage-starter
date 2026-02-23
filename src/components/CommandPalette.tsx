import { useEffect, useState, useMemo, useCallback } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import {
  Home,
  Users,
  UtensilsCrossed,
  BookOpen,
  Calendar,
  Sparkles,
  BarChart3,
  ShoppingCart,
  Apple,
  Bot,
  Settings,
  HelpCircle,
  Plus,
  Search,
  Moon,
  Sun,
  LogOut,
  FileText,
  Tag,
  Clock,
  Accessibility,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

interface Command {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  keywords?: string[];
  group: "navigation" | "actions" | "settings" | "help";
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const { setTheme, theme } = useTheme();
  const { foods, recipes, kids, planEntries } = useApp();

  // Toggle command palette with Cmd/Ctrl + K
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: "k",
        metaKey: true,
        description: "Open command palette",
        action: () => setOpen((prev) => !prev),
      },
      {
        key: "k",
        ctrlKey: true,
        description: "Open command palette",
        action: () => setOpen((prev) => !prev),
      },
    ],
  });

  // Close on escape
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const commands: Command[] = useMemo(
    () => [
      // Navigation
      {
        id: "nav-home",
        label: "Go to Home",
        icon: Home,
        action: () => {
          navigate("/");
          setOpen(false);
        },
        keywords: ["dashboard", "main"],
        group: "navigation",
      },
      {
        id: "nav-kids",
        label: "Go to Kids",
        icon: Users,
        action: () => {
          navigate("/kids");
          setOpen(false);
        },
        keywords: ["children", "profiles"],
        group: "navigation",
      },
      {
        id: "nav-pantry",
        label: "Go to Pantry",
        icon: UtensilsCrossed,
        action: () => {
          navigate("/pantry");
          setOpen(false);
        },
        keywords: ["food", "inventory"],
        group: "navigation",
      },
      {
        id: "nav-recipes",
        label: "Go to Recipes",
        icon: BookOpen,
        action: () => {
          navigate("/recipes");
          setOpen(false);
        },
        keywords: ["meals", "cooking"],
        group: "navigation",
      },
      {
        id: "nav-planner",
        label: "Go to Meal Planner",
        icon: Calendar,
        action: () => {
          navigate("/planner");
          setOpen(false);
        },
        keywords: ["calendar", "schedule", "meals"],
        group: "navigation",
      },
      {
        id: "nav-ai-planner",
        label: "Go to AI Planner",
        icon: Sparkles,
        action: () => {
          navigate("/ai-planner");
          setOpen(false);
        },
        keywords: ["artificial intelligence", "auto", "smart"],
        group: "navigation",
      },
      {
        id: "nav-insights",
        label: "Go to Insights",
        icon: BarChart3,
        action: () => {
          navigate("/insights");
          setOpen(false);
        },
        keywords: ["analytics", "stats", "data"],
        group: "navigation",
      },
      {
        id: "nav-grocery",
        label: "Go to Grocery Lists",
        icon: ShoppingCart,
        action: () => {
          navigate("/grocery");
          setOpen(false);
        },
        keywords: ["shopping", "list"],
        group: "navigation",
      },
      {
        id: "nav-food-tracker",
        label: "Go to Food Tracker",
        icon: Apple,
        action: () => {
          navigate("/food-tracker");
          setOpen(false);
        },
        keywords: ["tracking", "log"],
        group: "navigation",
      },
      {
        id: "nav-ai-coach",
        label: "Go to AI Coach",
        icon: Bot,
        action: () => {
          navigate("/ai-coach");
          setOpen(false);
        },
        keywords: ["assistant", "help", "chat"],
        group: "navigation",
      },

      // Actions
      {
        id: "action-add-child",
        label: "Add Child Profile",
        icon: Plus,
        action: () => {
          navigate("/kids");
          setOpen(false);
          // Trigger add child dialog
        },
        keywords: ["new", "create"],
        group: "actions",
      },
      {
        id: "action-add-recipe",
        label: "Add New Recipe",
        icon: Plus,
        action: () => {
          navigate("/recipes");
          setOpen(false);
        },
        keywords: ["new", "create", "meal"],
        group: "actions",
      },
      {
        id: "action-add-pantry",
        label: "Add to Pantry",
        icon: Plus,
        action: () => {
          navigate("/pantry");
          setOpen(false);
        },
        keywords: ["new", "food", "item"],
        group: "actions",
      },
      {
        id: "action-create-list",
        label: "Create Grocery List",
        icon: Plus,
        action: () => {
          navigate("/grocery");
          setOpen(false);
        },
        keywords: ["new", "shopping"],
        group: "actions",
      },
      {
        id: "action-search",
        label: "Search Everything",
        icon: Search,
        action: () => {
          // Focus search if available
          setOpen(false);
        },
        keywords: ["find", "look"],
        group: "actions",
      },

      // Settings
      {
        id: "settings-theme-light",
        label: "Switch to Light Theme",
        icon: Sun,
        action: () => {
          setTheme("light");
          setOpen(false);
        },
        keywords: ["appearance", "mode"],
        group: "settings",
      },
      {
        id: "settings-theme-dark",
        label: "Switch to Dark Theme",
        icon: Moon,
        action: () => {
          setTheme("dark");
          setOpen(false);
        },
        keywords: ["appearance", "mode"],
        group: "settings",
      },
      {
        id: "settings-account",
        label: "Account Settings",
        icon: Settings,
        action: () => {
          navigate("/dashboard/settings");
          setOpen(false);
        },
        keywords: ["preferences", "profile"],
        group: "settings",
      },
      {
        id: "settings-accessibility",
        label: "Accessibility Settings",
        icon: Accessibility,
        action: () => {
          navigate("/dashboard/accessibility-settings");
          setOpen(false);
        },
        keywords: ["a11y", "contrast", "motion", "font", "screen reader", "keyboard", "wcag", "ada"],
        group: "settings",
      },

      // Help
      {
        id: "help-faq",
        label: "View FAQs",
        icon: HelpCircle,
        action: () => {
          navigate("/faq");
          setOpen(false);
        },
        keywords: ["questions", "help", "support"],
        group: "help",
      },
      {
        id: "help-contact",
        label: "Contact Support",
        icon: HelpCircle,
        action: () => {
          navigate("/contact");
          setOpen(false);
        },
        keywords: ["help", "support", "email"],
        group: "help",
      },
    ],
    [navigate, setTheme]
  );

  // Filter commands based on theme
  const filteredCommands = useMemo(() => {
    return commands.filter((cmd) => {
      if (theme === "light" && cmd.id === "settings-theme-light") return false;
      if (theme === "dark" && cmd.id === "settings-theme-dark") return false;
      return true;
    });
  }, [commands, theme]);

  const groupedCommands = useMemo(() => {
    return {
      navigation: filteredCommands.filter((cmd) => cmd.group === "navigation"),
      actions: filteredCommands.filter((cmd) => cmd.group === "actions"),
      settings: filteredCommands.filter((cmd) => cmd.group === "settings"),
      help: filteredCommands.filter((cmd) => cmd.group === "help"),
    };
  }, [filteredCommands]);

  // Search data with 300ms debounce effect
  const dataResults = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return { foods: [], recipes: [], kids: [], plans: [] };
    const q = searchQuery.toLowerCase();
    return {
      foods: foods.filter(f => f.name?.toLowerCase().includes(q)).slice(0, 5),
      recipes: recipes.filter(r => r.name?.toLowerCase().includes(q)).slice(0, 5),
      kids: kids.filter(k => k.name?.toLowerCase().includes(q)).slice(0, 5),
      plans: planEntries.filter(p => {
        const food = foods.find(f => f.id === p.food_id);
        return food?.name?.toLowerCase().includes(q);
      }).slice(0, 5),
    };
  }, [searchQuery, foods, recipes, kids, planEntries]);

  const hasDataResults = dataResults.foods.length > 0 || dataResults.recipes.length > 0 || dataResults.kids.length > 0 || dataResults.plans.length > 0;

  // Recent searches
  const [recentSearches] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("eatpal_recent_searches") || "[]");
    } catch { return []; }
  });

  const saveRecentSearch = useCallback((term: string) => {
    try {
      const current = JSON.parse(localStorage.getItem("eatpal_recent_searches") || "[]");
      const updated = [term, ...current.filter((s: string) => s !== term)].slice(0, 5);
      localStorage.setItem("eatpal_recent_searches", JSON.stringify(updated));
    } catch { /* ignore */ }
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearchQuery(""); }}>
      <CommandInput placeholder="Type a command or search..." value={searchQuery} onValueChange={setSearchQuery} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Recent searches when empty */}
        {!searchQuery && recentSearches.length > 0 && (
          <>
            <CommandGroup heading="Recent Searches">
              {recentSearches.map((term) => (
                <CommandItem key={term} onSelect={() => setSearchQuery(term)}>
                  <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{term}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Data search results */}
        {hasDataResults && (
          <>
            {dataResults.foods.length > 0 && (
              <CommandGroup heading="Foods">
                {dataResults.foods.map((food) => (
                  <CommandItem key={food.id} onSelect={() => { saveRecentSearch(searchQuery); navigate("/pantry"); setOpen(false); }}>
                    <Apple className="mr-2 h-4 w-4 text-green-500" />
                    <span>{food.name}</span>
                    {food.category && <span className="ml-auto text-xs text-muted-foreground">{food.category}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {dataResults.recipes.length > 0 && (
              <CommandGroup heading="Recipes">
                {dataResults.recipes.map((recipe) => (
                  <CommandItem key={recipe.id} onSelect={() => { saveRecentSearch(searchQuery); navigate("/recipes"); setOpen(false); }}>
                    <BookOpen className="mr-2 h-4 w-4 text-orange-500" />
                    <span>{recipe.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {dataResults.kids.length > 0 && (
              <CommandGroup heading="Kids">
                {dataResults.kids.map((kid) => (
                  <CommandItem key={kid.id} onSelect={() => { saveRecentSearch(searchQuery); navigate("/kids"); setOpen(false); }}>
                    <Users className="mr-2 h-4 w-4 text-blue-500" />
                    <span>{kid.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Navigation">
          {groupedCommands.navigation.map((cmd) => (
            <CommandItem
              key={cmd.id}
              onSelect={() => cmd.action()}
              keywords={cmd.keywords}
            >
              <cmd.icon className="mr-2 h-4 w-4" />
              <span>{cmd.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Quick Actions">
          {groupedCommands.actions.map((cmd) => (
            <CommandItem
              key={cmd.id}
              onSelect={() => cmd.action()}
              keywords={cmd.keywords}
            >
              <cmd.icon className="mr-2 h-4 w-4" />
              <span>{cmd.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Settings">
          {groupedCommands.settings.map((cmd) => (
            <CommandItem
              key={cmd.id}
              onSelect={() => cmd.action()}
              keywords={cmd.keywords}
            >
              <cmd.icon className="mr-2 h-4 w-4" />
              <span>{cmd.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Help & Support">
          {groupedCommands.help.map((cmd) => (
            <CommandItem
              key={cmd.id}
              onSelect={() => cmd.action()}
              keywords={cmd.keywords}
            >
              <cmd.icon className="mr-2 h-4 w-4" />
              <span>{cmd.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
