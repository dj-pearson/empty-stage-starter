import { Helmet } from 'react-helmet-async';
import { AccessibilitySettings as AccessibilitySettingsComponent } from '@/components/AccessibilitySettings';

export default function AccessibilitySettingsPage() {
  return (
    <>
      <Helmet>
        <title>Accessibility Settings - EatPal</title>
        <meta
          name="description"
          content="Customize your EatPal experience with accessibility settings including high contrast mode, reduced motion, screen reader optimization, and more."
        />
      </Helmet>

      <div className="container mx-auto py-6 px-4 max-w-4xl">
        <header className="mb-6">
          <h1 className="text-3xl font-heading font-bold text-foreground">
            Accessibility Settings
          </h1>
          <p className="text-muted-foreground mt-2">
            Customize your experience to meet your accessibility needs
          </p>
        </header>

        <main id="main-content">
          <AccessibilitySettingsComponent />
        </main>
      </div>
    </>
  );
}
