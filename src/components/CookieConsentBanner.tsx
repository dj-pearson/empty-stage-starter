import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { getConsent, setConsent } from '@/lib/consent';

/**
 * Cookie / tracking consent banner (compliance audit 2026-07).
 *
 * Shown until the visitor makes a decision. Non-essential tracking (Google
 * Analytics, Sentry Session Replay) stays off until "Accept" is chosen — the
 * GA loader and Sentry both read the stored decision. Essential cookies needed
 * to run the service are always allowed and are not gated here.
 *
 * GDPR/ePrivacy: "Reject" is given equal prominence to "Accept" (no dark
 * pattern), and the decision is recorded with a timestamp to demonstrate consent.
 */
export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only surface the banner once we know no decision has been stored yet.
    if (getConsent() === null) setVisible(true);
  }, []);

  if (!visible) return null;

  const decide = (analytics: boolean) => {
    setConsent(analytics);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-heading"
      aria-describedby="cookie-consent-desc"
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-border bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 id="cookie-consent-heading" className="text-sm font-semibold text-foreground">
            We value your privacy
          </h2>
          <p id="cookie-consent-desc" className="text-sm text-muted-foreground">
            We use essential cookies to run EatPal. With your consent, we also use analytics
            cookies to understand how the app is used and improve it. You can change your choice
            anytime.{' '}
            <Link to="/privacy#cookies" className="underline hover:text-foreground">
              Learn more
            </Link>
            .
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            onClick={() => decide(false)}
            aria-label="Reject non-essential analytics cookies"
          >
            Reject
          </Button>
          <Button onClick={() => decide(true)} aria-label="Accept analytics cookies">
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
