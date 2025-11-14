import { Helmet } from "react-helmet-async";

export interface FAQ {
  question: string;
  answer: string;
}

export interface FAQSchemaProps {
  faqs: FAQ[];
}

/**
 * FAQSchema - Structured data component for FAQ sections
 *
 * Optimized for:
 * - Google AI Overviews
 * - ChatGPT/Perplexity citations
 * - Featured snippet capture
 * - Voice search results
 */
export function FAQSchema({ faqs }: FAQSchemaProps) {
  const schemaData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map((faq) => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer,
      },
    })),
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schemaData)}
      </script>
    </Helmet>
  );
}
