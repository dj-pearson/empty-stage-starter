import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const TermsOfService = () => {
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
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-primary">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-8">Last Updated: October 10, 2025</p>

        <div className="prose prose-lg max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing and using EatPal ("Service"), you accept and agree to be bound by these Terms of Service 
              ("Terms"). If you do not agree to these Terms, please do not use our Service. We reserve the right to 
              modify these Terms at any time, and your continued use constitutes acceptance of any changes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">2. Description of Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              EatPal is a meal planning platform designed to help parents manage meals for children with selective eating, 
              picky eating, and related feeding challenges. Our Service includes meal planning tools, food tracking, 
              grocery list generation, AI-powered recommendations, and related features.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">3. User Accounts and Registration</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              To use certain features of EatPal, you must create an account. You agree to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Provide accurate, current, and complete information</li>
              <li>Maintain and promptly update your account information</li>
              <li>Maintain the security of your password and account</li>
              <li>Notify us immediately of any unauthorized use of your account</li>
              <li>Be responsible for all activities that occur under your account</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              You must be at least 18 years old to create an account and use our Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">4. Subscription and Payment</h2>
            <h3 className="text-xl font-semibold mb-3 text-foreground">Subscription Plans</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              EatPal offers various subscription plans with different features and pricing. By subscribing, you agree to pay 
              the applicable fees for your chosen plan.
            </p>
            
            <h3 className="text-xl font-semibold mb-3 text-foreground">Billing</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Subscriptions are billed in advance on a recurring basis (monthly or annually)</li>
              <li>Payment will be charged to your payment method on file</li>
              <li>Your subscription will automatically renew unless you cancel before the renewal date</li>
              <li>We reserve the right to change our pricing with 30 days' notice</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6 text-foreground">Refunds and Cancellation</h3>
            <p className="text-muted-foreground leading-relaxed">
              You may cancel your subscription at any time. Cancellations take effect at the end of the current billing 
              period. We do not provide refunds for partial months or years, except as required by law or at our sole discretion.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">5. User Content and Data</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              You retain ownership of all content and data you submit to EatPal ("User Content"). By using our Service, 
              you grant us a license to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Store, process, and display your User Content to provide the Service</li>
              <li>Use aggregated, anonymized data for analytics and service improvement</li>
              <li>Back up your data for security and continuity purposes</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              You are responsible for maintaining backups of your User Content. We are not liable for any loss or 
              corruption of User Content.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">6. Acceptable Use Policy</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              You agree not to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Violate any laws or regulations</li>
              <li>Infringe on intellectual property rights</li>
              <li>Transmit viruses, malware, or harmful code</li>
              <li>Attempt to gain unauthorized access to our systems</li>
              <li>Use the Service for any illegal or unauthorized purpose</li>
              <li>Harass, abuse, or harm others</li>
              <li>Impersonate any person or entity</li>
              <li>Scrape, mine, or extract data from the Service without permission</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">7. Medical Disclaimer</h2>
            <p className="text-muted-foreground leading-relaxed font-semibold mb-4">
              IMPORTANT: EatPal is NOT a substitute for professional medical advice, diagnosis, or treatment.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Our Service provides meal planning tools and suggestions, but:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>We do not provide medical advice or nutritional counseling</li>
              <li>All meal plans and recommendations are for informational purposes only</li>
              <li>You should consult with healthcare professionals regarding your child's nutrition and feeding issues</li>
              <li>We are not responsible for any health outcomes resulting from use of our Service</li>
              <li>Always seek the advice of your pediatrician, dietitian, or feeding therapist for medical concerns</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">8. Intellectual Property</h2>
            <p className="text-muted-foreground leading-relaxed">
              All content, features, and functionality of EatPal (including but not limited to text, graphics, logos, 
              icons, images, software, and design) are owned by EatPal and are protected by copyright, trademark, and 
              other intellectual property laws. You may not copy, modify, distribute, or reverse engineer any part of 
              our Service without written permission.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">9. Third-Party Services</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our Service may contain links to third-party websites or services. We are not responsible for the content, 
              privacy policies, or practices of third-party sites. Your use of third-party services is at your own risk.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">10. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, EATPAL SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, 
              CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, 
              OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES RESULTING FROM YOUR USE OF THE SERVICE.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">11. Warranty Disclaimer</h2>
            <p className="text-muted-foreground leading-relaxed">
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, 
              INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">12. Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to suspend or terminate your account and access to the Service at our sole discretion, 
              without notice, for conduct that we believe violates these Terms or is harmful to other users, us, or third 
              parties, or for any other reason.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">13. Governing Law</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of the United States, without 
              regard to its conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-heading font-bold mb-4 text-primary">14. Contact Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              For questions about these Terms of Service, please contact us at:
            </p>
            <p className="text-muted-foreground leading-relaxed mt-4">
              <strong>Email:</strong> Support@TryEatPal.com<br />
              <strong>Subject Line:</strong> Terms of Service Inquiry
            </p>
          </section>
        </div>
      </main>
    </div>
  );
};

export default TermsOfService;