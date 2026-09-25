import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { EyeOff, FileDown, FileText, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PRIVATE_SCOPE_KEYS } from "@/lib/householdScope";

/**
 * "Client access": what a clinician on the Professional plan can and cannot see.
 *
 * There is no grant model yet. A family reaches a clinician by sending one of
 * two reports, both built on the parent's device and sent by the parent. So this
 * section states that plainly and makes no household queries: it has nothing to
 * list, and a query here would be the first thing to cross the boundary it
 * describes.
 *
 * "What you never see" renders from PRIVATE_SCOPE_KEYS, the same list the
 * Household page and the invite dialogs show a parent, so the promise a family
 * reads and the one a clinician reads cannot drift apart.
 */
export function ClientAccessSection() {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle id="professional-client-access-title" className="text-lg">
          {t("professional.clientAccess.title", { defaultValue: "Client access" })}
        </CardTitle>
        <CardDescription>
          {t("professional.clientAccess.description", {
            defaultValue: "What families can share with you, and what stays with them.",
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section aria-labelledby="professional-how-shared" className="space-y-3">
          <h3 id="professional-how-shared" className="text-sm font-semibold">
            {t("professional.clientAccess.howTitle", { defaultValue: "How families share with you" })}
          </h3>
          <ul className="divide-y rounded-lg border">
            <li className="flex gap-3 p-3">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {t("professional.clientAccess.journalTitle", { defaultValue: "Food Journal report" })}
                </p>
                <p className="max-w-prose text-sm text-muted-foreground">
                  {t("professional.clientAccess.journalBody", {
                    defaultValue:
                      "Plain text the parent copies from their Food Journal and sends you by message or email.",
                  })}
                </p>
              </div>
            </li>
            <li className="flex gap-3 p-3">
              <FileDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {t("professional.clientAccess.ladderTitle", { defaultValue: "Food ladder summary" })}
                </p>
                <p className="max-w-prose text-sm text-muted-foreground">
                  {t("professional.clientAccess.ladderBody", {
                    defaultValue:
                      "A PDF the parent downloads from the food ladder. The child appears by first name only.",
                  })}
                </p>
              </div>
            </li>
          </ul>
          <p className="max-w-prose text-sm text-muted-foreground">
            {t("professional.clientAccess.sentByParent", {
              defaultValue: "The parent decides what to send and when. Nothing reaches you automatically.",
            })}
          </p>
        </section>

        <section aria-labelledby="professional-never-see" className="space-y-3">
          <h3 id="professional-never-see" className="flex items-center gap-2 text-sm font-semibold">
            <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t("professional.clientAccess.neverTitle", { defaultValue: "What you never see" })}
          </h3>
          <p className="max-w-prose text-sm text-muted-foreground">
            {t("professional.clientAccess.neverLead", {
              defaultValue: "Each person in a family is told these stay with their own account. Nothing here changes that:",
            })}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm" data-testid="professional-private-scope">
            {PRIVATE_SCOPE_KEYS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
          <p className="max-w-prose text-sm font-medium">
            {t("professional.clientAccess.neverShared", {
              defaultValue: "Nothing on this page opens a family's account, meal plan, grocery list or pantry.",
            })}
          </p>
        </section>

        <section aria-labelledby="professional-client-list" className="space-y-3">
          <h3 id="professional-client-list" className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t("professional.clientAccess.clientsTitle", { defaultValue: "Client list" })}
          </h3>
          <p className="max-w-prose rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {t("professional.clientAccess.clientsEmpty", {
              defaultValue:
                "No families have shared access with you yet. Families send reports to you from their Food Journal.",
            })}
          </p>
        </section>
      </CardContent>
    </Card>
  );
}
