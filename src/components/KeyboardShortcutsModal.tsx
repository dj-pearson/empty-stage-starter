import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";

const shortcuts = [
  { category: "Navigation", items: [
    { keys: ["Ctrl/\u2318", "K"], description: "Open command palette" },
    { keys: ["G"], description: "Go to Grocery list" },
    { keys: ["S"], description: "Go to Pantry" },
    { keys: ["T"], description: "Go to Today's plan" },
  ]},
  { category: "Actions", items: [
    { keys: ["L"], description: "Log meal result" },
    { keys: ["?"], description: "Show keyboard shortcuts" },
    { keys: ["Esc"], description: "Close dialog/modal" },
  ]},
];

export function KeyboardShortcutsModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} className="hidden md:flex" aria-label="Keyboard shortcuts">
        <Keyboard className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
            <DialogDescription>Quick actions available from the dashboard</DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {shortcuts.map((group) => (
              <div key={group.category}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">{group.category}</h3>
                <div className="space-y-2">
                  {group.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm">{item.description}</span>
                      <div className="flex gap-1">
                        {item.keys.map((key, j) => (
                          <kbd key={j} className="px-2 py-1 text-xs font-mono bg-muted border rounded">{key}</kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
