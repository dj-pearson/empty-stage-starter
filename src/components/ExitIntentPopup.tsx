import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Sparkles, CheckCircle, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ExitIntentPopupProps {
  /** Delay in ms before the popup can be triggered (default: 5000ms) */
  delay?: number;
  /** Storage key to track if user has seen the popup */
  storageKey?: string;
}

export function ExitIntentPopup({
  delay = 5000,
  storageKey = 'eatpal_exit_popup_shown',
}: ExitIntentPopupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [canShow, setCanShow] = useState(false);
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Check if user has already seen the popup
  useEffect(() => {
    const hasSeenPopup = localStorage.getItem(storageKey);
    if (hasSeenPopup) {
      return;
    }

    // Enable popup after delay
    const timer = setTimeout(() => {
      setCanShow(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay, storageKey]);

  // Handle exit intent detection
  const handleMouseLeave = useCallback(
    (e: MouseEvent) => {
      // Only trigger when mouse leaves toward the top of the viewport
      if (e.clientY <= 0 && canShow && !isOpen) {
        setIsOpen(true);
        localStorage.setItem(storageKey, 'true');
      }
    },
    [canShow, isOpen, storageKey]
  );

  useEffect(() => {
    document.addEventListener('mouseleave', handleMouseLeave);
    return () => document.removeEventListener('mouseleave', handleMouseLeave);
  }, [handleMouseLeave]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      try {
        const { captureEmailLead } = await import('@/lib/exitIntentGuide');
        await captureEmailLead({ email, source: 'exit_intent' });
        setSubmitted(true);
      } catch (error) {
        console.error('Error capturing email:', error);
        // Still show success to user, but log the error
        setSubmitted(true);
      }
    }
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  if (submitted) {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <DialogTitle className="text-2xl mb-2">You're on the list!</DialogTitle>
            <DialogDescription className="mb-6">
              Check your email for your free picky eater meal planning guide.
            </DialogDescription>
            <Link to="/auth?tab=signup">
              <Button className="w-full" size="lg">
                Start Planning Now <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 z-10"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>

        <div className="grid md:grid-cols-5">
          {/* Left side - Image/illustration */}
          <div className="hidden md:flex md:col-span-2 bg-gradient-to-br from-primary to-primary/80 p-6 flex-col justify-center items-center text-white">
            <div className="text-6xl mb-4">🍽️</div>
            <p className="text-center text-sm opacity-90">
              Join 2,000+ parents who've ended mealtime battles
            </p>
          </div>

          {/* Right side - Content */}
          <div className="md:col-span-3 p-6">
            <DialogHeader className="text-left">
              <div className="flex items-center gap-2 text-primary mb-2">
                <Sparkles className="h-5 w-5" />
                <span className="text-sm font-semibold">WAIT! FREE GIFT</span>
              </div>
              <DialogTitle className="text-2xl">
                Don't Leave Empty-Handed!
              </DialogTitle>
              <DialogDescription className="text-base mt-2">
                Get our <strong>free guide</strong>: "5 Food Chaining Tricks That Actually Work for Picky Eaters"
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="exit-email">Your email</Label>
                <Input
                  id="exit-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
              <Button type="submit" className="w-full h-11" size="lg">
                Send Me The Free Guide
              </Button>
            </form>

            <div className="mt-6 space-y-2">
              {[
                'Evidence-based food chaining strategies',
                'Sample meal plan template included',
                'Works for ages 2-12',
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground mt-4 text-center">
              No spam. Unsubscribe anytime.
            </p>

            <div className="mt-4 pt-4 border-t text-center">
              <button
                onClick={handleClose}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                No thanks, I'll figure it out myself
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
