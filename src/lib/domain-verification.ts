/**
 * Custom domains for Professional accounts are not a feature yet.
 *
 * This module used to generate DNS records (a TXT token and CNAME @ ->
 * eatpal.com), call a verify-domain edge function that was never deployed, and
 * write status 'verified' and ssl_certificate_status 'issued' to
 * professional_custom_domains from the browser. Nothing serves a custom domain,
 * so every one of those told a clinician something false, and the status write
 * let a Professional account mark a domain it does not own as verified.
 *
 * The table stays (migrations are additive-only and older iOS builds may read
 * it); ProfessionalSettings shows an existing row read-only with a Remove
 * action. Verification, when it exists, belongs in an edge function that does
 * the DNS lookup and writes the status with the service role.
 *
 * What is left is the format check, kept for whoever builds that.
 */

/**
 * Is `domain` a syntactically valid host name (no scheme, path or port)?
 * Says nothing about ownership.
 */
export function isValidDomain(domain: string): boolean {
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*(\.[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*)*\.[a-zA-Z]{2,}$/;
  return domainRegex.test(domain);
}
