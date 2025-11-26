import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { X, Download, Smartphone, Share, Plus } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

export function AppInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed as PWA
    const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;
    setIsStandalone(isInStandaloneMode);

    // Check if iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    // Check if user has dismissed the prompt before
    const dismissed = localStorage.getItem('app_install_dismissed');
    const dismissedTime = dismissed ? parseInt(dismissed, 10) : 0;
    const oneWeek = 7 * 24 * 60 * 60 * 1000;

    // Don't show if already installed or dismissed within a week
    if (isInStandaloneMode || (dismissedTime && Date.now() - dismissedTime < oneWeek)) {
      return;
    }

    // Listen for the beforeinstallprompt event (Chrome/Edge/etc)
    const handleBeforeInstall = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show prompt after a delay to not interrupt user
      setTimeout(() => setShowPrompt(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // For iOS, show after delay if not installed
    if (iOS && !isInStandaloneMode && !dismissedTime) {
      setTimeout(() => setShowPrompt(true), 5000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('app_install_dismissed', Date.now().toString());
  };

  // Don't render if already installed or shouldn't show
  if (isStandalone || !showPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm animate-in slide-in-from-bottom-4 duration-300">
      <Card className="shadow-2xl border-2 border-primary/20 bg-background/95 backdrop-blur-sm">
        <CardContent className="pt-4 pb-4">
          <button
            onClick={handleDismiss}
            className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>

          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shrink-0">
              <img src="/Logo-White.png" alt="EatPal" className="w-8 h-8" />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm mb-1">Install EatPal App</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Get quick access to meal planning right from your home screen. Works offline!
              </p>

              {isIOS ? (
                /* iOS Instructions */
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Tap <Share className="w-3 h-3 inline mx-1" /> then "Add to Home Screen" <Plus className="w-3 h-3 inline ml-1" />
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={handleDismiss}
                  >
                    Got it!
                  </Button>
                </div>
              ) : (
                /* Android/Desktop Install */
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 text-xs gap-1"
                    onClick={handleInstall}
                  >
                    <Download className="w-3 h-3" />
                    Install
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={handleDismiss}
                  >
                    Not now
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Benefits */}
          <div className="mt-3 pt-3 border-t flex justify-around text-center">
            {[
              { icon: <Smartphone className="w-3 h-3" />, label: 'Home screen' },
              { icon: <Download className="w-3 h-3" />, label: 'Works offline' },
              { icon: '⚡', label: 'Fast access' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-1 text-xs text-muted-foreground">
                {typeof item.icon === 'string' ? <span>{item.icon}</span> : item.icon}
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
