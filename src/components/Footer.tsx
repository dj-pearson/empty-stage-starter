import { Link } from "react-router-dom";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/app-store";

export const Footer = () => {
  return (
    <footer className="border-t py-12 px-4 bg-secondary/5" role="contentinfo" aria-label="Site footer">
      <div className="container mx-auto">
        <nav className="grid grid-cols-2 md:grid-cols-5 gap-8" aria-label="Footer navigation">
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
            <h3 className="font-heading font-semibold mb-4 text-primary">Product</h3>
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
                {/* Same reasoning as /guides above: /authors carries the clinical
                    credentials behind our feeding content and had no inbound link
                    anywhere on the site. */}
                <Link to="/authors" className="hover:text-primary transition-colors">
                  Our Experts
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
            <h3 className="font-heading font-semibold mb-4 text-primary">Free Tools</h3>
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
          <div>
            <h3 className="font-heading font-semibold mb-4 text-primary">Company</h3>
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
            <h3 className="font-heading font-semibold mb-4 text-primary">Support</h3>
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
              <li>
                <a
                  href="mailto:Support@TryEatPal.com"
                  className="hover:text-primary transition-colors"
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
