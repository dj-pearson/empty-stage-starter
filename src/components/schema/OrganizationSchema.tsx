import { Helmet } from "react-helmet-async";
import { storeSameAs } from "@/lib/app-store";

/**
 * OrganizationSchema - Site-wide organization structured data
 *
 * Place this on the homepage to establish:
 * - Brand identity for AI search
 * - Contact information
 * - Social profiles
 * - Logo for knowledge panels
 */
export function OrganizationSchema() {
  const schemaData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://tryeatpal.com/#organization",
    "name": "EatPal",
    "alternateName": ["EatPal App", "EatPal Meal Planner"],
    "url": "https://tryeatpal.com",
    "logo": "https://tryeatpal.com/Logo-Green.webp",
    "description":
      "EatPal is the only AI-powered meal planning platform using food chaining therapy to help parents systematically expand their child's diet. Evidence-based approach for picky eaters, ARFID, and selective eating.",
    "foundingDate": "2024",
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "Customer Support",
      "email": "Support@TryEatPal.com",
      "availableLanguage": "English",
      "areaServed": "US",
    },
    // sameAs is how search engines consolidate the website, the social profiles and the
    // App Store listing into ONE entity. It was an empty array of comments while
    // index.html's Organization node (same @id) listed the socials — so the two
    // contradicted each other and the profiles were never claimed. The store URLs are
    // appended only when VITE_APP_STORE_APP_ID / VITE_PLAY_STORE_PACKAGE are configured.
    "sameAs": [
      "https://facebook.com/eatpal",
      "https://twitter.com/eatpal",
      "https://instagram.com/eatpal",
      ...storeSameAs(),
    ],
    // NOTE: no SearchAction / sitelinks-searchbox here. It used to target
    // https://tryeatpal.com/search?q={search_term_string}, but the app has no /search
    // route — the advertised endpoint 404s. Re-add it only alongside a real search page.
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schemaData)}
      </script>
    </Helmet>
  );
}
