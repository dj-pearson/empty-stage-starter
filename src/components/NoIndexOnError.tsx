import { useEffect } from "react";

/**
 * Takes the current URL out of the index for as long as an error state is on screen.
 *
 * The SPA answers 200 to everything, so a route that throws still returns a crawlable
 * document -- and if the crash happened before that page's SEOHead mounted, the head
 * standing in it is the one index.html ships, which describes the homepage. That is how
 * "This page encountered an error" gets indexed under /pricing, wearing the homepage
 * title and pointing its canonical at /.
 *
 * This is a DOM write rather than a <Helmet>, because the two boundaries that need it
 * most sit ABOVE <HelmetProvider> in the tree (src/main.tsx wraps the whole app, and
 * src/App.tsx wraps the provider itself). A Helmet rendered there throws for want of a
 * provider, which would turn a handled crash into an unhandled one.
 *
 * Any other robots meta is pulled while this is mounted and put back on unmount, so the
 * page carries exactly one directive rather than a contradicting pair. Cleanup matters:
 * "Try Again" recovers in place, and a route that recovers must go back to indexable.
 */
export function NoIndexOnError() {
  useEffect(() => {
    const displaced = Array.from(
      document.head.querySelectorAll<HTMLMetaElement>('meta[name="robots"]')
    );
    const anchor = displaced[0]?.nextSibling ?? null;
    displaced.forEach((meta) => meta.remove());

    const meta = document.createElement("meta");
    meta.setAttribute("name", "robots");
    meta.setAttribute("content", "noindex, follow");
    document.head.appendChild(meta);

    return () => {
      meta.remove();
      displaced.forEach((old) => document.head.insertBefore(old, anchor));
    };
  }, []);

  return null;
}
