import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import { getPageSEO } from "@/lib/seo-config";
import { resetConsent } from "@/lib/consent";

// ─────────────────────────────────────────────────────────────────────────────
// DRAFT — COMPLIANCE AUDIT 2026-07. The GDPR, California (CCPA/CPRA), children's
// privacy, cookie, data-retention, subprocessor, and AI-processing sections
// below were drafted by the compliance audit to close known gaps. They are
// REVIEW-READY DRAFTS and MUST be reviewed and approved by legal counsel before
// this page is shipped. Do not treat as final legal copy.
// ─────────────────────────────────────────────────────────────────────────────

const PrivacyPolicy = () => {
  const { t } = useTranslation();
  const seoConfig = getPageSEO("privacy");

  const handleManageCookies = () => {
    resetConsent();
    // Reload so the consent banner reappears with a fresh (undecided) state.
    if (typeof window !== "undefined") window.location.reload();
  };
  return (
    <>
    <SEOHead {...seoConfig!} />
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur-sm z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/" className="flex items-center gap-2">
            <img 
              src="/Logo-Green.webp" 
              alt="EatPal" 
              className="h-8 block dark:hidden"
            />
            <img 
              src="/Logo-White.webp" 
              alt="EatPal" 
              className="h-8 hidden dark:block"
            />
          </Link>
          <Link to="/">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main id="main-content" className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-primary">{t('privacyPolicy.title')}</h1>
        <p className="text-sm text-muted-foreground mb-8">Last Updated: July 23, 2026</p>

        <div className="prose prose-lg max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">1. Introduction</h2>
            <p className="text-muted-foreground leading-relaxed">
              Welcome to EatPal ("we," "our," or "us"). We are committed to protecting your privacy and the privacy 
              of your children. This Privacy Policy explains how we collect, use, disclose, and safeguard your information 
              when you use our meal planning application and services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">2. Information We Collect</h2>
            <h3 className="text-xl font-semibold mb-3 text-foreground">Personal Information</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We collect information that you provide directly to us, including:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Account information (name, email address, password)</li>
              <li>Child profiles (name, age, dietary preferences, allergens)</li>
              <li>Food preferences and meal planning data</li>
              <li>Grocery lists and pantry information</li>
              <li>Payment and billing information (processed securely through Stripe)</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6 text-foreground">Automatically Collected Information</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              When you use our services, we automatically collect:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Device information (type, operating system, browser)</li>
              <li>Usage data (features used, time spent in app)</li>
              <li>Log data (IP address, access times, pages viewed)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">3. How We Use Your Information</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We use the information we collect to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Provide, maintain, and improve our meal planning services</li>
              <li>Generate personalized meal plans and food recommendations</li>
              <li>Process your transactions and manage your subscription</li>
              <li>Send you important updates, newsletters, and marketing communications (with your consent)</li>
              <li>Respond to your inquiries and provide customer support</li>
              <li>Monitor and analyze usage patterns to improve user experience</li>
              <li>Protect against fraud and unauthorized access</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">4. Children's Privacy (COPPA)</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              EatPal is a service for <strong>parents, guardians, and caregivers</strong> — not for children. Our
              accounts and features are intended for adults (18+). Children do not create accounts, log in, or interact
              with EatPal directly, and we do not knowingly collect personal information directly from children under 13.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              To provide meal planning, a parent or guardian may create <strong>child profiles</strong> containing
              information <em>about</em> a child (such as first name or nickname, age or date of birth, dietary
              preferences, and allergens). This information is entered and controlled entirely by the adult account
              holder, who is responsible for the accuracy of the information they provide and confirms they are the
              child's parent or legal guardian, or are otherwise authorized to provide it.
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
              <li>Child-profile information is used only to power meal planning, allergen tracking, and recommendations for that child.</li>
              <li>A parent/guardian can view, edit, or delete any child profile at any time from within the app, and can delete all child data by deleting the profile or the account.</li>
              <li>We do not require a child to disclose more information than is reasonably necessary, and we do not condition participation on disclosing unnecessary information.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              If you believe a child under 13 has provided us information directly, or you wish to review or delete child
              information associated with your account, contact us at Support@TryEatPal.com and we will act promptly.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">5. Information Sharing and Disclosure</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We do <strong>not sell</strong> your personal information, and we do not "share" it for cross-context
              behavioral advertising. We disclose information only in the following circumstances:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li><strong>Service Providers / Subprocessors:</strong> With the trusted vendors listed below who process data on our behalf under contract.</li>
              <li><strong>Legal Requirements:</strong> When required by law or to protect our rights and safety.</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets.</li>
              <li><strong>With Your Consent:</strong> When you explicitly authorize us to share information.</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 text-foreground">Our Subprocessors</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We use the following third-party service providers to operate EatPal. Each processes only the data needed
              for its function:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Supabase</strong> — application database, authentication, and backend hosting (stores your account and app data).</li>
              <li><strong>Stripe</strong> — payment and subscription processing (payment and billing information).</li>
              <li><strong>Sentry</strong> — error and performance monitoring to keep the app reliable (diagnostic and, where you consent, session-replay data, with text and media masked).</li>
              <li><strong>Google Analytics</strong> — usage analytics, loaded only where you consent (device and usage data, with IP anonymization).</li>
              <li><strong>Resend</strong> — transactional and (with your consent) marketing email delivery (email address).</li>
              <li><strong>AI providers (Anthropic, OpenAI, and/or Google)</strong> — power AI meal planning and coaching features (see Section 6).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">6. AI Features and Automated Processing</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Some features (such as AI meal plans and the AI coach) use third-party large-language-model providers
              (Anthropic, OpenAI, and/or Google). When you use these features, we send the information needed to generate
              a response — which may include a child's first name or nickname, age, allergens, and food preferences —
              to the AI provider that fulfills the request.
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>We share only what is necessary to produce the requested output.</li>
              <li>We do not use these features to make legal or similarly significant automated decisions about you.</li>
              <li>You can avoid this processing by not using the AI features; core meal-planning features remain available.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">7. Data Retention</h2>
            <p className="text-muted-foreground leading-relaxed">
              We retain your personal information for as long as your account is active or as needed to provide the
              service. When you delete your account, we delete or de-identify your account and app data (including child
              profiles) within a reasonable period, except where we must retain limited information to comply with legal
              obligations, resolve disputes, prevent fraud, or enforce our agreements. Backups are retained on a rolling
              basis and are overwritten in the ordinary course.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">8. Data Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              We implement industry-standard security measures to protect your information, including encryption, 
              secure servers, and regular security audits. However, no method of transmission over the internet is 
              100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">9. Your Rights and Choices</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              You have the right to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Access, update, or correct your personal information</li>
              <li>Opt out of marketing communications at any time</li>
              <li>Request a copy of your data (data portability)</li>
              <li>Delete your account and associated data</li>
              <li>Object to or restrict certain processing of your information</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              You can exercise most of these rights directly in the app: go to{" "}
              <strong>Account Settings</strong> to export your data as a file or to permanently delete your account and
              all associated data. You can also manage email preferences from your account. For any other request, or if
              you need help, contact us at Support@TryEatPal.com and we will respond within the timeframe required by
              applicable law. We will not discriminate against you for exercising these rights.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">10. Cookies and Tracking</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We use cookies and similar technologies in two categories:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
              <li><strong>Essential (always on):</strong> Strictly necessary to run the service — for example, keeping you signed in and remembering your preferences. These cannot be switched off.</li>
              <li><strong>Analytics (consent required):</strong> Help us understand how the app is used so we can improve it (e.g., Google Analytics and Sentry session replay). These load <strong>only after you opt in</strong> via our cookie banner and stay off until then.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mb-4">
              When you first visit, we ask for your choice and set non-essential cookies only if you accept. You can
              change your decision at any time:
            </p>
            <Button variant="outline" onClick={handleManageCookies}>
              Manage cookie preferences
            </Button>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">11. International Data Transfers</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you access our services from outside the United States, your information may be transferred to, stored,
              and processed in the United States and other countries where we or our subprocessors operate. Where such
              transfers are subject to data-protection law (e.g., from the EEA or UK), we rely on appropriate safeguards
              such as the European Commission's Standard Contractual Clauses (and the UK Addendum) with the receiving
              parties. You may contact us for more information about these safeguards.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">12. Your European Privacy Rights (GDPR / UK GDPR)</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              If you are in the European Economic Area, the United Kingdom, or Switzerland, EatPal is the "controller"
              of your personal data. We process your data on these lawful bases:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
              <li><strong>Contract</strong> — to provide the meal-planning service you sign up for.</li>
              <li><strong>Consent</strong> — for analytics cookies and marketing communications (which you can withdraw at any time).</li>
              <li><strong>Legitimate interests</strong> — to secure, maintain, and improve the service, balanced against your rights.</li>
              <li><strong>Legal obligation</strong> — where we must process data to comply with law.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              In addition to the rights in Section 9, you have the right to withdraw consent at any time, and the right
              to lodge a complaint with your local supervisory authority (in the UK, the ICO). Where we rely on consent,
              withdrawing it does not affect processing already carried out. Contact us at Support@TryEatPal.com to
              exercise any of these rights.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">13. Your California Privacy Rights (CCPA/CPRA)</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              If you are a California resident, you have the right to know, access, correct, and delete the personal
              information we hold about you, and to be free from discrimination for exercising these rights.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              In the past 12 months we have collected the following categories of personal information: identifiers
              (name, email), customer records (account and billing details), commercial information (subscription
              history), internet/usage activity (app and analytics data), and — for the child profiles you create —
              limited information about your children. We collect it for the purposes described in Section 3 and share
              it only with the subprocessors listed in Section 5.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              <strong>We do not sell your personal information, and we do not share it for cross-context behavioral
              advertising.</strong> Because we do not sell or share personal information, no "Do Not Sell or Share My
              Personal Information" opt-out is required; if that ever changes, we will provide one. You may exercise your
              California rights in the app (Account Settings) or by contacting Support@TryEatPal.com, and you may use an
              authorized agent to submit a request on your behalf.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">14. Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any material changes by 
              posting the new policy on this page and updating the "Last Updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">15. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions or concerns about this Privacy Policy, please contact us at:
            </p>
            <p className="text-muted-foreground leading-relaxed mt-4">
              <strong>Email:</strong> Support@TryEatPal.com<br />
              <strong>Subject Line:</strong> Privacy Policy Inquiry
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-12 px-4 bg-secondary/5">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img 
                  src="/Logo-Green.webp" 
                  alt="EatPal" 
                  className="h-8 block dark:hidden"
                />
                <img 
                  src="/Logo-White.webp" 
                  alt="EatPal" 
                  className="h-8 hidden dark:block"
                />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Making meal planning simple and stress-free for families with picky eaters.
              </p>
            </div>
            <div>
              <h3 className="font-heading font-semibold mb-4 text-primary">Product</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link to="/#features" className="hover:text-primary transition-colors">Features</Link></li>
                <li><Link to="/#how-it-works" className="hover:text-primary transition-colors">How It Works</Link></li>
                <li><Link to="/pricing" className="hover:text-primary transition-colors">Pricing</Link></li>
                <li><Link to="/auth" className="hover:text-primary transition-colors">Get Started</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-heading font-semibold mb-4 text-primary">Company</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link to="/contact" className="hover:text-primary transition-colors">Contact</Link></li>
                <li><Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-primary transition-colors">Terms of Service</Link></li>
                <li><Link to="/accessibility" className="hover:text-primary transition-colors">Accessibility</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-heading font-semibold mb-4 text-primary">Support</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link to="/faq" className="hover:text-primary transition-colors">FAQ</Link></li>
                <li><Link to="/contact" className="hover:text-primary transition-colors">Help Center</Link></li>
                <li>
                  <a href="mailto:Support@TryEatPal.com" className="hover:text-primary transition-colors">
                    Support@TryEatPal.com
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
            <p>© 2026 EatPal. All rights reserved. Built with ❤️ for parents of picky eaters.</p>
          </div>
        </div>
      </footer>
    </div>
    </>
  );
};

export default PrivacyPolicy;