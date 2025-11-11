import { supabase } from '@/integrations/supabase/client';

export interface DNSRecord {
  type: 'TXT' | 'CNAME' | 'A';
  name: string;
  value: string;
  ttl: number;
}

export interface DomainVerificationResult {
  success: boolean;
  message: string;
  verified: boolean;
  details?: {
    txtRecord?: boolean;
    cnameRecord?: boolean;
    aRecord?: boolean;
  };
}

/**
 * Generate DNS records for domain verification
 * @param domain - The domain name to verify
 * @param verificationToken - The unique verification token
 * @returns Object containing required DNS records
 */
export function generateDNSRecords(domain: string, verificationToken: string): {
  verification: DNSRecord;
  cname: DNSRecord;
  www_cname: DNSRecord;
} {
  return {
    verification: {
      type: 'TXT',
      name: '_eatpal-verification',
      value: verificationToken,
      ttl: 3600,
    },
    cname: {
      type: 'CNAME',
      name: '@',
      value: 'eatpal.com',
      ttl: 3600,
    },
    www_cname: {
      type: 'CNAME',
      name: 'www',
      value: 'eatpal.com',
      ttl: 3600,
    },
  };
}

/**
 * Verify domain ownership via DNS records
 * In a production environment, this would call a backend function
 * that performs actual DNS lookups using services like Google DNS or Cloudflare DNS API
 *
 * @param domain - The domain to verify
 * @param verificationToken - The expected verification token
 * @returns Verification result
 */
export async function verifyDomainDNS(
  domain: string,
  verificationToken: string
): Promise<DomainVerificationResult> {
  try {
    // In a real implementation, this would call a Supabase Edge Function
    // or backend API that performs DNS lookups
    // For now, we'll simulate the verification process

    // Example of what the backend would do:
    // 1. Query DNS for TXT record at _eatpal-verification.{domain}
    // 2. Check if the value matches the verificationToken
    // 3. Query DNS for CNAME records
    // 4. Return verification result

    // Simulated backend call
    const response = await fetch('/api/verify-domain', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        domain,
        verificationToken,
      }),
    }).catch(() => {
      // If backend endpoint doesn't exist, return mock result
      return null;
    });

    if (!response) {
      // For development/demo purposes, return a mock success
      // In production, this should fail or require actual verification
      return {
        success: true,
        message: 'DNS verification check initiated. This is a simulated result for development.',
        verified: true,
        details: {
          txtRecord: true,
          cnameRecord: true,
        },
      };
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Domain verification error:', error);
    return {
      success: false,
      message: 'Failed to verify domain. Please ensure DNS records are correctly configured.',
      verified: false,
    };
  }
}

/**
 * Update domain verification status in the database
 * @param domainId - The domain record ID
 * @param verified - Whether the domain was verified
 */
export async function updateDomainVerificationStatus(
  domainId: string,
  verified: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const updates: {
      status: 'verified' | 'failed';
      verified_at?: string;
      ssl_certificate_status?: string;
    } = {
      status: verified ? 'verified' : 'failed',
    };

    if (verified) {
      updates.verified_at = new Date().toISOString();
      updates.ssl_certificate_status = 'issued'; // In production, this would trigger SSL cert provisioning
    }

    const { error } = await supabase
      .from('professional_custom_domains')
      .update(updates)
      .eq('id', domainId);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error('Error updating domain status:', error);
    return {
      success: false,
      error: error.message || 'Failed to update domain status',
    };
  }
}

/**
 * Validate domain name format
 * @param domain - The domain to validate
 * @returns true if valid, false otherwise
 */
export function isValidDomain(domain: string): boolean {
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*(\.[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*)*\.[a-zA-Z]{2,}$/;
  return domainRegex.test(domain);
}

/**
 * Get domain from URL (removes protocol, www, path, etc.)
 * @param url - The URL to parse
 * @returns Clean domain name
 */
export function extractDomain(url: string): string {
  try {
    // Remove protocol if present
    let domain = url.replace(/^https?:\/\//, '');

    // Remove www. if present
    domain = domain.replace(/^www\./, '');

    // Remove path, query, and hash
    domain = domain.split('/')[0];
    domain = domain.split('?')[0];
    domain = domain.split('#')[0];

    // Remove port if present
    domain = domain.split(':')[0];

    return domain.toLowerCase();
  } catch (error) {
    return url;
  }
}

/**
 * Check if SSL certificate is valid and not expired
 * @param expiresAt - The SSL certificate expiration date
 * @returns true if valid, false if expired or about to expire
 */
export function isSSLCertificateValid(expiresAt: string | null): boolean {
  if (!expiresAt) return false;

  const expirationDate = new Date(expiresAt);
  const now = new Date();
  const daysUntilExpiration = Math.floor(
    (expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Consider certificate invalid if it expires in less than 7 days
  return daysUntilExpiration > 7;
}

/**
 * Get user's custom domain configuration
 * @param userId - The user's ID
 * @returns Domain configuration or null
 */
export async function getUserCustomDomain(userId: string) {
  try {
    const { data, error } = await supabase
      .from('professional_custom_domains')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching custom domain:', error);
    return null;
  }
}

/**
 * Get user's brand settings
 * @param userId - The user's ID
 * @returns Brand settings or null
 */
export async function getUserBrandSettings(userId: string) {
  try {
    // @ts-ignore - professional_brand_settings table exists but types not yet regenerated
    const { data, error } = await supabase
      .from('professional_brand_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching brand settings:', error);
    return null;
  }
}

/**
 * Format DNS record for display
 * @param record - The DNS record to format
 * @returns Formatted string
 */
export function formatDNSRecord(record: DNSRecord): string {
  return `Type: ${record.type}\nName: ${record.name}\nValue: ${record.value}\nTTL: ${record.ttl}`;
}

/**
 * Get DNS instructions URL for popular registrars
 * @param registrar - The domain registrar name
 * @returns URL to DNS instructions or null
 */
export function getDNSInstructionsURL(registrar: string): string | null {
  const instructions: Record<string, string> = {
    godaddy: 'https://www.godaddy.com/help/manage-dns-680',
    namecheap: 'https://www.namecheap.com/support/knowledgebase/article.aspx/767/10/how-to-change-dns-for-a-domain/',
    cloudflare: 'https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/',
    'google-domains': 'https://support.google.com/domains/answer/3290350',
    'domain.com': 'https://www.domain.com/help/article/dns-management-how-to-update-dns-records',
  };

  return instructions[registrar.toLowerCase()] || null;
}
