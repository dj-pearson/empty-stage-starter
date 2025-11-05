import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Download, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * PWA Install Prompt Component
 * Shows a native-like banner prompting users to install the app to their home screen
 */
export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if app is already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // Check if user has already dismissed the prompt
    const hasBeenDismissed = localStorage.getItem("pwa-install-dismissed");
    if (hasBeenDismissed) {
      return;
    }

    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();

      // Save the event so it can be triggered later
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Show the install prompt after a short delay
      setTimeout(() => {
        setShowPrompt(true);
      }, 3000); // Wait 3 seconds before showing
    };

    // Listen for successful installation
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
      haptic.success();
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    haptic.medium();

    // Show the install prompt
    await deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      console.log("User accepted the install prompt");
      haptic.success();
    } else {
      console.log("User dismissed the install prompt");
    }

    // Clear the deferred prompt
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    haptic.light();
    setShowPrompt(false);

    // Remember that user dismissed it (don't show again this session)
    localStorage.setItem("pwa-install-dismissed", "true");
  };

  // Don't show if already installed or no prompt available
  if (isInstalled || !showPrompt || !deferredPrompt) {
    return null;
  }

  return (
    <>
      {/* Mobile Bottom Banner */}
      <div className="md:hidden fixed bottom-20 left-0 right-0 z-40 animate-in slide-in-from-bottom duration-300">
        <div className="mx-4 mb-2 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
          <div className="p-4 pb-safe">
            {/* Close Button */}
            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 p-1 rounded-md opacity-70 hover:opacity-100 transition-opacity active:scale-90"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Content */}
            <div className="flex items-start gap-4 pr-8">
              {/* Icon */}
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Smartphone className="h-6 w-6 text-primary" />
                </div>
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-base mb-1">
                  Install EatPal
                </h3>
                <p className="text-sm text-muted-foreground leading-snug mb-3">
                  Add to your home screen for quick access and a better
                  experience
                </p>

                {/* Install Button */}
                <Button
                  onClick={handleInstallClick}
                  size="sm"
                  className="w-full"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Add to Home Screen
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Card */}
      <div className="hidden md:block fixed bottom-6 right-6 z-40 animate-in slide-in-from-bottom-4 duration-300">
        <div className="bg-card border border-border rounded-xl shadow-lg overflow-hidden max-w-sm">
          <div className="p-6 relative">
            {/* Close Button */}
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 p-1 rounded-md opacity-70 hover:opacity-100 transition-opacity active:scale-90"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Content */}
            <div className="flex items-start gap-4 pr-8">
              {/* Icon */}
              <div className="flex-shrink-0">
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Smartphone className="h-7 w-7 text-primary" />
                </div>
              </div>

              {/* Text */}
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-2">
                  Install EatPal
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  Install our app for faster access, offline support, and a
                  better experience
                </p>

                {/* Buttons */}
                <div className="flex gap-2">
                  <Button
                    onClick={handleInstallClick}
                    size="sm"
                    className="flex-1"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Install
                  </Button>
                  <Button
                    onClick={handleDismiss}
                    size="sm"
                    variant="outline"
                  >
                    Not Now
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
