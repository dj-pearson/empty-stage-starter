import { supabase } from "@/integrations/supabase/client";

export type EmailTriggerEvent =
  | 'lead_created'
  | 'trial_start'
  | 'trial_ending'
  | 'subscription_active'
  | 'subscription_canceled'
  | 'user_inactive'
  | 'payment_failed';

export interface EmailSequence {
  id: string;
  name: string;
  description?: string;
  trigger_event: string;
  trigger_conditions: Record<string, any>;
  is_active: boolean;
}

export interface EmailSequenceStep {
  id: string;
  sequence_id: string;
  step_order: number;
  delay_days: number;
  delay_hours: number;
  subject: string;
  html_body: string;
  text_body?: string;
}

/**
 * Manually trigger an email sequence for a user or lead
 */
export async function triggerEmailSequence(
  params: {
    userId?: string;
    leadId?: string;
    sequenceId?: string;
    triggerEvent?: EmailTriggerEvent;
    metadata?: Record<string, any>;
  }
): Promise<{ success: boolean; enrollment_id?: string; error?: string }> {
  try {
    // Note: enroll_in_email_sequence function exists but may not be in types yet
    // This is a database function call
    const { data, error } = await supabase.rpc('enroll_in_email_sequence' as any, {
      p_user_id: params.userId || null,
      p_lead_id: params.leadId || null,
      p_sequence_id: params.sequenceId || null,
      p_trigger_event: params.triggerEvent || null,
      p_trigger_conditions: params.metadata || {},
    });

    if (error) {
      console.error('Error triggering email sequence:', error);
      return { success: false, error: error.message };
    }

    return { success: true, enrollment_id: data as string || undefined };
  } catch (error: any) {
    console.error('Error in triggerEmailSequence:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Cancel an email sequence for a user
 */
export async function cancelEmailSequence(
  enrollmentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Note: user_email_sequences table doesn't exist in current schema
    // This would need to be created or use automation_email_queue
    console.warn('cancelEmailSequence: user_email_sequences table not available');
    return { success: false, error: 'Feature not available - table does not exist' };
  } catch (error: any) {
    console.error('Error in cancelEmailSequence:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get active email sequences for a user
 */
export async function getUserEmailSequences(
  userId: string
): Promise<{ sequences: any[]; error?: string }> {
  try {
    // Note: user_email_sequences table doesn't exist in current schema
    console.warn('getUserEmailSequences: user_email_sequences table not available');
    return { sequences: [], error: 'Feature not available - table does not exist' };
  } catch (error: any) {
    console.error('Error in getUserEmailSequences:', error);
    return { sequences: [], error: error.message };
  }
}

/**
 * Schedule a one-off email (not part of a sequence)
 */
export async function scheduleEmail(params: {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  sendAt?: Date;
  priority?: number;
  metadata?: Record<string, any>;
}): Promise<{ success: boolean; email_id?: string; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('automation_email_queue')
      .insert([{
        to_email: params.to,
        subject: params.subject,
        html_body: params.htmlBody,
        text_body: params.textBody || null,
        scheduled_for: params.sendAt?.toISOString() || new Date().toISOString(),
        priority: params.priority || 5,
        status: 'pending',
        template_key: 'custom',
        user_id: null,
      }])
      .select('id')
      .single();

    if (error) {
      console.error('Error scheduling email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, email_id: data.id };
  } catch (error: any) {
    console.error('Error in scheduleEmail:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Track email event (open, click, bounce, etc.)
 */
export async function trackEmailEvent(
  emailId: string,
  eventType: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained',
  eventData?: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('automation_email_events')
      .insert([{
        email_id: emailId,
        event_type: eventType,
        event_data: eventData || {},
      }]);

    if (error) {
      console.error('Error tracking email event:', error);
      return { success: false, error: error.message };
    }

    // Update email status if delivered/bounced
    if (eventType === 'delivered' || eventType === 'bounced') {
      await supabase
        .from('automation_email_queue')
        .update({
          status: eventType === 'delivered' ? 'sent' : 'failed',
          sent_at: eventType === 'delivered' ? new Date().toISOString() : null,
        })
        .eq('id', emailId);
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error in trackEmailEvent:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get email templates
 */
export async function getEmailTemplates(): Promise<{
  templates: any[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('automation_email_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error getting email templates:', error);
      return { templates: [], error: error.message };
    }

    return { templates: data || [] };
  } catch (error: any) {
    console.error('Error in getEmailTemplates:', error);
    return { templates: [], error: error.message };
  }
}

/**
 * Create an email template
 */
export async function createEmailTemplate(params: {
  name: string;
  description?: string;
  subject_template: string;
  html_template: string;
  text_template?: string;
  category?: string;
  variables?: string[];
}): Promise<{ success: boolean; template_id?: string; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('automation_email_templates')
      .insert([{
        template_name: params.name,
        template_key: params.name.toLowerCase().replace(/\s+/g, '_'),
        subject: params.subject_template,
        html_body: params.html_template,
        text_body: params.text_template || null,
        category: params.category || 'general',
        variables: params.variables || {},
      }])
      .select('id')
      .single();

    if (error) {
      console.error('Error creating email template:', error);
      return { success: false, error: error.message };
    }

    return { success: true, template_id: data.id };
  } catch (error: any) {
    console.error('Error in createEmailTemplate:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get email performance metrics
 */
export async function getEmailMetrics(params?: {
  campaignId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}): Promise<{
  metrics: {
    total_sent: number;
    total_delivered: number;
    total_opened: number;
    total_clicked: number;
    total_bounced: number;
    open_rate: number;
    click_rate: number;
    bounce_rate: number;
  };
  error?: string;
}> {
  try {
    // This would need a custom RPC function for optimal performance
    // For now, we'll do basic client-side aggregation

    let query = supabase
      .from('automation_email_queue')
      .select('id, status, sent_at');

    if (params?.dateFrom) {
      query = query.gte('created_at', params.dateFrom.toISOString());
    }
    if (params?.dateTo) {
      query = query.lte('created_at', params.dateTo.toISOString());
    }

    const { data: emails, error } = await query;

    if (error) {
      console.error('Error getting email metrics:', error);
      return {
        metrics: {
          total_sent: 0,
          total_delivered: 0,
          total_opened: 0,
          total_clicked: 0,
          total_bounced: 0,
          open_rate: 0,
          click_rate: 0,
          bounce_rate: 0,
        },
        error: error.message,
      };
    }

    const emailIds = emails?.map(e => e.id) || [];

    // Get events
    const { data: events } = await supabase
      .from('automation_email_events')
      .select('email_id, event_type')
      .in('email_id', emailIds);

    const total_sent = emails?.filter(e => e.status === 'sent').length || 0;
    const total_opened = new Set(events?.filter(e => e.event_type === 'opened').map(e => e.email_id)).size;
    const total_clicked = new Set(events?.filter(e => e.event_type === 'clicked').map(e => e.email_id)).size;
    const total_bounced = events?.filter(e => e.event_type === 'bounced').length || 0;

    return {
      metrics: {
        total_sent,
        total_delivered: total_sent - total_bounced,
        total_opened,
        total_clicked,
        total_bounced,
        open_rate: total_sent > 0 ? (total_opened / total_sent) * 100 : 0,
        click_rate: total_sent > 0 ? (total_clicked / total_sent) * 100 : 0,
        bounce_rate: total_sent > 0 ? (total_bounced / total_sent) * 100 : 0,
      },
    };
  } catch (error: any) {
    console.error('Error in getEmailMetrics:', error);
    return {
      metrics: {
        total_sent: 0,
        total_delivered: 0,
        total_opened: 0,
        total_clicked: 0,
        total_bounced: 0,
        open_rate: 0,
        click_rate: 0,
        bounce_rate: 0,
      },
      error: error.message,
    };
  }
}

/**
 * Helper to replace variables in email templates
 */
export function replaceEmailVariables(
  template: string,
  variables: Record<string, any>
): string {
  let result = template;

  Object.keys(variables).forEach(key => {
    const placeholder = `{{${key}}}`;
    const value = variables[key] || '';
    result = result.replace(new RegExp(placeholder, 'g'), value);
  });

  return result;
}
