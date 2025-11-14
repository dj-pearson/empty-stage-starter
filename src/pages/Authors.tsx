import { SEOHead } from "@/components/SEOHead";
import { BreadcrumbSchema } from "@/components/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Linkedin, Twitter } from "lucide-react";

/**
 * Authors Page - E-E-A-T Signals for SEO
 *
 * This page establishes credibility by showcasing:
 * - Author credentials (Expertise)
 * - Professional experience (Experience)
 * - Authority indicators (Authoritativeness)
 * - Contact information (Trustworthiness)
 */

export interface Author {
  id: string;
  name: string;
  credentials: string;
  title: string;
  bio: string;
  expertise: string[];
  experience: string;
  avatarUrl?: string;
  email?: string;
  linkedin?: string;
  twitter?: string;
  articleCount?: number;
}

// Sample authors - replace with real data from database
const authors: Author[] = [
  {
    id: "dr-sarah-johnson",
    name: "Dr. Sarah Johnson",
    credentials: "Ph.D., RDN, LD",
    title: "Lead Nutrition Scientist & Content Director",
    bio: "Dr. Sarah Johnson is a registered dietitian nutritionist with over 15 years of experience specializing in pediatric nutrition and feeding disorders. She completed her Ph.D. in Nutritional Sciences at Cornell University with a focus on food chaining interventions for children with ARFID. Dr. Johnson has worked with over 500 families to implement evidence-based feeding strategies.",
    expertise: [
      "Pediatric Nutrition",
      "ARFID Treatment",
      "Food Chaining Therapy",
      "Selective Eating Disorders",
      "Evidence-Based Feeding Interventions",
    ],
    experience: "15+ years in pediatric feeding therapy, 500+ families helped",
    articleCount: 47,
    email: "sarah@tryeatpal.com",
    linkedin: "https://linkedin.com/in/drsarahjohnson",
  },
  {
    id: "emily-martinez",
    name: "Emily Martinez",
    credentials: "MS, OTR/L, SOS Certified",
    title: "Pediatric Occupational Therapist",
    bio: "Emily Martinez is an occupational therapist specializing in sensory-based feeding challenges. She is SOS (Sequential Oral Sensory) Approach certified and has extensive training in food chaining methodology. Emily has worked in pediatric feeding clinics for 10 years and has helped families navigate autism spectrum feeding issues, sensory processing disorders, and extreme selective eating.",
    expertise: [
      "Sensory Processing & Feeding",
      "SOS Approach",
      "Autism Spectrum Feeding",
      "Texture Progression",
      "Occupational Therapy for Feeding",
    ],
    experience: "10+ years in pediatric OT, specialized in feeding therapy",
    articleCount: 32,
    email: "emily@tryeatpal.com",
  },
  {
    id: "michael-chen",
    name: "Michael Chen",
    credentials: "MS, CCC-SLP",
    title: "Speech-Language Pathologist",
    bio: "Michael Chen is a speech-language pathologist with expertise in oral motor development and pediatric dysphagia. He has worked extensively with children who have complex feeding challenges including those with developmental delays, autism, and structural abnormalities. Michael brings 12 years of clinical experience and a focus on parent-led home-based interventions.",
    expertise: [
      "Oral Motor Development",
      "Pediatric Dysphagia",
      "Speech Therapy for Feeding",
      "Parent Coaching",
      "Home-Based Interventions",
    ],
    experience: "12+ years in speech-language pathology, feeding specialist",
    articleCount: 28,
    email: "michael@tryeatpal.com",
  },
];

export default function Authors() {
  const canonicalUrl = "https://tryeatpal.com/authors";

  return (
    <>
      <SEOHead
        title="Our Expert Authors - Feeding Therapy Specialists | EatPal"
        description="Meet EatPal's team of registered dietitians, occupational therapists, and feeding specialists. Our authors bring decades of combined experience in pediatric nutrition, ARFID treatment, and evidence-based feeding therapy."
        keywords="feeding therapy experts, pediatric dietitians, occupational therapists, ARFID specialists, food chaining experts, picky eater experts, nutrition scientists"
        canonicalUrl={canonicalUrl}
        aiPurpose="This page showcases EatPal's expert authors and contributors who create evidence-based content on food chaining, picky eating, and feeding therapy. All authors are licensed professionals with specialized training in pediatric feeding disorders."
        aiAudience="Parents researching author credentials, healthcare professionals evaluating content quality, media seeking expert sources"
        aiKeyFeatures="Registered dietitians, occupational therapists, speech-language pathologists, Ph.D. nutritional scientists, ARFID specialists, food chaining experts"
      />

      <BreadcrumbSchema
        items={[
          { name: "Home", url: "https://tryeatpal.com/" },
          { name: "Authors", url: canonicalUrl },
        ]}
      />

      <div className="container mx-auto px-4 py-12 max-w-6xl">
        {/* Page Header */}
        <header className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Our Expert Authors
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Meet the team of licensed feeding therapy professionals behind
            EatPal's evidence-based content. Our authors combine decades of
            clinical experience with the latest research in pediatric nutrition
            and feeding disorders.
          </p>
        </header>

        {/* Authors Grid */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {authors.map((author) => (
            <Card key={author.id} id={author.id} className="scroll-mt-20">
              <CardHeader>
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    {author.avatarUrl ? (
                      <img
                        src={author.avatarUrl}
                        alt={author.name}
                        className="w-20 h-20 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-10 w-10 text-primary" />
                      </div>
                    )}
                  </div>

                  {/* Name & Title */}
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold mb-1">{author.name}</h2>
                    <p className="text-primary font-semibold mb-1">
                      {author.credentials}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {author.title}
                    </p>
                    {author.articleCount && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {author.articleCount} articles published
                      </p>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Bio */}
                <p className="text-sm leading-relaxed">{author.bio}</p>

                {/* Experience */}
                <div>
                  <h3 className="font-semibold text-sm mb-2">Experience</h3>
                  <p className="text-sm text-muted-foreground">
                    {author.experience}
                  </p>
                </div>

                {/* Expertise */}
                <div>
                  <h3 className="font-semibold text-sm mb-2">Areas of Expertise</h3>
                  <div className="flex flex-wrap gap-2">
                    {author.expertise.map((area) => (
                      <Badge key={area} variant="secondary">
                        {area}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Contact Links */}
                <div className="flex gap-3 pt-2">
                  {author.email && (
                    <a
                      href={`mailto:${author.email}`}
                      className="text-muted-foreground hover:text-primary transition-colors"
                      aria-label={`Email ${author.name}`}
                    >
                      <Mail className="h-5 w-5" />
                    </a>
                  )}
                  {author.linkedin && (
                    <a
                      href={author.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors"
                      aria-label={`${author.name} on LinkedIn`}
                    >
                      <Linkedin className="h-5 w-5" />
                    </a>
                  )}
                  {author.twitter && (
                    <a
                      href={author.twitter}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors"
                      aria-label={`${author.name} on Twitter`}
                    >
                      <Twitter className="h-5 w-5" />
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Credibility Statement */}
        <section className="bg-muted/50 rounded-lg p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">
            Evidence-Based, Expert-Reviewed Content
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Every article on EatPal is written or reviewed by licensed
            professionals with specialized training in pediatric feeding
            disorders. We cite peer-reviewed research and follow the latest
            evidence-based guidelines for feeding therapy. Our content is
            regularly updated to reflect new research and clinical best
            practices.
          </p>
        </section>
      </div>
    </>
  );
}
