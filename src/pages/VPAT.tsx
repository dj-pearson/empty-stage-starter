import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, AlertCircle, MinusCircle, Download } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ConformanceLevel = "Supports" | "Partially Supports" | "Does Not Support" | "Not Applicable";

interface WCAGCriterion {
  criterion: string;
  name: string;
  level: "A" | "AA" | "AAA";
  conformance: ConformanceLevel;
  remarks: string;
}

const wcagCriteria: WCAGCriterion[] = [
  // Level A Criteria
  { criterion: "1.1.1", name: "Non-text Content", level: "A", conformance: "Supports", remarks: "All images have alt text. Decorative images use aria-hidden or empty alt." },
  { criterion: "1.2.1", name: "Audio-only and Video-only (Prerecorded)", level: "A", conformance: "Not Applicable", remarks: "No audio-only or video-only content." },
  { criterion: "1.2.2", name: "Captions (Prerecorded)", level: "A", conformance: "Not Applicable", remarks: "No prerecorded video content with audio." },
  { criterion: "1.2.3", name: "Audio Description or Media Alternative", level: "A", conformance: "Not Applicable", remarks: "No prerecorded video content." },
  { criterion: "1.3.1", name: "Info and Relationships", level: "A", conformance: "Supports", remarks: "Semantic HTML, ARIA landmarks, proper heading hierarchy, and table headers used throughout." },
  { criterion: "1.3.2", name: "Meaningful Sequence", level: "A", conformance: "Supports", remarks: "Reading order matches visual order. Tab sequence is logical." },
  { criterion: "1.3.3", name: "Sensory Characteristics", level: "A", conformance: "Supports", remarks: "Instructions don't rely solely on shape, size, or location. Color is not the only indicator." },
  { criterion: "1.4.1", name: "Use of Color", level: "A", conformance: "Supports", remarks: "Color is never the sole indicator. Icons, text, and patterns supplement color coding." },
  { criterion: "1.4.2", name: "Audio Control", level: "A", conformance: "Supports", remarks: "No auto-playing audio. All media requires user interaction." },
  { criterion: "2.1.1", name: "Keyboard", level: "A", conformance: "Supports", remarks: "All functionality accessible via keyboard. Custom components support standard keyboard patterns." },
  { criterion: "2.1.2", name: "No Keyboard Trap", level: "A", conformance: "Supports", remarks: "Focus can always be moved using Tab/Escape. Modal dialogs properly trap and release focus." },
  { criterion: "2.1.4", name: "Character Key Shortcuts", level: "A", conformance: "Supports", remarks: "Keyboard shortcuts use modifier keys (Ctrl/Cmd+K). Can be disabled in settings." },
  { criterion: "2.2.1", name: "Timing Adjustable", level: "A", conformance: "Supports", remarks: "Extended timeout option available in accessibility settings." },
  { criterion: "2.2.2", name: "Pause, Stop, Hide", level: "A", conformance: "Supports", remarks: "Animations respect prefers-reduced-motion. Carousels have pause controls." },
  { criterion: "2.3.1", name: "Three Flashes or Below Threshold", level: "A", conformance: "Supports", remarks: "No content flashes more than 3 times per second." },
  { criterion: "2.4.1", name: "Bypass Blocks", level: "A", conformance: "Supports", remarks: "Skip to main content link implemented on all pages." },
  { criterion: "2.4.2", name: "Page Titled", level: "A", conformance: "Supports", remarks: "All pages have unique, descriptive titles via react-helmet-async." },
  { criterion: "2.4.3", name: "Focus Order", level: "A", conformance: "Supports", remarks: "Focus order follows logical reading sequence. Tab index properly managed." },
  { criterion: "2.4.4", name: "Link Purpose (In Context)", level: "A", conformance: "Supports", remarks: "Link text describes destination. Generic links have aria-label." },
  { criterion: "2.5.1", name: "Pointer Gestures", level: "A", conformance: "Supports", remarks: "No multipoint or path-based gestures required. Single pointer alternatives available." },
  { criterion: "2.5.2", name: "Pointer Cancellation", level: "A", conformance: "Supports", remarks: "Actions trigger on up-event. Abort mechanism available for drag operations." },
  { criterion: "2.5.3", name: "Label in Name", level: "A", conformance: "Supports", remarks: "Visible labels included in accessible names. No mismatch between visual and accessible names." },
  { criterion: "2.5.4", name: "Motion Actuation", level: "A", conformance: "Supports", remarks: "No motion-activated functionality. All features have standard input alternatives." },
  { criterion: "3.1.1", name: "Language of Page", level: "A", conformance: "Supports", remarks: "HTML lang=\"en\" attribute set on root element." },
  { criterion: "3.2.1", name: "On Focus", level: "A", conformance: "Supports", remarks: "Focus does not trigger unexpected context changes." },
  { criterion: "3.2.2", name: "On Input", level: "A", conformance: "Supports", remarks: "Form inputs do not auto-submit. Changes announced to screen readers." },
  { criterion: "3.3.1", name: "Error Identification", level: "A", conformance: "Supports", remarks: "Form errors clearly identified with text and ARIA. Error messages linked to fields." },
  { criterion: "3.3.2", name: "Labels or Instructions", level: "A", conformance: "Supports", remarks: "All form fields have visible labels. Instructions provided for complex inputs." },
  { criterion: "4.1.1", name: "Parsing", level: "A", conformance: "Supports", remarks: "Valid HTML5. No duplicate IDs. Proper nesting maintained." },
  { criterion: "4.1.2", name: "Name, Role, Value", level: "A", conformance: "Supports", remarks: "Custom components use appropriate ARIA roles, states, and properties." },

  // Level AA Criteria
  { criterion: "1.2.4", name: "Captions (Live)", level: "AA", conformance: "Not Applicable", remarks: "No live audio content." },
  { criterion: "1.2.5", name: "Audio Description (Prerecorded)", level: "AA", conformance: "Not Applicable", remarks: "No prerecorded video content." },
  { criterion: "1.3.4", name: "Orientation", level: "AA", conformance: "Supports", remarks: "Content adapts to portrait and landscape. No orientation lock." },
  { criterion: "1.3.5", name: "Identify Input Purpose", level: "AA", conformance: "Supports", remarks: "Form inputs use appropriate autocomplete attributes." },
  { criterion: "1.4.3", name: "Contrast (Minimum)", level: "AA", conformance: "Supports", remarks: "Text contrast ratio meets 4.5:1 for normal text, 3:1 for large text. High contrast mode available." },
  { criterion: "1.4.4", name: "Resize Text", level: "AA", conformance: "Supports", remarks: "Text resizes up to 200% without loss of functionality. Font size settings available." },
  { criterion: "1.4.5", name: "Images of Text", level: "AA", conformance: "Supports", remarks: "No images of text used for content. Logo is exception per WCAG." },
  { criterion: "1.4.10", name: "Reflow", level: "AA", conformance: "Supports", remarks: "Content reflows at 320px width. No horizontal scrolling required." },
  { criterion: "1.4.11", name: "Non-text Contrast", level: "AA", conformance: "Supports", remarks: "UI components and graphics meet 3:1 contrast ratio." },
  { criterion: "1.4.12", name: "Text Spacing", level: "AA", conformance: "Supports", remarks: "Content adapts to user-adjusted text spacing without loss of functionality." },
  { criterion: "1.4.13", name: "Content on Hover or Focus", level: "AA", conformance: "Supports", remarks: "Tooltips are dismissible, hoverable, and persistent until dismissed." },
  { criterion: "2.4.5", name: "Multiple Ways", level: "AA", conformance: "Supports", remarks: "Navigation menu, search, sitemap, and command palette provide multiple paths." },
  { criterion: "2.4.6", name: "Headings and Labels", level: "AA", conformance: "Supports", remarks: "Headings and labels describe topic or purpose clearly." },
  { criterion: "2.4.7", name: "Focus Visible", level: "AA", conformance: "Supports", remarks: "Focus indicators visible on all interactive elements. Enhanced focus mode available." },
  { criterion: "3.1.2", name: "Language of Parts", level: "AA", conformance: "Supports", remarks: "Single language (English) used throughout. lang attribute updated if content language changes." },
  { criterion: "3.2.3", name: "Consistent Navigation", level: "AA", conformance: "Supports", remarks: "Navigation components appear consistently across pages." },
  { criterion: "3.2.4", name: "Consistent Identification", level: "AA", conformance: "Supports", remarks: "Components with same function have consistent labels and appearance." },
  { criterion: "3.3.3", name: "Error Suggestion", level: "AA", conformance: "Supports", remarks: "Error messages provide suggestions for correction when possible." },
  { criterion: "3.3.4", name: "Error Prevention (Legal, Financial, Data)", level: "AA", conformance: "Supports", remarks: "Confirmation dialogs for destructive actions. Undo available for data changes." },
  { criterion: "4.1.3", name: "Status Messages", level: "AA", conformance: "Supports", remarks: "Status updates announced via ARIA live regions without focus change." },
];

const getConformanceIcon = (conformance: ConformanceLevel) => {
  switch (conformance) {
    case "Supports":
      return <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" />;
    case "Partially Supports":
      return <AlertCircle className="h-5 w-5 text-yellow-600" aria-hidden="true" />;
    case "Does Not Support":
      return <MinusCircle className="h-5 w-5 text-red-600" aria-hidden="true" />;
    case "Not Applicable":
      return <MinusCircle className="h-5 w-5 text-gray-400" aria-hidden="true" />;
  }
};

const VPAT = () => {
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const levelACriteria = wcagCriteria.filter(c => c.level === "A");
  const levelAACriteria = wcagCriteria.filter(c => c.level === "AA");

  const supportCount = wcagCriteria.filter(c => c.conformance === "Supports").length;
  const partialCount = wcagCriteria.filter(c => c.conformance === "Partially Supports").length;
  const naCount = wcagCriteria.filter(c => c.conformance === "Not Applicable").length;
  const totalApplicable = wcagCriteria.length - naCount;

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>VPAT - Accessibility Conformance Report - EatPal</title>
        <meta name="description" content="EatPal Voluntary Product Accessibility Template (VPAT) - WCAG 2.1 Level AA Conformance Report documenting accessibility compliance." />
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
          <div className="flex items-center gap-4">
            <Link to="/accessibility">
              <Button variant="ghost" className="gap-2">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Accessibility Statement
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="container mx-auto px-4 py-12 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-4xl md:text-5xl font-heading font-bold mb-4 text-primary">
            Voluntary Product Accessibility Template (VPAT)
          </h1>
          <p className="text-xl text-muted-foreground mb-2">
            WCAG 2.1 Level AA Accessibility Conformance Report
          </p>
          <p className="text-sm text-muted-foreground">
            Report Date: {currentDate} | Version 1.0
          </p>
        </div>

        {/* Product Information */}
        <section aria-labelledby="product-info-heading" className="mb-12 bg-card p-6 rounded-lg border">
          <h2 id="product-info-heading" className="text-2xl font-heading font-bold mb-4 text-primary">
            Product Information
          </h2>
          <dl className="grid md:grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Product Name</dt>
              <dd className="text-foreground">EatPal - Meal Planning Platform</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Product Version</dt>
              <dd className="text-foreground">Web Application v2.0</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Vendor</dt>
              <dd className="text-foreground">EatPal, Inc.</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Contact</dt>
              <dd className="text-foreground">
                <a href="mailto:accessibility@tryeatpal.com" className="text-primary hover:underline">
                  accessibility@tryeatpal.com
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Evaluation Methods</dt>
              <dd className="text-foreground">Automated testing (axe-core, Lighthouse), Manual testing, Screen reader testing (NVDA, VoiceOver)</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Applicable Standards</dt>
              <dd className="text-foreground">WCAG 2.1 Level AA, Section 508, ADA Title III</dd>
            </div>
          </dl>
        </section>

        {/* Summary */}
        <section aria-labelledby="summary-heading" className="mb-12">
          <h2 id="summary-heading" className="text-2xl font-heading font-bold mb-4 text-primary">
            Conformance Summary
          </h2>
          <div className="grid md:grid-cols-4 gap-4 mb-6">
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-green-600">{supportCount}</div>
              <div className="text-sm text-green-700 dark:text-green-400">Supports</div>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-yellow-600">{partialCount}</div>
              <div className="text-sm text-yellow-700 dark:text-yellow-400">Partially Supports</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-gray-600">{naCount}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Not Applicable</div>
            </div>
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-primary">{Math.round((supportCount / totalApplicable) * 100)}%</div>
              <div className="text-sm text-primary">Overall Compliance</div>
            </div>
          </div>
          <p className="text-muted-foreground">
            EatPal substantially conforms to WCAG 2.1 Level AA. This conformance report documents the accessibility status
            of all applicable success criteria. The evaluation was conducted using a combination of automated testing tools,
            manual inspection, and assistive technology testing.
          </p>
        </section>

        {/* Terms */}
        <section aria-labelledby="terms-heading" className="mb-12 bg-muted/50 p-6 rounded-lg">
          <h2 id="terms-heading" className="text-xl font-heading font-bold mb-4 text-foreground">
            Conformance Level Definitions
          </h2>
          <dl className="space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <dt className="font-medium text-foreground inline">Supports:</dt>
                <dd className="text-muted-foreground inline"> The functionality of the product has at least one method that meets the criterion without known defects.</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <dt className="font-medium text-foreground inline">Partially Supports:</dt>
                <dd className="text-muted-foreground inline"> Some functionality of the product does not meet the criterion.</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MinusCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <dt className="font-medium text-foreground inline">Does Not Support:</dt>
                <dd className="text-muted-foreground inline"> The majority of product functionality does not meet the criterion.</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MinusCircle className="h-5 w-5 text-gray-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <dt className="font-medium text-foreground inline">Not Applicable:</dt>
                <dd className="text-muted-foreground inline"> The criterion is not relevant to the product.</dd>
              </div>
            </div>
          </dl>
        </section>

        {/* Level A Table */}
        <section aria-labelledby="level-a-heading" className="mb-12">
          <h2 id="level-a-heading" className="text-2xl font-heading font-bold mb-4 text-primary">
            WCAG 2.1 Level A Success Criteria
          </h2>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Criterion</TableHead>
                  <TableHead>Success Criterion</TableHead>
                  <TableHead className="w-40">Conformance</TableHead>
                  <TableHead>Remarks and Explanations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {levelACriteria.map((criterion) => (
                  <TableRow key={criterion.criterion}>
                    <TableCell className="font-mono text-sm">{criterion.criterion}</TableCell>
                    <TableCell className="font-medium">{criterion.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getConformanceIcon(criterion.conformance)}
                        <span className="text-sm">{criterion.conformance}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{criterion.remarks}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* Level AA Table */}
        <section aria-labelledby="level-aa-heading" className="mb-12">
          <h2 id="level-aa-heading" className="text-2xl font-heading font-bold mb-4 text-primary">
            WCAG 2.1 Level AA Success Criteria
          </h2>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Criterion</TableHead>
                  <TableHead>Success Criterion</TableHead>
                  <TableHead className="w-40">Conformance</TableHead>
                  <TableHead>Remarks and Explanations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {levelAACriteria.map((criterion) => (
                  <TableRow key={criterion.criterion}>
                    <TableCell className="font-mono text-sm">{criterion.criterion}</TableCell>
                    <TableCell className="font-medium">{criterion.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getConformanceIcon(criterion.conformance)}
                        <span className="text-sm">{criterion.conformance}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{criterion.remarks}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* Legal Disclaimer */}
        <section aria-labelledby="legal-heading" className="mb-12 bg-muted/30 p-6 rounded-lg border">
          <h2 id="legal-heading" className="text-xl font-heading font-bold mb-4 text-foreground">
            Legal Disclaimer
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            This Voluntary Product Accessibility Template (VPAT) is provided for informational purposes only.
            The information contained herein is subject to change without notice. EatPal makes no warranties,
            express or implied, in this document.
          </p>
          <p className="text-sm text-muted-foreground">
            This document was prepared based on the product version available at the date of publication.
            Accessibility features may vary in different versions or configurations of the product.
            For the most current accessibility information, please contact{" "}
            <a href="mailto:accessibility@tryeatpal.com" className="text-primary hover:underline">
              accessibility@tryeatpal.com
            </a>.
          </p>
        </section>

        {/* Contact Information */}
        <section aria-labelledby="contact-heading" className="mb-12">
          <h2 id="contact-heading" className="text-2xl font-heading font-bold mb-4 text-primary">
            Contact Information
          </h2>
          <p className="text-muted-foreground mb-4">
            For questions about this VPAT or to report accessibility issues, please contact:
          </p>
          <ul className="space-y-2 text-muted-foreground">
            <li>
              <strong>Email:</strong>{" "}
              <a href="mailto:accessibility@tryeatpal.com" className="text-primary hover:underline">
                accessibility@tryeatpal.com
              </a>
            </li>
            <li>
              <strong>Phone:</strong>{" "}
              <a href="tel:+1-800-328-7251" className="text-primary hover:underline">
                1-800-EATPAL1 (1-800-328-7251)
              </a>
            </li>
            <li>
              <strong>Accessibility Statement:</strong>{" "}
              <Link to="/accessibility" className="text-primary hover:underline">
                https://tryeatpal.com/accessibility
              </Link>
            </li>
          </ul>
        </section>

        {/* Navigation Links */}
        <div className="flex flex-wrap gap-4 justify-center border-t pt-8">
          <Link to="/accessibility">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Accessibility Statement
            </Button>
          </Link>
          <Link to="/">
            <Button variant="ghost" className="gap-2">
              Return to Home
            </Button>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 px-4 bg-secondary/5 mt-12" role="contentinfo">
        <div className="container mx-auto text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} EatPal. All rights reserved.</p>
          <p className="mt-2">
            <Link to="/accessibility" className="text-primary hover:underline">Accessibility</Link>
            {" | "}
            <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
            {" | "}
            <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default VPAT;
