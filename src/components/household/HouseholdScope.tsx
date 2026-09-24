import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import "@/i18n/appLocale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { getStorage } from "@/lib/platform";
import { HOUSEHOLD_LINKS, PRIVATE_SCOPE_KEYS, SHARED_SCOPE_KEYS } from "@/lib/householdScope";

/** Set once the contract has been shown open; later visits start collapsed. */
export const SCOPE_SEEN_KEY = "eatpal.household.scopeSeen";

/**
 * "What's shared": the household's sharing contract in plain words.
 *
 * The lists come from src/lib/householdScope.ts so the remove dialog and the
 * join screen describe the same eight things. Open the first time somebody
 * lands here, collapsed after, because by the second visit they know it.
 */
export function HouseholdScope() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const storage = await getStorage();
        const seen = await storage.getItem(SCOPE_SEEN_KEY);
        if (cancelled) return;
        if (seen === "true") {
          setOpen(false);
        } else {
          await storage.setItem(SCOPE_SEEN_KEY, "true");
        }
      } catch {
        // Storage can be blocked or throw (private windows, cleared site data).
        // Showing the contract open is the safe default.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="py-3">
          <h2 className="text-lg font-semibold">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="min-h-11 w-full justify-between px-2 text-lg font-semibold">
                {t("household.page.scope.title")}
                <ChevronDown
                  aria-hidden="true"
                  className={cn("motion-safe:transition-transform", open && "rotate-180")}
                />
              </Button>
            </CollapsibleTrigger>
          </h2>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            <div className="grid gap-4 sm:grid-cols-2">
              <section aria-labelledby="household-scope-shared">
                <h3 id="household-scope-shared" className="font-medium">
                  {t("household.page.scope.sharedHeading")}
                </h3>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                  {SHARED_SCOPE_KEYS.map((key) => (
                    <li key={key}>{t(key)}</li>
                  ))}
                </ul>
              </section>
              <section aria-labelledby="household-scope-private">
                <h3 id="household-scope-private" className="font-medium">
                  {t("household.page.scope.privateHeading")}
                </h3>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                  {PRIVATE_SCOPE_KEYS.map((key) => (
                    <li key={key}>{t(key)}</li>
                  ))}
                </ul>
              </section>
            </div>
            <p className="text-sm font-medium">{t("household.scope.nothingCrosses")}</p>
            <div className="flex flex-col gap-1 text-sm sm:flex-row sm:gap-4">
              <Link to={HOUSEHOLD_LINKS.careCards} className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline">
                {t("household.page.scope.careCardsLink")}
              </Link>
              <Link to={HOUSEHOLD_LINKS.foodJournal} className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline">
                {t("household.page.scope.foodJournalLink")}
              </Link>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
