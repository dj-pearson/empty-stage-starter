import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur-sm z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/" className="flex items-center gap-2">
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
        <h1 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-primary">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last Updated: October 28, 2025</p>

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
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">4. Children's Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              EatPal is designed for use by parents and caregivers. We do not knowingly collect personal information 
              directly from children under 13. Child profiles created within parent accounts are managed entirely by 
              parents/guardians. If you believe we have inadvertently collected information from a child, please contact 
              us immediately at Support@TryEatPal.com.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">5. Information Sharing and Disclosure</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We do not sell your personal information. We may share your information only in the following circumstances:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Service Providers:</strong> With trusted third-party vendors who assist us in operating our platform 
              (e.g., cloud hosting, payment processing, analytics)</li>
              <li><strong>Legal Requirements:</strong> When required by law or to protect our rights and safety</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
              <li><strong>With Your Consent:</strong> When you explicitly authorize us to share information</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">6. Data Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              We implement industry-standard security measures to protect your information, including encryption, 
              secure servers, and regular security audits. However, no method of transmission over the internet is 
              100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">7. Your Rights and Choices</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              You have the right to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Access, update, or delete your personal information</li>
              <li>Opt-out of marketing communications</li>
              <li>Request a copy of your data</li>
              <li>Delete your account and associated data</li>
              <li>Object to processing of your information</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              To exercise these rights, contact us at Support@TryEatPal.com.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">8. Cookies and Tracking</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use cookies and similar tracking technologies to enhance your experience, analyze usage, and deliver 
              personalized content. You can control cookie preferences through your browser settings.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">9. International Users</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you are accessing our services from outside the United States, please be aware that your information 
              may be transferred to, stored, and processed in the United States where our servers are located.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">10. Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any material changes by 
              posting the new policy on this page and updating the "Last Updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">11. Contact Us</h2>
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
            <p>© 2025 EatPal. All rights reserved. Built with ❤️ for parents of picky eaters.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PrivacyPolicy;