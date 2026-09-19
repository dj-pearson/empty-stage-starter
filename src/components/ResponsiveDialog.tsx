import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * A dialog on a desktop, a bottom sheet on a phone (US-767).
 *
 * A centred modal on a 390px screen is the wrong shape twice over: it floats
 * with its controls in the middle of the display, where a thumb wrapped around
 * the phone cannot comfortably reach them, and its close button sits at the top
 * right, which is the furthest point from that thumb. A sheet that rises from
 * the bottom edge puts the content where the hand already is, and dismissing it
 * is a downward swipe rather than a stretch.
 *
 * WHY A WRAPPER RATHER THAN A CHANGE TO THE DIALOG. `src/components/ui/` is
 * shadcn and CLAUDE.md says not to touch it, which is the right rule -- those
 * files are regenerated. Both `Dialog` and `Sheet` are already thin wrappers
 * over the SAME primitive (@radix-ui/react-dialog), so this picks between them
 * and changes nothing about either.
 *
 * THE EXPORTS DELIBERATELY SHADOW THE DIALOG ONES, so a call site changes its
 * import and nothing else. Ten components on the grocery page use exactly
 * `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/
 * `DialogFooter`; rewriting each of their bodies to branch on a viewport would
 * be ten chances to get it subtly different.
 *
 * ONE BREAKPOINT, from `useIsMobile`, which reads the same media query
 * Tailwind's `md:` prefix flips on and answers correctly on the first render
 * (US-865). A hook that lagged by a render here would mount a dialog, throw it
 * away and mount a sheet.
 */

const PresentationContext = React.createContext(false);

/** True when this dialog is currently presented as a bottom sheet. */
export function useIsBottomSheet(): boolean {
  return React.useContext(PresentationContext);
}

type RootProps = React.ComponentProps<typeof Dialog>;

export function ResponsiveDialog({ children, ...props }: RootProps) {
  const isPhone = useIsMobile();
  const Root = isPhone ? Sheet : Dialog;

  return (
    <PresentationContext.Provider value={isPhone}>
      <Root {...props}>{children}</Root>
    </PresentationContext.Provider>
  );
}

export const ResponsiveDialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DialogContent>
>(({ className, children, ...props }, ref) => {
  const isPhone = useIsBottomSheet();

  if (!isPhone) {
    return (
      <DialogContent ref={ref} className={className} {...props}>
        {children}
      </DialogContent>
    );
  }

  return (
    <SheetContent
      ref={ref}
      side="bottom"
      className={cn(
        className,
        // After the caller's classes so tailwind-merge resolves these last.
        // A sheet is as wide as the phone and never taller than most of it:
        // the caller's `sm:max-w-[700px]` would otherwise narrow it between
        // 640px and 768px, where this is still the presentation in use.
        "w-full max-w-none max-h-[85vh] overflow-y-auto rounded-t-xl",
      )}
      {...props}
    >
      {children}
    </SheetContent>
  );
});
ResponsiveDialogContent.displayName = "ResponsiveDialogContent";

export function ResponsiveDialogHeader(props: React.ComponentProps<typeof DialogHeader>) {
  const Header = useIsBottomSheet() ? SheetHeader : DialogHeader;
  return <Header {...props} />;
}

export function ResponsiveDialogTitle(
  props: React.ComponentPropsWithoutRef<typeof DialogTitle>,
) {
  const Title = useIsBottomSheet() ? SheetTitle : DialogTitle;
  return <Title {...props} />;
}

export function ResponsiveDialogDescription(
  props: React.ComponentPropsWithoutRef<typeof DialogDescription>,
) {
  const Description = useIsBottomSheet() ? SheetDescription : DialogDescription;
  return <Description {...props} />;
}

export function ResponsiveDialogFooter({
  className,
  ...props
}: React.ComponentProps<typeof DialogFooter>) {
  const isPhone = useIsBottomSheet();
  const Footer = isPhone ? SheetFooter : DialogFooter;
  // Stacked and full-width on a phone: two buttons side by side at 390px are
  // each under the touch floor once padding is taken out.
  return <Footer className={cn(className, isPhone && "flex-col gap-2 [&>*]:w-full")} {...props} />;
}
