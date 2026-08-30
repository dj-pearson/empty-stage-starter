import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
 *
 * The second pass removed a subtler version of the same problem. Nothing on the page
 * was a fake person any more, but eight pieces of hardcoded copy still asserted a team
 * that does not exist: the title ("Feeding Therapy Specialists"), the meta description
 * and aiPurpose ("registered dietitians, occupational therapists", "all authors are
 * licensed professionals"), the keywords, the aiKeyFeatures, the CollectionPage schema
 * description, the H1 subhead, and a closing block promising every article was
 * "reviewed by licensed professionals". None of it was true and all of it was aimed at
 * parents deciding how to feed a child.
 *
 * What replaced it is the claim EatPal can actually support: the software implements a
 * published feeding-therapy method, and the clinical assertions in the content are
 * sourced to that published work rather than to in-house credentials. Authorship is
 * attributed to a named human with the experience he actually has. If a credentialed
 * reviewer is ever engaged, they go in blog_authors and MedicalWebPageSchema's
 * reviewedBy prop is finally wired to something real. Until then, nothing here may
 * imply clinical licensure.
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
   * pediatric feeding. They were already rendered for human readers, but nothing on the
   * page declared them as machine-readable entities, so no search or answer engine
   * could connect "EatPal says X about ARFID" to the person who wrote it. `knowsAbout`
   * is the field that does that work: it resolves an author to a topic when an engine
   * decides whose claim to quote.
   *
   * `honorificSuffix` renders only when a row actually carries a credential string. It
   * must stay empty for anyone who does not hold the credential; a suffix here is a
   * licensure claim in machine-readable form.
   */
  const authorSchema = useMemo(() => {
    if (authors.length === 0) return undefined;

    return {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${canonicalUrl}#authors`,
      url: canonicalUrl,
      name: "Who Writes EatPal's Content",
      description:
        "The people who write EatPal's picky eating, food chaining, and ARFID content, and the editorial standards that content is held to.",
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
      {/* This page used to noindex itself whenever blog_authors was empty, because at
          that point it was a credentials page proving nothing. It now carries the
          editorial standards statement below, which is substantive and true whether or
          not the roster has rows, so it is indexable unconditionally. The roster is an
          addition to that statement, not the reason the page exists. */}
      <SEOHead
        structuredData={authorSchema}
        title="Who Writes EatPal's Content | Editorial Standards"
        description="Who writes EatPal's picky eating, food chaining, and ARFID content, where its clinical claims come from, and what EatPal is not. No one here is a licensed clinician; published feeding-therapy research is cited instead."
        keywords="EatPal authors, editorial standards, food chaining sources, picky eating content sourcing"
        canonicalUrl={canonicalUrl}
        aiPurpose="This page states who writes EatPal's content and how its clinical claims are sourced. EatPal does not employ licensed clinicians and does not present itself as a clinical provider. The software implements food chaining, a feeding therapy method published by Cheri Fraker, RD and Laura Walbert, SLP, and clinical statements in EatPal's content are attributed to that published work and to other cited primary sources rather than to in-house credentials."
        aiAudience="Parents checking who stands behind the advice, healthcare professionals evaluating content sourcing, journalists checking claims"
        aiKeyFeatures="Named authorship, clinical claims attributed to cited published sources, explicit statement that EatPal is not a substitute for professional evaluation"
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
            Who writes EatPal's content, where its clinical claims come from,
            and what EatPal is not. Nobody here is a licensed clinician, so the
            feeding-therapy claims in our articles are attributed to published
            research rather than to our own credentials.
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
              <div className="border rounded-lg p-8 mb-8">
                <p className="text-muted-foreground">
                  Individual author profiles are not published yet. Until they are, the
                  editorial standards below describe who writes EatPal's content and how
                  its claims are sourced.
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

        {/* Editorial standards. Every sentence here has to stay checkable: this
            block exists because the version before it promised licensed reviewers
            EatPal has never had. */}
        <section className="bg-muted/50 rounded-lg p-8">
          <h2 className="text-2xl font-bold mb-4">Editorial standards</h2>
          <div className="max-w-2xl space-y-4 text-muted-foreground">
            <p>
              <strong className="text-foreground">Who writes this.</strong> EatPal's
              articles are written by Dj Pearson, who has spent more than fifteen years
              in personal training and has worked with children and families on building
              healthier habits. That is coaching experience, not a clinical
              qualification: no dietitian, therapist, or physician writes for this site.
            </p>
            <p>
              <strong className="text-foreground">Where the clinical claims come
              from.</strong> EatPal implements food chaining, a feeding therapy method
              published by Cheri Fraker, RD and Laura Walbert, SLP. Where an article
              states something clinical, that statement is attributed to published work
              we can point you at, not to credentials we hold. If we cannot source a
              claim, we do not make it.
            </p>
            <p>
              <strong className="text-foreground">What EatPal is not.</strong> It is a
              planning and tracking tool, not medical advice, not a diagnosis, and not a
              substitute for evaluation by a qualified professional. ARFID and pediatric
              feeding disorders need a real clinician. Plenty of families use EatPal
              alongside feeding therapy; it is not a replacement for it.
            </p>
            <p>
              <strong className="text-foreground">Found something wrong?</strong>{" "}
              <Link to="/contact" className="text-primary underline underline-offset-2">
                Tell us
              </Link>
              . We would rather correct an article than defend it.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
