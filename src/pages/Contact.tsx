import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Mail, MessageSquare, Clock, HelpCircle, CheckCircle2, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { captureContactFormLead } from "@/lib/lead-capture";
import { logger } from "@/lib/logger";
import { SEOHead } from "@/components/SEOHead";
import { getPageSEO } from "@/lib/seo-config";

const Contact = () => {
  const seoConfig = getPageSEO("contact");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Capture lead in database with full automation
      const result = await captureContactFormLead(
        formData.name,
        formData.email,
        formData.subject,
        formData.message
      );

      if (result.success) {
        toast.success("Message sent! We'll get back to you within 24-48 hours. Check your email for a confirmation.");
        setFormData({ name: "", email: "", subject: "", message: "" });
      } else {
        toast.error("There was an issue submitting your message. Please try again or email us directly.");
        logger.error("Lead capture error:", result.error);
      }
    } catch (error) {
      logger.error("Contact form error:", error);
      toast.error("There was an issue submitting your message. Please try again or email us directly.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubjectChange = (value: string) => {
    setFormData(prev => ({ ...prev, subject: value }));
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
      <main id="main-content" className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="text-center mb-12">
          {/* Response time badge */}
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-2 mb-6">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">We respond within 24 hours on business days</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-primary">
            Contact EatPal Support - Get Help with Picky Eater Meal Planning
          </h1>

          {/* TL;DR for GEO */}
          <div className="max-w-3xl mx-auto bg-primary/5 border-l-4 border-primary p-6 rounded-r-lg mb-6 text-left">
            <p className="text-sm font-semibold text-primary mb-2">TL;DR - Contact Information</p>
            <p className="text-muted-foreground leading-relaxed">
              <strong>Email:</strong> Support@TryEatPal.com | <strong>Response Time:</strong> 24-48 hours (business days) |
              <strong>Topics:</strong> Account setup, billing, technical support, feature requests, partnerships |
              <strong>Alternative:</strong> Check our <Link to="/faq" className="text-primary hover:underline">FAQ page</Link> for instant answers
            </p>
          </div>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Have questions about EatPal meal planning for picky eaters, ARFID, or selective eating? We're here to help! Reach out to our support team and we'll get back to you as soon as possible.
          </p>

          {/* Entity markers for AI understanding */}
          <div className="sr-only" aria-hidden="true">
            Contact EatPal support for: picky eater app help, ARFID meal planning questions, subscription billing,
            technical support, feature requests, feeding therapy integration questions, account setup assistance
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Contact Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Send us a Message
              </CardTitle>
              <CardDescription>
                Fill out the form below and we'll respond within 24-48 hours
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Check FAQ first nudge */}
              <div className="flex items-start gap-3 p-3 bg-muted/50 border rounded-lg mb-4">
                <HelpCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    Many questions are answered in our FAQ.{" "}
                    <Link to="/faq" className="text-primary font-medium hover:underline">
                      Check our FAQ first
                    </Link>
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Your name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Select value={formData.subject} onValueChange={handleSubjectChange} required>
                    <SelectTrigger id="subject">
                      <SelectValue placeholder="Select a topic..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Account & Setup">Account & Setup</SelectItem>
                      <SelectItem value="Billing & Subscription">Billing & Subscription</SelectItem>
                      <SelectItem value="Technical Support">Technical Support</SelectItem>
                      <SelectItem value="Feature Request">Feature Request</SelectItem>
                      <SelectItem value="Bug Report">Bug Report</SelectItem>
                      <SelectItem value="Partnership Inquiry">Partnership Inquiry</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    name="message"
                    placeholder="Tell us more about your question or concern..."
                    value={formData.message}
                    onChange={handleChange}
                    required
                    rows={6}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Sending..." : "Send Message"}
                </Button>
              </form>

              {/* What happens next? */}
              <div className="mt-6 pt-6 border-t">
                <h4 className="text-sm font-semibold mb-3">What happens next?</h4>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Send className="h-3 w-3 text-primary" />
                    </div>
                    <p className="text-xs text-muted-foreground">We receive your message and send a confirmation email.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Clock className="h-3 w-3 text-primary" />
                    </div>
                    <p className="text-xs text-muted-foreground">A team member reviews your request within 24 hours (business days).</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 className="h-3 w-3 text-primary" />
                    </div>
                    <p className="text-xs text-muted-foreground">You receive a personalized response via email with next steps.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contact Info */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary" />
                  Email Support
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Prefer email? Send your questions directly to our support team.
                </p>
                <a 
                  href="mailto:Support@TryEatPal.com" 
                  className="text-primary hover:underline font-semibold flex items-center gap-2"
                >
                  Support@TryEatPal.com
                </a>
                <p className="text-sm text-muted-foreground mt-4">
                  We typically respond within 24-48 hours (business days)
                </p>
              </CardContent>
            </Card>

            <Card className="bg-primary/5 border-primary/20">
              <CardHeader>
                <CardTitle>Common Topics</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold">•</span>
                    <span>Account setup and subscription questions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold">•</span>
                    <span>Feature requests and suggestions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold">•</span>
                    <span>Technical support and troubleshooting</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold">•</span>
                    <span>Billing and payment inquiries</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold">•</span>
                    <span>Privacy and data security questions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold">•</span>
                    <span>Partnership and collaboration opportunities</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Before You Reach Out</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Check out our FAQ page - many common questions are already answered there!
                </p>
                <Link to="/faq">
                  <Button variant="outline" className="w-full">
                    View FAQ
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
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
    </>
  );
};

export default Contact;