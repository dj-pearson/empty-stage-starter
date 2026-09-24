/**
 * The Settings hub at /dashboard/settings.
 *
 * A thin shell: it picks the section from the URL (useSettingsSection), draws
 * the navigation for the viewport, and wraps each section body in a
 * <section id="settings-<key>"> with a real h2, so the CardTitle h3s inside
 * sit under an h2 rather than jumping from the h1. Section bodies live in
 * src/components/settings/sections/ and render content only.
 *
 * Phone (< md): with no section selected, a Quick row and a grouped list of
 * sections; with one selected, only that section and a Back link that pops
 * history. md+: a side rail and one content pane, defaulting to Profile.
 * Only the active section is mounted, so opening Settings never pays for the
 * subscription query or the export code unless you go there.
 *
 * The root is a <div>. The dashboard shell owns the main landmark;
 * a second one inside it is what the old accessibility page shipped.
 */
import { lazy, Suspense, type ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { useBindStatus } from '@/hooks/useBindStatus';
import { useSettingsSection } from '@/hooks/useSettingsSection';
import { getSettingsSection, SETTINGS_PATH, type SettingsSectionKey } from '@/lib/settingsSections';
import { SettingsHubSearch } from '@/components/settings/SettingsHubSearch';
import { SettingsIndexList, SettingsRail } from '@/components/settings/SettingsHubNav';
import { QuickComfortRow } from '@/components/settings/QuickComfortRow';
import { WeekStartSetting } from '@/components/settings/WeekStartSetting';
import { ProfileSection } from '@/components/settings/sections/ProfileSection';
import { SecuritySection } from '@/components/settings/sections/SecuritySection';
import { PrivacySection } from '@/components/settings/sections/PrivacySection';
import { PlannerSection } from '@/components/settings/sections/PlannerSection';
import { AccessibilitySettings } from '@/components/AccessibilitySettings';
import '@/i18n/appLocale';

// The heavy ones: Stripe/subscription, the export and delete code, and the
// email preferences form each come in their own chunk.
const PlanSection = lazy(() =>
  import('@/components/settings/sections/PlanSection').then((m) => ({ default: m.PlanSection }))
);
const DataSection = lazy(() =>
  import('@/components/settings/sections/DataSection').then((m) => ({ default: m.DataSection }))
);
const NotificationsSection = lazy(() =>
  import('@/components/settings/sections/NotificationsSection').then((m) => ({
    default: m.NotificationsSection,
  }))
);

function AccessibilityBody() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <AccessibilitySettings headless />
      <p className="text-sm text-muted-foreground">
        <Link to="/accessibility" className="font-medium text-primary underline-offset-4 hover:underline">
          {t('settings.a11yResources.statement', { defaultValue: 'Accessibility statement' })}
        </Link>
        {' / '}
        <Link to="/accessibility/vpat" className="font-medium text-primary underline-offset-4 hover:underline">
          {t('settings.a11yResources.vpat', { defaultValue: 'VPAT' })}
        </Link>
        {' / '}
        <a href="mailto:accessibility@tryeatpal.com" className="font-medium text-primary underline-offset-4 hover:underline">
          {t('settings.a11yResources.contact', {
            defaultValue: 'Trouble using EatPal? Email accessibility@tryeatpal.com',
          })}
        </a>
      </p>
    </div>
  );
}

const SECTION_BODIES: Record<SettingsSectionKey, () => ReactNode> = {
  profile: () => <ProfileSection />,
  signin: () => <SecuritySection />,
  privacy: () => <PrivacySection />,
  notifications: () => <NotificationsSection />,
  planner: () => <PlannerSection />,
  accessibility: () => <AccessibilityBody />,
  plan: () => <PlanSection />,
  data: () => <DataSection />,
};

function SectionSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t('settings.nav.loading', { defaultValue: 'Loading section' })}>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}

function SettingsSectionPane({ sectionKey }: { sectionKey: SettingsSectionKey }) {
  const { t } = useTranslation();
  const def = getSettingsSection(sectionKey);
  const titleId = `${def.elementId}-title`;
  return (
    <section id={def.elementId} aria-labelledby={titleId} className="scroll-mt-20 space-y-4">
      <div>
        <h2 id={titleId} tabIndex={-1} className="text-xl font-semibold outline-none sm:text-2xl">
          {t(def.titleKey)}
        </h2>
        <p className="text-sm text-muted-foreground">{t(`settings.scope.${def.scope}`)}</p>
      </div>
      <Suspense fallback={<SectionSkeleton />}>{SECTION_BODIES[sectionKey]()}</Suspense>
    </section>
  );
}

export default function AccountSettings() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { user } = useBindStatus();
  const { section, setSection } = useSettingsSection();

  // Desktop always shows a section; the phone shows the index until one is chosen.
  const active: SettingsSectionKey | null = section ?? (isMobile ? null : 'profile');
  const activeTitle = active ? t(getSettingsSection(active).titleKey) : null;
  const email = user?.email;

  return (
    <div className="container mx-auto max-w-5xl p-4 sm:p-6">
      <Helmet>
        <title>
          {activeTitle && section
            ? t('settings.meta.title', { defaultValue: '{{section}} - Settings - EatPal', section: activeTitle })
            : t('settings.meta.titleIndex', { defaultValue: 'Settings - EatPal' })}
        </title>
        <meta
          name="description"
          content={t('settings.meta.description', {
            defaultValue:
              'Manage your profile, sign-in, privacy, notifications, planner, accessibility, plan and data.',
          })}
        />
        <meta name="robots" content="noindex" />
      </Helmet>

      <header className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">{t('settings.title', { defaultValue: 'Settings' })}</h1>
        {email && (
          <p className="mt-1 break-all text-sm text-muted-foreground">
            {t('settings.signedInAs', { defaultValue: 'Signed in as {{email}}', email })}
          </p>
        )}
      </header>

      {isMobile ? (
        active === null ? (
          <div className="space-y-6">
            <SettingsHubSearch />
            <section aria-labelledby="settings-quick-title" className="space-y-3">
              <h2 id="settings-quick-title" className="text-lg font-semibold">
                {t('settings.quick.title', { defaultValue: 'Quick settings' })}
              </h2>
              <QuickComfortRow />
              <WeekStartSetting />
            </section>
            <SettingsIndexList />
          </div>
        ) : (
          <div className="space-y-4">
            <Link
              to={SETTINGS_PATH}
              onClick={(e) => {
                e.preventDefault();
                setSection(null);
              }}
              className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {t('settings.nav.back', { defaultValue: 'All settings' })}
            </Link>
            <SettingsSectionPane key={active} sectionKey={active} />
          </div>
        )
      ) : (
        <div className="grid grid-cols-[14rem_minmax(0,1fr)] gap-8">
          <div className="space-y-4">
            <SettingsHubSearch />
            <SettingsRail active={active ?? 'profile'} />
          </div>
          <SettingsSectionPane key={active ?? 'profile'} sectionKey={active ?? 'profile'} />
        </div>
      )}
    </div>
  );
}
