import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, Mail, Phone, MessageSquare, FileText, ExternalLink } from "lucide-react";

const Accessibility = () => {
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Accessibility Statement - EatPal</title>
        <meta name="description" content="EatPal's commitment to digital accessibility. Learn about our WCAG 2.1 AA compliance, accessibility features, and how to request accommodations." />
        <meta property="og:title" content="Accessibility Statement - EatPal" />
        <meta property="og:description" content="EatPal's commitment to digital accessibility. WCAG 2.1 AA compliance, accessibility features, and accommodation requests." />
        <meta property="og:type" content="website" />
      </Helmet>

      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur-sm z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/" className="flex items-center gap-2">
            <img
              src="/Logo-Green.png"
              alt="EatPal - Return to homepage"
              className="h-8 block dark:hidden"
            />
            <img
              src="/Logo-White.png"
              alt="EatPal - Return to homepage"
              className="h-8 hidden dark:block"
            />
          </Link>
          <Link to="/">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Home
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-primary">
          Accessibility Statement
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          Last Updated: {currentDate}
        </p>

        <div className="prose prose-lg max-w-none space-y-8">
          {/* Introduction */}
          <section aria-labelledby="commitment-heading">
            <h2 id="commitment-heading" className="text-2xl font-heading font-bold mb-4 text-primary">
              Our Commitment to Accessibility
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              EatPal is committed to ensuring digital accessibility for people with disabilities. We are
              continually improving the user experience for everyone and applying the relevant accessibility
              standards to guarantee we provide equal access to all users.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-4">
              We believe that every family deserves access to tools that help manage meal planning for
              children with dietary challenges, regardless of ability. Our commitment to accessibility
              is fundamental to our mission of supporting all families.
            </p>
          </section>

          {/* Conformance Status */}
          <section aria-labelledby="conformance-heading">
            <h2 id="conformance-heading" className="text-2xl font-heading font-bold mb-4 text-primary">
              Conformance Status
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              EatPal substantially conforms to the <strong>Web Content Accessibility Guidelines (WCAG) 2.1
              Level AA</strong>. These guidelines explain how to make web content more accessible for
              people with disabilities and more user-friendly for everyone.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We also comply with the <strong>Americans with Disabilities Act (ADA)</strong> and
              <strong> Section 508 of the Rehabilitation Act</strong> to ensure our digital services
              are accessible to users with disabilities.
            </p>
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mt-4">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <strong className="text-foreground">Detailed Conformance Report (VPAT)</strong>
                  <p className="text-muted-foreground text-sm mt-1">
                    For a detailed breakdown of our WCAG 2.1 Level AA conformance, including specific
                    success criteria evaluations, view our Voluntary Product Accessibility Template.
                  </p>
                  <Link
                    to="/accessibility/vpat"
                    className="inline-flex items-center gap-1 text-primary hover:underline mt-2 text-sm font-medium"
                  >
                    View VPAT Document <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* Accessibility Features */}
          <section aria-labelledby="features-heading">
            <h2 id="features-heading" className="text-2xl font-heading font-bold mb-4 text-primary">
              Accessibility Features
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              EatPal includes the following accessibility features:
            </p>

            <h3 className="text-xl font-semibold mb-3 text-foreground">
              Navigation and Structure
            </h3>
            <ul className="space-y-3 text-muted-foreground mb-6">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>Skip Navigation Links:</strong> Bypass repetitive content and jump directly to main content</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>Consistent Navigation:</strong> Navigation menus appear in the same location across all pages</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>Logical Heading Structure:</strong> Properly nested headings (H1-H6) for easy navigation</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>Landmark Regions:</strong> ARIA landmarks help screen reader users navigate page sections</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>Breadcrumb Navigation:</strong> Clear indication of current location within the site</span>
              </li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 text-foreground">
              Keyboard Accessibility
            </h3>
            <ul className="space-y-3 text-muted-foreground mb-6">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>Full Keyboard Navigation:</strong> All interactive elements are accessible via keyboard</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>Visible Focus Indicators:</strong> Clear visual indication of focused elements</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>Keyboard Shortcuts:</strong> Command palette (Ctrl/Cmd + K) for quick navigation</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>Focus Trapping:</strong> Modal dialogs properly trap and manage focus</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>No Keyboard Traps:</strong> Users can navigate away from any element using standard keys</span>
              </li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 text-foreground">
              Screen Reader Support
            </h3>
            <ul className="space-y-3 text-muted-foreground mb-6">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>ARIA Labels:</strong> Descriptive labels for all interactive elements</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>Alt Text:</strong> Meaningful descriptions for all informative images</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>Live Regions:</strong> Dynamic content changes are announced to screen readers</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>Form Labels:</strong> All form inputs have associated labels and error messages</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>Table Headers:</strong> Data tables use proper header associations</span>
              </li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 text-foreground">
              Visual Accessibility
            </h3>
            <ul className="space-y-3 text-muted-foreground mb-6">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>Color Contrast:</strong> Text meets WCAG 2.1 AA contrast requirements (4.5:1 minimum)</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>Resizable Text:</strong> Text can be resized up to 200% without loss of functionality</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>Dark Mode:</strong> Alternative color scheme to reduce eye strain</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>High Contrast Support:</strong> Respects system high contrast mode preferences</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>Non-Color Indicators:</strong> Information is not conveyed by color alone</span>
              </li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 text-foreground">
              Motion and Animation
            </h3>
            <ul className="space-y-3 text-muted-foreground">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>Reduced Motion:</strong> Respects prefers-reduced-motion system preference</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>No Auto-Playing Media:</strong> Videos and audio do not play automatically</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>No Flashing Content:</strong> Content does not flash more than 3 times per second</span>
              </li>
            </ul>
          </section>

          {/* Assistive Technologies */}
          <section aria-labelledby="technologies-heading">
            <h2 id="technologies-heading" className="text-2xl font-heading font-bold mb-4 text-primary">
              Compatibility with Assistive Technologies
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              EatPal is designed to be compatible with the following assistive technologies:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
              <li>NVDA (NonVisual Desktop Access) on Windows</li>
              <li>JAWS (Job Access With Speech) on Windows</li>
              <li>VoiceOver on macOS and iOS</li>
              <li>TalkBack on Android</li>
              <li>Windows Narrator</li>
              <li>Dragon NaturallySpeaking (voice recognition)</li>
              <li>Switch navigation devices</li>
              <li>Screen magnification software (ZoomText, Windows Magnifier)</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              We test our application with the latest versions of these technologies and recommend
              using the most recent versions of both assistive technologies and web browsers for
              the best experience.
            </p>
          </section>

          {/* Browser Support */}
          <section aria-labelledby="browsers-heading">
            <h2 id="browsers-heading" className="text-2xl font-heading font-bold mb-4 text-primary">
              Supported Browsers
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              EatPal works best with the following browsers (latest two versions):
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Google Chrome (desktop and mobile)</li>
              <li>Mozilla Firefox (desktop and mobile)</li>
              <li>Apple Safari (desktop and mobile)</li>
              <li>Microsoft Edge</li>
            </ul>
          </section>

          {/* Known Limitations */}
          <section aria-labelledby="limitations-heading">
            <h2 id="limitations-heading" className="text-2xl font-heading font-bold mb-4 text-primary">
              Known Limitations
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              While we strive for full accessibility, some areas may have limitations:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Third-Party Content:</strong> Some embedded third-party content (such as payment
              processors) may not fully meet accessibility standards. We work with our vendors to
              ensure accessibility where possible.</li>
              <li><strong>User-Generated Content:</strong> Images and content uploaded by users may not
              always have proper alt text or descriptions.</li>
              <li><strong>PDF Documents:</strong> Some older PDF documents may not be fully accessible.
              We are working to remediate these documents.</li>
              <li><strong>Complex Data Visualizations:</strong> Some charts and graphs provide data tables
              as alternatives, but may not convey all nuances to screen reader users.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              We are actively working to address these limitations. If you encounter any accessibility
              barriers, please contact us so we can provide accommodations.
            </p>
          </section>

          {/* Accessibility Settings */}
          <section aria-labelledby="settings-heading">
            <h2 id="settings-heading" className="text-2xl font-heading font-bold mb-4 text-primary">
              Accessibility Settings
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              EatPal provides the following accessibility settings that you can customize:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Theme:</strong> Choose between light, dark, or system-default color schemes</li>
              <li><strong>Reduced Motion:</strong> Disable or reduce animations and transitions</li>
              <li><strong>High Contrast:</strong> Enable enhanced color contrast for better visibility</li>
              <li><strong>Font Size:</strong> Adjust text size for improved readability</li>
              <li><strong>Screen Reader Mode:</strong> Optimize the interface for screen reader navigation</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              Access these settings in your account profile under "Accessibility Preferences."
            </p>
          </section>

          {/* Feedback & Assistance */}
          <section aria-labelledby="feedback-heading">
            <h2 id="feedback-heading" className="text-2xl font-heading font-bold mb-4 text-primary">
              Feedback and Assistance
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We welcome your feedback on the accessibility of EatPal. If you encounter accessibility
              barriers or need assistance, please let us know:
            </p>

            <div className="bg-secondary/10 rounded-lg p-6 space-y-4">
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <strong className="text-foreground">Email:</strong>
                  <p className="text-muted-foreground">
                    <a
                      href="mailto:accessibility@tryeatpal.com"
                      className="text-primary hover:underline"
                    >
                      accessibility@tryeatpal.com
                    </a>
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <strong className="text-foreground">Phone:</strong>
                  <p className="text-muted-foreground">
                    <a
                      href="tel:+1-800-EATPAL1"
                      className="text-primary hover:underline"
                    >
                      1-800-EATPAL1 (1-800-328-7251)
                    </a>
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MessageSquare className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <strong className="text-foreground">Contact Form:</strong>
                  <p className="text-muted-foreground">
                    <Link
                      to="/contact?subject=accessibility"
                      className="text-primary hover:underline"
                    >
                      Submit an accessibility request
                    </Link>
                  </p>
                </div>
              </div>
            </div>

            <p className="text-muted-foreground leading-relaxed mt-4">
              When contacting us about an accessibility issue, please include:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>The URL or page where you encountered the issue</li>
              <li>A description of the problem</li>
              <li>The assistive technology you were using (if applicable)</li>
              <li>Your browser and operating system</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              We aim to respond to accessibility feedback within <strong>2 business days</strong> and
              to resolve accessibility issues as quickly as possible.
            </p>
          </section>

          {/* Accommodations */}
          <section aria-labelledby="accommodations-heading">
            <h2 id="accommodations-heading" className="text-2xl font-heading font-bold mb-4 text-primary">
              Alternative Access and Accommodations
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              If you are unable to access any content or feature on our platform due to a disability,
              we will provide reasonable accommodations. These may include:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Providing information in an alternative format (large print, audio, etc.)</li>
              <li>Phone-based assistance for completing tasks</li>
              <li>Extended time for completing time-sensitive operations</li>
              <li>Alternative methods for submitting information</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              To request an accommodation, please contact us at{" "}
              <a
                href="mailto:accessibility@tryeatpal.com"
                className="text-primary hover:underline"
              >
                accessibility@tryeatpal.com
              </a>.
            </p>
          </section>

          {/* Enforcement */}
          <section aria-labelledby="enforcement-heading">
            <h2 id="enforcement-heading" className="text-2xl font-heading font-bold mb-4 text-primary">
              Enforcement and Formal Complaints
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We are committed to resolving accessibility concerns promptly. If you are not satisfied
              with our response, you may file a complaint with:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>
                <strong>U.S. Department of Justice:</strong>{" "}
                <a
                  href="https://www.ada.gov/file-a-complaint/"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ADA.gov Complaint Filing
                </a>
              </li>
              <li>
                <strong>Office for Civil Rights (OCR):</strong>{" "}
                <a
                  href="https://www.hhs.gov/ocr/complaints/index.html"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  HHS OCR Complaints
                </a>
              </li>
            </ul>
          </section>

          {/* Continuous Improvement */}
          <section aria-labelledby="improvement-heading">
            <h2 id="improvement-heading" className="text-2xl font-heading font-bold mb-4 text-primary">
              Continuous Improvement
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              EatPal is committed to ongoing accessibility improvement. Our efforts include:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Regular automated and manual accessibility testing</li>
              <li>Accessibility training for our development and design teams</li>
              <li>Including accessibility requirements in our development process</li>
              <li>Engaging with disability communities for feedback</li>
              <li>Regular third-party accessibility audits</li>
              <li>Updating this statement as we make improvements</li>
            </ul>
          </section>

          {/* Technical Specifications */}
          <section aria-labelledby="technical-heading">
            <h2 id="technical-heading" className="text-2xl font-heading font-bold mb-4 text-primary">
              Technical Specifications
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              EatPal relies on the following technologies to work with assistive technologies:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>HTML5</li>
              <li>WAI-ARIA (Web Accessibility Initiative - Accessible Rich Internet Applications)</li>
              <li>CSS3</li>
              <li>JavaScript (ECMAScript)</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              These technologies are relied upon for conformance with the accessibility standards used.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-12 px-4 bg-secondary/5" role="contentinfo">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img
                  src="/Logo-Green.png"
                  alt="EatPal"
                  className="h-8 block dark:hidden"
                />
                <img
                  src="/Logo-White.png"
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
                <li><Link to="/accessibility" className="hover:text-primary transition-colors" aria-current="page">Accessibility</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-heading font-semibold mb-4 text-primary">Support</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link to="/faq" className="hover:text-primary transition-colors">FAQ</Link></li>
                <li><Link to="/contact" className="hover:text-primary transition-colors">Help Center</Link></li>
                <li>
                  <a href="mailto:accessibility@tryeatpal.com" className="hover:text-primary transition-colors">
                    Accessibility Help
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} EatPal. All rights reserved. Built with care for all families.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Accessibility;
