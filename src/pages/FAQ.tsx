import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SEOHead } from "@/components/SEOHead";
import { getPageSEO } from "@/lib/seo-config";

// FAQ data with semantic structure for both UI and schema
const faqData = [
  {
    question: "What is EatPal and how does it work?",
    answer: "EatPal is a comprehensive meal planning platform designed specifically for parents of picky eaters. You start by building a pantry of your child's safe foods and foods you'd like them to try. Our AI then generates personalized 7-day meal plans that include daily \"try bites\" to gently expand your child's diet. The app also creates automatic grocery lists, tracks food acceptance, and provides nutrition insights.",
  },
  {
    question: "Is EatPal available now?",
    answer: "Yes! EatPal is now live and ready to help you plan meals for your picky eater. Sign up today and start creating personalized meal plans with safe foods and try bites.",
  },
  {
    question: "Is EatPal suitable for children with ARFID or autism?",
    answer: "Yes! EatPal is designed to support various feeding challenges including ARFID (Avoidant/Restrictive Food Intake Disorder), autism spectrum food sensitivities, sensory processing issues, and typical picky eating. Our platform allows you to track allergens, sensory preferences, and safe foods, making it ideal for children with complex feeding needs. However, EatPal is not a replacement for medical care or feeding therapy.",
  },
  {
    question: "What are \"try bites\" and how do they work?",
    answer: "Try bites are single foods suggested each day for your child to try, based on food chaining principles used by feeding therapists. The goal is gentle exposure without pressure - you simply track whether your child ate it, tasted it, or refused it. Our AI learns from these responses to suggest increasingly appropriate foods that align with your child's preferences and expand their diet gradually.",
  },
  {
    question: "Can I manage meal plans for multiple children?",
    answer: "Absolutely! EatPal supports multiple child profiles within one account. Each child can have their own safe foods list, allergen tracking, meal plans, and preferences. This is perfect for families with siblings who have different eating patterns and needs. Premium plans offer unlimited child profiles.",
  },
  {
    question: "How does the AI meal planning work?",
    answer: "Our AI analyzes your child's safe foods, recent eating history, nutritional needs, and preferences to create balanced 7-day meal plans. It ensures variety (no repeated meals for 3 days), balanced nutrition across food groups, and respects allergen restrictions. The AI also learns from your feedback - when you mark foods as eaten, tried, or refused, it gets smarter about future suggestions.",
  },
  {
    question: "What's included in the Free plan?",
    answer: "The Free plan includes basic meal planning features for one child, limited pantry foods, manual meal planning, and basic food tracking. Premium plans unlock AI-powered meal generation, unlimited children, unlimited pantry foods, nutrition tracking, AI food suggestions, recipe builder, and priority support. Check our pricing page for full details.",
  },
  {
    question: "Can I cancel my subscription anytime?",
    answer: "Yes, you can cancel your subscription at any time. Your access will continue through the end of your current billing period. We don't offer refunds for partial months, but you won't be charged again after cancellation.",
  },
  {
    question: "How do I track allergens and dietary restrictions?",
    answer: "When creating a child profile, you can specify all allergens and dietary restrictions. EatPal will automatically flag foods containing those allergens and exclude them from meal plans. You can also mark individual foods with allergen information, and our AI will never suggest meals containing your child's allergens.",
  },
  {
    question: "Is my child's data private and secure?",
    answer: "Yes. We take privacy very seriously, especially when it comes to children's information. All data is encrypted, stored securely, and never shared or sold to third parties. We comply with all applicable privacy laws. See our Privacy Policy for complete details on how we protect your family's data.",
  },
  {
    question: "Can I export my meal plans and grocery lists?",
    answer: "Yes! You can export all your data including meal plans, grocery lists, food tracking history, and pantry information. This is useful for sharing with healthcare providers, dietitians, or feeding therapists, or simply for your own backup.",
  },
  {
    question: "Does EatPal work with feeding therapy?",
    answer: "Yes! Many parents use EatPal alongside feeding therapy. Our food chaining and try bite features are based on evidence-based feeding therapy techniques. You can export your child's food tracking data to share progress with your occupational therapist, speech therapist, or dietitian. However, EatPal is a tool to support therapy, not replace professional treatment.",
  },
  {
    question: "What if my child only eats 5-10 foods?",
    answer: "EatPal is designed for exactly this scenario! Even with a very limited safe food list, our platform can create meal plans using those foods while gently suggesting similar foods to try. The AI uses food chaining principles to recommend new foods that share textures, temperatures, or flavors with your child's safe foods, making expansion more likely to succeed.",
  },
  {
    question: "How do I get support if I have issues?",
    answer: "You can contact our support team at Support@TryEatPal.com. We typically respond within 24-48 hours. Premium subscribers receive priority support. We're here to help you get the most out of EatPal!",
  },
  {
    question: "Is there a mobile app?",
    answer: "EatPal is currently a web-based application that works great on mobile browsers. You can access it from any device with internet connectivity. Native iOS and Android apps are on our roadmap for future development.",
  },
];

const FAQ = () => {
  const seoConfig = getPageSEO("faq");

  // Generate FAQ schema for structured data
  const faqSchema = {
    "@type": "FAQPage",
    "@id": "https://tryeatpal.com/faq#faqpage",
    mainEntity: faqData.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  // Combine with breadcrumb and webpage schema
  const structuredData = [
    ...(seoConfig?.structuredData as object[]),
    faqSchema,
  ];

  return (
    <>
      <SEOHead {...seoConfig!} structuredData={structuredData} />
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
        {/* SEO-optimized heading structure */}
        <header className="mb-12">
          <h1 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-primary">
            Frequently Asked Questions About EatPal for Picky Eaters
          </h1>

          {/* TL;DR section for AI extraction (GEO optimization) */}
          <div className="bg-primary/5 border-l-4 border-primary p-6 rounded-r-lg mb-6">
            <p className="text-sm font-semibold text-primary mb-2">TL;DR - Quick Summary</p>
            <p className="text-muted-foreground leading-relaxed">
              <strong>EatPal</strong> is an AI-powered meal planning app for <strong>picky eaters</strong>, <strong>ARFID</strong>, and <strong>selective eating</strong>.
              Features include safe food tracking, daily try bites, automatic grocery lists, multi-child support, and nutrition monitoring.
              Free plan available, premium plans from $9.99/month. Works alongside feeding therapy. Data is private and secure.
            </p>
          </div>

          <p className="text-lg text-muted-foreground">
            Find answers to common questions about EatPal and how it can help with meal planning for picky eaters,
            ARFID management, and family nutrition tracking.
          </p>
        </header>

        {/* Entity markers for AI understanding */}
        <div className="sr-only" aria-hidden="true">
          Core topics: EatPal meal planning app, picky eater solutions, ARFID support, try bites methodology,
          safe food tracking, autism-friendly meal planning, allergen management, feeding therapy integration
        </div>

        <Accordion type="single" collapsible className="w-full space-y-4">
          {faqData.map((faq, index) => (
            <AccordionItem key={`item-${index + 1}`} value={`item-${index + 1}`}>
              <AccordionTrigger className="text-left text-lg font-semibold">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="mt-12 p-6 bg-primary/5 border border-primary/20 rounded-lg text-center">
          <h3 className="text-xl font-heading font-bold mb-3 text-primary">Still have questions?</h3>
          <p className="text-muted-foreground mb-4">
            We're here to help! Reach out to our support team.
          </p>
          <Link to="/contact">
            <Button>Contact Support</Button>
          </Link>
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

export default FAQ;
