import { useState } from "react";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SHORTCUTS, type DashboardShortcut } from "@/lib/dashboardShortcuts";
import { isMac } from "@/hooks/useKeyboardShortcuts";

interface KeyboardShortcutsModalProps {
  /** Controlled open state. Dashboard owns it so "?" can open the dialog. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * The shortcut reference. It renders SHORTCUTS, the same array Dashboard binds,
 * so a key listed here is a key that works. The two rows after it are bound
 * elsewhere (the command palette and every Radix dialog) and are listed so the
 * reference is complete, not because this file binds them.
 */
export function KeyboardShortcutsModal({ open: openProp, onOpenChange }: KeyboardShortcutsModalProps = {}) {
  const { t } = useTranslation();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
  };

  const row = (s: Pick<DashboardShortcut, "labelKey" | "label">) => t(s.labelKey, { defaultValue: s.label });

  const groups = [
    {
      id: "navigation",
      title: t("shell.shortcuts.navigation", { defaultValue: "Navigation" }),
      items: [
        {
          keys: [isMac() ? "⌘" : "Ctrl", "K"],
          description: t("shell.shortcuts.search", { defaultValue: "Search" }),
        },
        ...SHORTCUTS.filter((s) => s.group === "navigation").map((s) => ({ keys: [s.display], description: row(s) })),
      ],
    },
    {
      id: "actions",
      title: t("shell.shortcuts.actions", { defaultValue: "Actions" }),
      items: [
        ...SHORTCUTS.filter((s) => s.group === "actions").map((s) => ({ keys: [s.display], description: row(s) })),
        { keys: ["Esc"], description: t("shell.shortcuts.close", { defaultValue: "Close a dialog" }) },
      ],
    },
  ];

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="hidden md:flex"
        aria-label={t("shell.shortcuts.open", { defaultValue: "Keyboard shortcuts" })}
        aria-keyshortcuts="?"
      >
        <Keyboard className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("shell.shortcuts.title", { defaultValue: "Keyboard shortcuts" })}</DialogTitle>
            <DialogDescription>
              {t("shell.shortcuts.description", {
                defaultValue: "Single keys work anywhere on the dashboard except while typing.",
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.id}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">{group.title}</h3>
                <dl className="space-y-2">
                  {group.items.map((item) => (
                    <div key={item.description} className="flex items-center justify-between">
                      <dt className="text-sm">{item.description}</dt>
                      <dd className="flex gap-1">
                        {item.keys.map((key) => (
                          <kbd key={key} className="px-2 py-1 text-xs font-mono bg-muted border rounded">
                            {key}
                          </kbd>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
