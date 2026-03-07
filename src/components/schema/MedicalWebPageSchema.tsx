/**
 * MedicalWebPageSchema - JSON-LD structured data for health/medical content
 *
 * Implements schema.org/MedicalWebPage for ARFID, feeding therapy, and
 * health-related content pages. This is critical for:
 * - Google Health YMYL (Your Money Your Life) content trust signals
 * - AI Overview health citations with proper attribution
 * - E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness)
 * - Rich results for medical/health queries
 *
 * Usage:
 * ```tsx
 * <MedicalWebPageSchema
 *   name="Understanding ARFID in Children"
 *   description="A comprehensive guide to ARFID diagnosis and treatment"
 *   medicalAudience="Patient"
 *   lastReviewed="2026-03-01"
 *   reviewedBy="Dr. Jane Smith, RD"
 *   about={["ARFID", "Feeding Disorders", "Selective Eating"]}
 * />
 * ```
 */

import { Helmet } from "react-helmet-async";

export interface MedicalWebPageSchemaProps {
  name: string;
  description: string;
  url?: string;
  medicalAudience?:
    | "Patient"
    | "MedicalResearcher"
    | "Clinician"
    | "CareGiver";
  lastReviewed?: string;
  datePublished?: string;
  dateModified?: string;
  reviewedBy?: string;
  about?: string[];
  medicalSpecialty?: string;
  mentions?: string[];
}

export function MedicalWebPageSchema({
  name,
  description,
  url = "https://tryeatpal.com",
  medicalAudience = "Patient",
  lastReviewed,
  datePublished,
  dateModified,
  reviewedBy,
  about = [],
  medicalSpecialty = "Pediatric Nutrition",
  mentions = [],
}: MedicalWebPageSchemaProps) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "MedicalWebPage",
    "@id": `${url}/#medicalwebpage`,
    name,
    description,
    url,
    ...(lastReviewed && { lastReviewed }),
    ...(datePublished && { datePublished }),
    ...(dateModified && { dateModified }),
    ...(medicalSpecialty && {
      specialty: {
        "@type": "MedicalSpecialty",
        name: medicalSpecialty,
      },
    }),
    medicineSystem: "WesternConventional",
    isPartOf: {
      "@id": "https://tryeatpal.com/#website",
    },
  };

  schema.audience = {
    "@type": "MedicalAudience",
    audienceType: medicalAudience,
  };

  if (reviewedBy) {
    schema.reviewedBy = {
      "@type": "Person",
      name: reviewedBy,
    };
  }

  if (about.length > 0) {
    schema.about = about.map((topic) => ({
      "@type": "MedicalCondition",
      name: topic,
    }));
  }

  if (mentions.length > 0) {
    schema.mentions = mentions.map((item) => ({
      "@type": "MedicalTherapy",
      name: item,
    }));
  }

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schema)}
      </script>
    </Helmet>
  );
}
