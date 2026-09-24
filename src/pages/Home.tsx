import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { SubscriptionStatusBanner } from "@/components/SubscriptionStatusBanner";
import { SetupChecklist } from "@/components/OnboardingProgressBar";
import { HomeGreeting } from "@/components/home/HomeGreeting";
import { InsightSlot } from "@/components/home/InsightSlot";
import { TonightHero } from "@/components/home/TonightHero";
import { TodayTasks } from "@/components/home/TodayTasks";
import { KidWeekLine } from "@/components/home/KidWeekLine";

/**
 * /dashboard: a ten-second answer for a parent on a phone.
 *
 * Tonight first (dinner per kid, with fit and allergens), then what needs
 * doing today, then setup while there is any, one insight, and a line per kid
 * about the week. The Dashboard shell owns the header, nav and the offsets
 * for them, so this page has no min-h-screen or top/bottom padding of its own.
 *
 * Every section reads the domain hooks it needs (useKids, usePlan, ...), not
 * the merged useApp(), so a grocery tick does not re-render tonight's hero.
 */
export default function Home() {
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>{t("home.title", { defaultValue: "Home - EatPal" })}</title>
        <meta
          name="description"
          content={t("home.metaDescription", {
            defaultValue: "Tonight's dinner for each child, today's to-dos, and how the week is going.",
          })}
        />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="container mx-auto max-w-2xl px-4 py-4 space-y-4">
        {/* US-860: the page heading comes first, ahead of any card's own heading. */}
        <h1 className="sr-only">{t("home.heading", { defaultValue: "EatPal home" })}</h1>
        <HomeGreeting />
        <TonightHero />
        <TodayTasks />
        <SetupChecklist />
        <SubscriptionStatusBanner />
        <InsightSlot />
        <KidWeekLine />
      </div>
    </>
  );
}
