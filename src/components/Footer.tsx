import { Link } from "react-router-dom";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/app-store";

export const Footer = () => {
  return (
    <footer className="border-t py-12 px-4 bg-secondary/5" role="contentinfo" aria-label="Site footer">
      <div className="container mx-auto">
        <nav className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8" aria-label="Footer navigation">
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <picture className="block dark:hidden">
                <source srcSet="/Logo-Green.webp" type="image/webp" />
                <img
                  src="/Logo-Green.webp"
                  alt="EatPal"
                  className="h-8"
                  width="120"
                  height="32"
                  loading="lazy"
                  decoding="async"
                />
              </picture>
              <picture className="hidden dark:block">
                <source srcSet="/Logo-White.webp" type="image/webp" />
                <img
                  src="/Logo-White.webp"
                  alt="EatPal"
                  className="h-8"
                  width="120"
                  height="32"
                  loading="lazy"
                  decoding="async"
                />
              </picture>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Making meal planning simple and stress-free for families with picky eaters.
            </p>
            {/*
              The site had no link to the App Store listing anywhere, despite the iOS app
              being the channel that actually gets discovered. These render only once
              VITE_APP_STORE_APP_ID / VITE_PLAY_STORE_PACKAGE are set — see
              src/lib/app-store.ts — so nothing ships a broken store link.
            */}
            {(APP_STORE_URL || PLAY_STORE_URL) && (
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {APP_STORE_URL && (
                  <li>
                    <a
                      href={APP_STORE_URL}
                      className="hover:text-primary transition-colors"
                      rel="noopener"
                    >
                      Download EatPal for iPhone &amp; iPad
                    </a>
                  </li>
                )}
                {PLAY_STORE_URL && (
                  <li>
                    <a
                      href={PLAY_STORE_URL}
                      className="hover:text-primary transition-colors"
                      rel="noopener"
                    >
                      Get EatPal on Google Play
                    </a>
                  </li>
                )}
              </ul>
            )}
          </div>
          <div>
            <h2 className="font-heading font-semibold mb-4 text-primary">Product</h2>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <Link to="/#features" className="hover:text-primary transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link to="/#how-it-works" className="hover:text-primary transition-colors">
                  How It Works
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="hover:text-primary transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                {/* US-647: same reasoning as the /guides link below. The comparison
                    cluster is otherwise reachable only from the sitemap. */}
                <Link to="/compare" className="hover:text-primary transition-colors">
                  Compare
                </Link>
              </li>
              <li>
                <Link to="/blog" className="hover:text-primary transition-colors">
                  Blog
                </Link>
              </li>
              <li>
                {/* The footer renders on every marketing page, so this is the crawl path
                    into the guide library. Without it the entire /guides cluster is
                    orphaned — reachable only from the sitemap and from other guides. */}
                <Link to="/guides" className="hover:text-primary transition-colors">
                  Guides
                </Link>
              </li>
              <li>
                {/* Same reasoning as /guides above: /authors had no inbound link
                    anywhere on the site. The label used to read "Our Experts", which
                    promised credentials EatPal does not have. */}
                <Link to="/authors" className="hover:text-primary transition-colors">
                  Editorial standards
                </Link>
              </li>
              <li>
                <Link to="/auth" className="hover:text-primary transition-colors">
                  Get Started
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="font-heading font-semibold mb-4 text-primary">Free Tools</h2>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <Link to="/picky-eater-quiz" className="hover:text-primary transition-colors">
                  Picky Eater Quiz
                </Link>
              </li>
              <li>
                <Link to="/budget-calculator" className="hover:text-primary transition-colors">
                  Budget Calculator
                </Link>
              </li>
              <li>
                <Link to="/meal-plan" className="hover:text-primary transition-colors">
                  Meal Plan Generator
                </Link>
              </li>
            </ul>
          </div>
          {/* The meal-occasion cluster. In the footer rather than buried on one page
              because a sitewide link is what stops a new cluster being orphaned, which
              is exactly what happened to /compare and /guides: both shipped finished and
              collected almost no traffic because nothing pointed at them. */}
          <div>
            <h2 className="font-heading font-semibold mb-4 text-primary">Meal Ideas</h2>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <Link
                  to="/picky-eater/dinner-ideas"
                  className="hover:text-primary transition-colors"
                >
                  Dinner Ideas
                </Link>
              </li>
              <li>
                <Link
                  to="/picky-eater/lunch-ideas"
                  className="hover:text-primary transition-colors"
                >
                  Lunch Ideas
                </Link>
              </li>
              <li>
                <Link
                  to="/picky-eater/breakfast-ideas"
                  className="hover:text-primary transition-colors"
                >
                  Breakfast Ideas
                </Link>
              </li>
              <li>
                <Link
                  to="/picky-eater/healthy-snacks"
                  className="hover:text-primary transition-colors"
                >
                  Healthy Snacks
                </Link>
              </li>
              <li>
                <Link
                  to="/picky-eater/healthy-meals"
                  className="hover:text-primary transition-colors"
                >
                  Healthy Meals
                </Link>
              </li>
            </ul>
          </div>
          {/* The ARFID cluster. It was the one topical cluster on the site with no
              sitewide link: /arfid/what-is-arfid, /arfid/arfid-vs-picky-eating and
              /arfid/arfid-in-adults were reachable only from /picky-eater-quiz, and
              /arfid/safe-foods-list only from /budget-calculator. The four pages
              cross-link each other, which makes them a closed loop rather than a
              cluster something points into. Same failure /compare and /guides had, on
              the terms closest to what EatPal is for.

              The grid is lg:grid-cols-6 and had five columns, so this fills the slot
              that was already reserved rather than reflowing the row. */}
          <div>
            <h2 className="font-heading font-semibold mb-4 text-primary">ARFID</h2>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <Link to="/arfid/what-is-arfid" className="hover:text-primary transition-colors">
                  What Is ARFID?
                </Link>
              </li>
              <li>
                <Link
                  to="/arfid/arfid-vs-picky-eating"
                  className="hover:text-primary transition-colors"
                >
                  ARFID vs Picky Eating
                </Link>
              </li>
              <li>
                <Link to="/arfid/safe-foods-list" className="hover:text-primary transition-colors">
                  Safe Foods List
                </Link>
              </li>
              <li>
                <Link to="/arfid/arfid-in-adults" className="hover:text-primary transition-colors">
                  ARFID in Adults
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="font-heading font-semibold mb-4 text-primary">Company</h2>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <Link to="/contact" className="hover:text-primary transition-colors">
                  Contact
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="hover:text-primary transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="hover:text-primary transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/accessibility" className="hover:text-primary transition-colors">
                  Accessibility
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="font-heading font-semibold mb-4 text-primary">Support</h2>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <Link to="/faq" className="hover:text-primary transition-colors">
                  FAQ
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-primary transition-colors">
                  Help Center
                </Link>
              </li>
              <li className="min-w-0">
                {/*
                  US-846, same shape as the fix on src/pages/Accessibility.tsx:
                  an email address is one unbreakable 161px word, and in the
                  footer it pushed /pricing, /blog, /auth and /guides 17px past
                  a 320px viewport. WCAG 1.4.10 Reflow names exactly this case.

                  break-words needs something to break against, so min-w-0 on
                  the list item is the half that does the work -- without it the
                  item refuses to shrink below its content and the address never
                  wraps. The footer is on every page, which is why four routes
                  failed for one link.
                */}
                <a
                  href="mailto:Support@TryEatPal.com"
                  className="hover:text-primary transition-colors break-words"
                >
                  Support@TryEatPal.com
                </a>
              </li>
            </ul>
          </div>
        </nav>
        <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
          <p>
            © {new Date().getFullYear()} EatPal. All rights reserved. Built with <span aria-label="love">❤️</span> for parents of picky eaters.
          </p>
        </div>
      </div>
    </footer>
  );
};
