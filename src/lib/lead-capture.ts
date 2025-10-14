import { supabase } from "@/integrations/supabase/client";

export interface LeadCaptureData {
  email: string;
  full_name?: string;
  phone?: string;
  source: 'landing_page' | 'signup_form' | 'trial_signup' | 'newsletter' | 'contact_form' | 'referral' | 'social_media' | 'organic_search' | 'paid_ad' | 'other';
  campaign_id?: string;
  notes?: string;
  metadata?: Record<string, any>;
  subject?: string; // For contact forms
}

export interface LeadCaptureResult {
  success: boolean;
  lead_id?: string;
  error?: string;
}

/**
 * Captures a lead from any source and stores in the database
 * Automatically:
 * - Creates lead record
 * - Logs interaction
 * - Queues welcome email
 * - Calculates initial lead score
 */
export async function captureLeadWithAutomation(
  data: LeadCaptureData
): Promise<LeadCaptureResult> {
  try {
    // Check if lead already exists by email
    const { data: existingLead, error: checkError } = await supabase
      .from('leads')
      .select('id, email, status')
      .eq('email', data.email)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking existing lead:', checkError);
    }

    let leadId: string;

    if (existingLead) {
      // Lead exists, update their information and add new interaction
      leadId = existingLead.id;

      const updateData: any = {
        updated_at: new Date().toISOString(),
        last_contacted_at: new Date().toISOString(),
      };

      // Update name if provided and not already set
      if (data.full_name) {
        updateData.full_name = data.full_name;
      }

      // Update phone if provided and not already set
      if (data.phone) {
        updateData.phone = data.phone;
      }

      // Append new notes if provided
      if (data.notes) {
        const { data: currentLead } = await supabase
          .from('leads')
          .select('notes')
          .eq('id', leadId)
          .single();

        if (currentLead?.notes) {
          updateData.notes = `${currentLead.notes}\n\n[${new Date().toISOString()}] ${data.notes}`;
        } else {
          updateData.notes = data.notes;
        }
      }

      // Merge metadata
      if (data.metadata) {
        const { data: currentLead } = await supabase
          .from('leads')
          .select('metadata')
          .eq('id', leadId)
          .single();

        updateData.metadata = {
          ...(currentLead?.metadata || {}),
          ...data.metadata,
          last_source: data.source,
          last_contact_date: new Date().toISOString(),
        };
      }

      const { error: updateError } = await supabase
        .from('leads')
        .update(updateData)
        .eq('id', leadId);

      if (updateError) {
        console.error('Error updating lead:', updateError);
        return { success: false, error: updateError.message };
      }
    } else {
      // Create new lead
      const leadData: any = {
        email: data.email,
        full_name: data.full_name || null,
        phone: data.phone || null,
        source: data.source,
        campaign_id: data.campaign_id || null,
        status: 'new',
        notes: data.notes || null,
        metadata: {
          ...(data.metadata || {}),
          created_source: data.source,
          created_date: new Date().toISOString(),
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        },
        created_at: new Date().toISOString(),
        last_contacted_at: new Date().toISOString(),
      };

      const { data: newLead, error: insertError } = await supabase
        .from('leads')
        .insert([leadData])
        .select('id')
        .single();

      if (insertError) {
        console.error('Error creating lead:', insertError);
        return { success: false, error: insertError.message };
      }

      leadId = newLead.id;
    }

    // Create lead interaction record
    const interactionData: any = {
      lead_id: leadId,
      interaction_type: data.source === 'contact_form' ? 'form_submission' : 'lead_capture',
      subject: data.subject || `Lead captured via ${data.source}`,
      description: data.notes || null,
      metadata: {
        source: data.source,
        ...(data.metadata || {}),
      },
      created_at: new Date().toISOString(),
    };

    const { error: interactionError } = await supabase
      .from('lead_interactions')
      .insert([interactionData]);

    if (interactionError) {
      console.error('Error creating lead interaction:', interactionError);
      // Don't fail the entire operation for interaction logging
    }

    // Queue welcome email based on source
    await queueWelcomeEmail(data.email, data.full_name, data.source);

    // Trigger lead score calculation (will happen automatically via database trigger)
    // But we can also update it explicitly to ensure it runs
    const { error: scoreError } = await supabase
      .from('leads')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', leadId);

    if (scoreError) {
      console.error('Error triggering score update:', scoreError);
    }

    return {
      success: true,
      lead_id: leadId,
    };
  } catch (error: any) {
    console.error('Error in captureLeadWithAutomation:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred',
    };
  }
}

/**
 * Queue a welcome email based on the lead source
 */
async function queueWelcomeEmail(
  email: string,
  name: string | undefined,
  source: string
): Promise<void> {
  try {
    // Determine which email template to use based on source
    let subject = '';
    let htmlBody = '';
    let textBody = '';

    const firstName = name?.split(' ')[0] || 'there';

    if (source === 'contact_form') {
      subject = `Thanks for reaching out, ${firstName}!`;
      htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981;">Thanks for contacting EatPal!</h2>
          <p>Hi ${firstName},</p>
          <p>We received your message and our team will get back to you within 24-48 hours.</p>
          <p>In the meantime, did you know you can start using EatPal right away with a free trial?</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${window.location.origin}/auth"
               style="background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Start Free Trial
            </a>
          </div>
          <p>EatPal helps families with picky eaters by providing personalized meal planning, food tracking, and progress monitoring.</p>
          <p>Best regards,<br>The EatPal Team</p>
        </div>
      `;
      textBody = `Hi ${firstName},\n\nWe received your message and our team will get back to you within 24-48 hours.\n\nIn the meantime, you can start using EatPal with a free trial at ${window.location.origin}/auth\n\nBest regards,\nThe EatPal Team`;
    } else if (source === 'newsletter') {
      subject = `Welcome to the EatPal community, ${firstName}!`;
      htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981;">Welcome to EatPal!</h2>
          <p>Hi ${firstName},</p>
          <p>Thanks for subscribing to our newsletter. You'll receive tips, recipes, and updates about helping picky eaters.</p>
          <p>Want to dive deeper? Start your free trial today!</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${window.location.origin}/auth"
               style="background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Try EatPal Free
            </a>
          </div>
          <p>Best regards,<br>The EatPal Team</p>
        </div>
      `;
      textBody = `Hi ${firstName},\n\nThanks for subscribing to our newsletter. You'll receive tips and updates about helping picky eaters.\n\nStart your free trial: ${window.location.origin}/auth\n\nBest regards,\nThe EatPal Team`;
    } else {
      // Generic welcome for other sources
      subject = `Welcome to EatPal, ${firstName}!`;
      htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981;">Thanks for your interest in EatPal!</h2>
          <p>Hi ${firstName},</p>
          <p>We're excited to help you and your family with meal planning for picky eaters.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${window.location.origin}/auth"
               style="background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Get Started
            </a>
          </div>
          <p>Best regards,<br>The EatPal Team</p>
        </div>
      `;
      textBody = `Hi ${firstName},\n\nThanks for your interest in EatPal!\n\nGet started: ${window.location.origin}/auth\n\nBest regards,\nThe EatPal Team`;
    }

    // Insert into email queue
    const { error } = await supabase
      .from('email_queue')
      .insert([{
        to_email: email,
        subject: subject,
        html_body: htmlBody,
        text_body: textBody,
        status: 'pending',
        scheduled_for: new Date().toISOString(),
        priority: source === 'contact_form' ? 10 : 5,
        max_retries: 3,
        retry_count: 0,
      }]);

    if (error) {
      console.error('Error queueing welcome email:', error);
    }
  } catch (error) {
    console.error('Error in queueWelcomeEmail:', error);
  }
}

/**
 * Capture UTM parameters from URL
 */
export function captureUTMParams(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  const params = new URLSearchParams(window.location.search);
  const utmParams: Record<string, string> = {};

  const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  utmKeys.forEach(key => {
    const value = params.get(key);
    if (value) {
      utmParams[key] = value;
    }
  });

  // Also capture referrer
  if (document.referrer) {
    utmParams.referrer = document.referrer;
  }

  return utmParams;
}

/**
 * Find or create campaign from UTM parameters
 */
export async function findOrCreateCampaignFromUTM(
  utmParams: Record<string, string>
): Promise<string | null> {
  if (!utmParams.utm_campaign && !utmParams.utm_source) {
    return null;
  }

  try {
    // Try to find existing campaign
    let query = supabase
      .from('campaigns')
      .select('id')
      .eq('is_active', true);

    if (utmParams.utm_campaign) {
      query = query.eq('utm_campaign', utmParams.utm_campaign);
    }
    if (utmParams.utm_source) {
      query = query.eq('utm_source', utmParams.utm_source);
    }

    const { data: existingCampaign } = await query.maybeSingle();

    if (existingCampaign) {
      return existingCampaign.id;
    }

    // Create new campaign if it doesn't exist
    const campaignName = utmParams.utm_campaign || `${utmParams.utm_source}_campaign`;
    const { data: newCampaign, error } = await supabase
      .from('campaigns')
      .insert([{
        name: campaignName,
        description: `Auto-created from UTM parameters`,
        source: utmParams.utm_source === 'google' ? 'organic_search' as const :
                utmParams.utm_source === 'facebook' ? 'social_media' as const :
                'other' as const,
        utm_campaign: utmParams.utm_campaign || null,
        utm_source: utmParams.utm_source || null,
        utm_medium: utmParams.utm_medium || null,
        utm_content: utmParams.utm_content || null,
        is_active: true,
      }])
      .select('id')
      .single();

    if (error) {
      console.error('Error creating campaign:', error);
      return null;
    }

    return newCampaign.id;
  } catch (error) {
    console.error('Error in findOrCreateCampaignFromUTM:', error);
    return null;
  }
}

/**
 * Helper to capture a contact form submission
 */
export async function captureContactFormLead(
  name: string,
  email: string,
  subject: string,
  message: string
): Promise<LeadCaptureResult> {
  const utmParams = captureUTMParams();
  const campaignId = await findOrCreateCampaignFromUTM(utmParams);

  return captureLeadWithAutomation({
    email,
    full_name: name,
    source: 'contact_form',
    campaign_id: campaignId || undefined,
    subject,
    notes: `Contact Form Message:\n${message}`,
    metadata: {
      ...utmParams,
      form_type: 'contact_us',
      page_url: window.location.href,
    },
  });
}

/**
 * Helper to capture a newsletter signup
 */
export async function captureNewsletterLead(
  email: string,
  name?: string
): Promise<LeadCaptureResult> {
  const utmParams = captureUTMParams();
  const campaignId = await findOrCreateCampaignFromUTM(utmParams);

  return captureLeadWithAutomation({
    email,
    full_name: name,
    source: 'newsletter',
    campaign_id: campaignId || undefined,
    metadata: {
      ...utmParams,
      form_type: 'newsletter_signup',
      page_url: window.location.href,
    },
  });
}

/**
 * Helper to capture a trial signup as a lead conversion
 */
export async function captureTrialSignup(
  userId: string,
  email: string,
  name?: string
): Promise<LeadCaptureResult> {
  const utmParams = captureUTMParams();
  const campaignId = await findOrCreateCampaignFromUTM(utmParams);

  // Check if lead exists and mark as converted
  const { data: existingLead } = await supabase
    .from('leads')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existingLead) {
    // Update existing lead to mark as trial started
    await supabase
      .from('leads')
      .update({
        status: 'qualified',
        converted_user_id: userId,
        metadata: {
          trial_started: true,
          trial_start_date: new Date().toISOString(),
        },
      })
      .eq('id', existingLead.id);

    return { success: true, lead_id: existingLead.id };
  }

  // Create new lead if doesn't exist
  return captureLeadWithAutomation({
    email,
    full_name: name,
    source: 'trial_signup',
    campaign_id: campaignId || undefined,
    metadata: {
      ...utmParams,
      trial_started: true,
      trial_start_date: new Date().toISOString(),
      user_id: userId,
    },
  });
}
