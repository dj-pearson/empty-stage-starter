import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SEOHead } from "@/components/SEOHead";
import { BreadcrumbSchema } from "@/components/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { User, Mail, Linkedin, Twitter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

/**
 * Authors Page - E-E-A-T Signals for SEO
 *
 * This page establishes credibility by showcasing:
 * - Author credentials (Expertise)
 * - Professional experience (Experience)
 * - Authority indicators (Authoritativeness)
 * - Contact information (Trustworthiness)
 *
 * Authors are fetched from the blog_authors table in the database.
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

interface SocialLinks {
  email?: string;
  linkedin?: string;
  twitter?: string;
  credentials?: string;
  title?: string;
  experience?: string;
}

/**
 * There is deliberately no fallback author list here.
 *
 * This file used to carry three placeholder clinicians: a "Dr. Sarah Johnson" with a
 * Cornell Ph.D. and a linkedin.com/in/drsarahjohnson URL, plus an OT and an SLP, all
 * invented, each with specific credentials and claims like "500+ families helped".
 * They rendered whenever blog_authors was empty or unreachable, behind a small
 * "sample data" banner.
 *
 * That was survivable only because /authors had no route and nothing linked to it. It
 * is not survivable now: the page is routed, prerendered into static HTML, listed in
 * the sitemap, linked from the sitewide footer, and emits Person schema. Fabricated
 * licensed clinicians asserted as the authority behind ARFID and pediatric feeding
 * advice is misrepresentation to parents making decisions for their kids, and it is
 * exactly the pattern search engines penalise as deceptive E-E-A-T.
 *
 * When there are no authors in the database the page now says so and sets noindex.
 * Populate public.blog_authors with real people to make it indexable.
 */

export default function Authors() {
  const { t } = useTranslation();
  const canonicalUrl = "https://tryeatpal.com/authors";
  const [authors, setAuthors] = useState<Author[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchAuthors() {
      try {
        const { data, error } = await supabase
          .from("blog_authors")
          .select("*")
          .order("post_count", { ascending: false, nullsFirst: false });

        if (error) {
          logger.error("Error fetching authors:", error);
          setAuthors([]);
          return;
        }

        if (!data || data.length === 0) {
          logger.info("No authors found in blog_authors; rendering the empty state.");
          setAuthors([]);
          return;
        }

        // Map database authors to Author interface
        const mappedAuthors: Author[] = data.map((dbAuthor) => {
          const socialLinks = (dbAuthor.social_links as SocialLinks) || {};

          return {
            id: dbAuthor.id,
            name: dbAuthor.display_name,
            credentials: socialLinks.credentials || "",
            title: socialLinks.title || "",
            bio: dbAuthor.bio || "",
            expertise: dbAuthor.expertise || [],
            experience: socialLinks.experience || "",
            avatarUrl: dbAuthor.avatar_url || undefined,
            email: socialLinks.email,
            linkedin: socialLinks.linkedin,
            twitter: socialLinks.twitter,
            articleCount: dbAuthor.post_count || undefined,
          };
        });

        setAuthors(mappedAuthors);
      } catch (error) {
        logger.error("Error in fetchAuthors:", error);
        setAuthors([]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAuthors();
  }, []);

  /**
   * Person entities for every author on the page.
   *
   * The bios here are the E-E-A-T evidence behind health content about ARFID and
   * pediatric feeding. The credentials were already rendered for human readers, but
   * nothing on the page declared them as machine-readable entities, so no search or
   * answer engine could connect "EatPal says X about ARFID" to a licensed clinician.
   * `knowsAbout` is the field that does that work: it is what resolves an author to a
   * topic when an engine decides whose claim to quote.
   */
  const authorSchema = useMemo(() => {
    if (authors.length === 0) return undefined;

    return {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${canonicalUrl}#authors`,
      url: canonicalUrl,
      name: "EatPal Authors and Clinical Reviewers",
      description:
        "Registered dietitians, occupational therapists, and feeding specialists who write and review EatPal's picky eating, food chaining, and ARFID content.",
      isPartOf: { "@id": "https://tryeatpal.com/#website" },
      publisher: { "@id": "https://tryeatpal.com/#organization" },
      mainEntity: authors.map((author) => ({
        "@type": "Person",
        "@id": `${canonicalUrl}#${author.id}`,
        name: author.name,
        ...(author.credentials && { honorificSuffix: author.credentials }),
        ...(author.title && { jobTitle: author.title }),
        ...(author.bio && { description: author.bio }),
        ...(author.avatarUrl && { image: author.avatarUrl }),
        ...(author.expertise.length > 0 && { knowsAbout: author.expertise }),
        worksFor: { "@id": "https://tryeatpal.com/#organization" },
        ...(() => {
          // sameAs is how an engine reconciles this Person with the same human on
          // LinkedIn or X. An empty array is worse than no property, so omit it.
          const sameAs = [author.linkedin, author.twitter].filter(Boolean);
          return sameAs.length > 0 ? { sameAs } : {};
        })(),
      })),
    };
  }, [authors, canonicalUrl]);

  return (
    <>
      {/* noindex below: an author page with no authors is a credentials page that
          proves nothing. Keep it out of the index until blog_authors has real people
          in it, rather than ranking an empty promise of expertise. */}
      <SEOHead
        structuredData={authorSchema}
        noindex={!isLoading && authors.length === 0}
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

      <div id="main-content" className="container mx-auto px-4 py-12 max-w-6xl">
        {/* Page Header */}
        <header className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            {t('authors.title')}
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Meet the team of licensed feeding therapy professionals behind
            EatPal's evidence-based content. Our authors combine decades of
            clinical experience with the latest research in pediatric nutrition
            and feeding disorders.
          </p>
        </header>

        {/* Loading State */}
        {isLoading && (
          <div className="grid md:grid-cols-2 gap-8 mb-12" role="status" aria-live="polite" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <Skeleton className="w-20 h-20 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-6 w-24" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Authors Grid */}
        {!isLoading && (
          <>
            {authors.length === 0 && (
              <div className="border rounded-lg p-8 mb-8 text-center">
                <p className="text-muted-foreground">
                  Author profiles are being set up and will be published here shortly.
                </p>
              </div>
            )}

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
                        {author.credentials && (
                          <p className="text-primary font-semibold mb-1">
                            {author.credentials}
                          </p>
                        )}
                        {author.title && (
                          <p className="text-sm text-muted-foreground">
                            {author.title}
                          </p>
                        )}
                        {author.articleCount && author.articleCount > 0 && (
                          <p className="text-sm text-muted-foreground mt-2">
                            {author.articleCount} articles published
                          </p>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Bio */}
                    {author.bio && (
                      <p className="text-sm leading-relaxed">{author.bio}</p>
                    )}

                    {/* Experience */}
                    {author.experience && (
                      <div>
                        <h3 className="font-semibold text-sm mb-2">Experience</h3>
                        <p className="text-sm text-muted-foreground">
                          {author.experience}
                        </p>
                      </div>
                    )}

                    {/* Expertise */}
                    {author.expertise && author.expertise.length > 0 && (
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
                    )}

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
          </>
        )}

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
