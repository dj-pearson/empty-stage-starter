import { Link } from "react-router-dom";

export const Footer = () => {
  return (
    <footer className="border-t py-12 px-4 bg-secondary/5" role="contentinfo" aria-label="Site footer">
      <div className="container mx-auto">
        <nav className="grid md:grid-cols-4 gap-8" aria-label="Footer navigation">
          <div>
            <Link to="/" className="flex items-center gap-2 mb-4">
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
            <p className="text-sm text-muted-foreground leading-relaxed">
              Making meal planning simple and stress-free for families with picky eaters.
            </p>
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
                <Link to="/auth" className="hover:text-primary transition-colors">
                  Get Started
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
