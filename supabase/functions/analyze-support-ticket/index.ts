import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AIServiceV2 } from '../_shared/ai-service-v2.ts';
import { requireAdmin } from '../_shared/require-admin.ts';
import { meterAdminRequest, rejectNonPost } from '../_shared/ai-gate.ts';
import { publicMessage } from '../_shared/errors.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TicketAnalysisRequest {
  ticketId: string;
  autoResolve?: boolean; // If true and confidence is high, auto-resolve the ticket
}

interface AIAnalysisResult {
  issueType: string;
  issueConfidence: number;
  affectedFeature: string;
  autoResolvable: boolean;
  autoResolutionConfidence: number;
  suggestedResponse: string;
  sentiment: 'positive' | 'neutral' | 'negative' | 'frustrated';
  sentimentScore: number;
  urgencyScore: number;
  reasoning: string;
}

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const notPost = rejectNonPost(req, corsHeaders);
  if (notPost) return notPost;

  /*
    US-870: this said "Verify admin user" and did not.
    
    It read the caller's row from user_roles into `isAdmin` and then never
    denied on it -- the only thing that flag gated was the auto-resolve WRITE
    further down. So any signed-in account could name any ticket id and have a
    service-role client read it (past RLS) and spend model tokens summarising
    it. The sole caller is src/components/admin/AITicketAnalysis.tsx, an admin
    screen, so requiring the role breaks nothing; requireAdmin also accepts the
    service key, which is what the "auto-analysis on ticket creation" comment
    was reaching for.
  */
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return new Response(
      JSON.stringify({ error: gate.error ?? 'Unauthorized' }),
      { status: gate.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const limited = await meterAdminRequest(gate, 'analyze-support-ticket', corsHeaders);
  if (limited) return limited;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestData: TicketAnalysisRequest = await req.json();
    const { ticketId, autoResolve = false } = requestData;

    if (!ticketId) {
      return new Response(
        JSON.stringify({ error: 'ticketId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch ticket details
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticket) {
      return new Response(
        JSON.stringify({ error: 'Ticket not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Gather user context
    const { data: userContext } = await supabase
      .rpc('gather_ticket_user_context', { p_user_id: ticket.user_id });

    // Find similar tickets
    const { data: similarTickets } = await supabase
      .rpc('find_similar_tickets', { p_ticket_id: ticketId, p_limit: 5 });

    // Perform AI analysis
    const analysis = await analyzeTicketWithAI(ticket, userContext, similarTickets);

    // Store analysis in database
    const { error: insertError } = await supabase
      .from('support_ticket_ai_analysis')
      .upsert({
        ticket_id: ticketId,
        issue_type: analysis.issueType,
        issue_confidence: analysis.issueConfidence,
        affected_feature: analysis.affectedFeature,
        auto_resolvable: analysis.autoResolvable,
        auto_resolution_confidence: analysis.autoResolutionConfidence,
        suggested_response: analysis.suggestedResponse,
        similar_ticket_ids: similarTickets?.map((t: Record<string, unknown>) => t.similar_ticket_id) || [],
        similarity_scores: similarTickets?.map((t: Record<string, unknown>) => t.similarity_score) || [],
        auto_gathered_context: userContext || {},
        sentiment: analysis.sentiment,
        sentiment_score: analysis.sentimentScore,
        urgency_score: analysis.urgencyScore,
        analyzed_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('Error storing analysis:', insertError);
      throw insertError;
    }

    // Auto-resolve if conditions are met
    // `isAdmin` used to guard this line and nothing else; the gate at the top
    // of the handler now guarantees it, so the flag is gone rather than left
    // as a condition that is always true.
    if (autoResolve && analysis.autoResolvable && analysis.autoResolutionConfidence >= 0.85) {
      // Update ticket status
      await supabase
        .from('support_tickets')
        .update({
          status: 'resolved',
          updated_at: new Date().toISOString(),
        })
        .eq('id', ticketId);

      // Add a message with the auto-resolution
      await supabase
        .from('ticket_messages')
        .insert({
          ticket_id: ticketId,
          user_id: null, // System message
          message: analysis.suggestedResponse,
          is_staff_reply: true,
          metadata: {
            auto_resolved: true,
            ai_confidence: analysis.autoResolutionConfidence,
          },
        });

      return new Response(
        JSON.stringify({
          success: true,
          analysis,
          autoResolved: true,
          message: 'Ticket analyzed and auto-resolved',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        analysis,
        autoResolved: false,
        message: 'Ticket analyzed successfully',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in analyze-support-ticket function:', error);
    return new Response(
      JSON.stringify({ error: publicMessage(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

async function analyzeTicketWithAI(
  ticket: Record<string, unknown>,
  userContext: Record<string, unknown>,
  similarTickets: Record<string, unknown>[]
): Promise<AIAnalysisResult> {
  const aiService = new AIServiceV2();

  const systemPrompt = `You are an expert support ticket analyzer. Analyze the support ticket and provide structured output.

Your analysis should include:
1. Issue classification (billing, bug, feature_request, question, account, technical)
2. Confidence level (0-1)
3. Affected feature
4. Whether this is auto-resolvable with high confidence
5. Suggested response (if auto-resolvable)
6. Sentiment analysis
7. Urgency scoring (0-100)

Consider the user context and similar past tickets when generating your response.`;

  const userPrompt = `Analyze this support ticket:

**Ticket Details:**
- Subject: ${ticket.subject}
- Description: ${ticket.description}
- Category: ${ticket.category}
- Priority: ${ticket.priority}

**User Context:**
- Subscription Status: ${userContext?.subscription_status || 'None'}
- User Tier: ${userContext?.user_tier || 'Unknown'}
- Health Score: ${userContext?.health_score || 'Unknown'}
- Recent Errors: ${JSON.stringify(userContext?.recent_errors || [])}
- Account Age: ${userContext?.account_age_days || 'Unknown'} days

**Similar Resolved Tickets:**
${similarTickets?.map((t: Record<string, unknown>, i: number) => `
${i + 1}. Resolution: ${t.resolution_summary}
   Time to resolve: ${t.resolution_time_hours?.toFixed(1)} hours
   Similarity: ${(t.similarity_score * 100).toFixed(0)}%
`).join('\n') || 'None found'}

Provide your analysis in JSON format:
{
  "issueType": "billing|bug|feature_request|question|account|technical",
  "issueConfidence": 0.0-1.0,
  "affectedFeature": "feature name",
  "autoResolvable": true|false,
  "autoResolutionConfidence": 0.0-1.0,
  "suggestedResponse": "Full response text if auto-resolvable, otherwise brief suggestion",
  "sentiment": "positive|neutral|negative|frustrated",
  "sentimentScore": 0.0-1.0,
  "urgencyScore": 0-100,
  "reasoning": "Brief explanation of your analysis"
}`;

  try {
    const content = await aiService.generateContent(userPrompt, {
      systemPrompt,
      taskType: 'standard', // Support ticket analysis is complex
      temperature: 0.3,
    });

    const analysis = JSON.parse(content);

    return {
      issueType: analysis.issueType || 'question',
      issueConfidence: analysis.issueConfidence || 0.5,
      affectedFeature: analysis.affectedFeature || 'unknown',
      autoResolvable: analysis.autoResolvable || false,
      autoResolutionConfidence: analysis.autoResolutionConfidence || 0.0,
      suggestedResponse: analysis.suggestedResponse || '',
      sentiment: analysis.sentiment || 'neutral',
      sentimentScore: analysis.sentimentScore || 0.5,
      urgencyScore: analysis.urgencyScore || 50,
      reasoning: analysis.reasoning || '',
    };
  } catch (error) {
    console.error('Error calling OpenAI:', error);
    return ruleBasedAnalysis(ticket, userContext);
  }
}

function ruleBasedAnalysis(ticket: Record<string, unknown>, userContext: Record<string, unknown>): AIAnalysisResult {
  const subject = ticket.subject?.toLowerCase() || '';
  const description = ticket.description?.toLowerCase() || '';
  const combined = `${subject} ${description}`;

  // Determine issue type
  let issueType = 'question';
  let issueConfidence = 0.6;
  let affectedFeature = 'general';

  if (combined.includes('password') || combined.includes('login') || combined.includes('sign in')) {
    issueType = 'account';
    issueConfidence = 0.85;
    affectedFeature = 'authentication';
  } else if (combined.includes('payment') || combined.includes('billing') || combined.includes('subscription') || combined.includes('invoice')) {
    issueType = 'billing';
    issueConfidence = 0.85;
    affectedFeature = 'subscription';
  } else if (combined.includes('bug') || combined.includes('error') || combined.includes('broken') || combined.includes('not working')) {
    issueType = 'bug';
    issueConfidence = 0.75;
    affectedFeature = 'unknown';
  } else if (combined.includes('feature') || combined.includes('request') || combined.includes('suggestion') || combined.includes('add')) {
    issueType = 'feature_request';
    issueConfidence = 0.7;
    affectedFeature = 'product';
  }

  // Determine if auto-resolvable
  let autoResolvable = false;
  let autoResolutionConfidence = 0.0;
  let suggestedResponse = '';

  if (issueType === 'account' && combined.includes('password')) {
    autoResolvable = true;
    autoResolutionConfidence = 0.9;
    suggestedResponse = `Hi there,

I can help you reset your password. I've sent a password reset link to your email address.

Please check your inbox and spam folder. The link will expire in 1 hour.

If you don't receive it within a few minutes, please let me know and I'll resend it.

Best regards,
Support Team`;
  }

  // Sentiment analysis
  let sentiment: 'positive' | 'neutral' | 'negative' | 'frustrated' = 'neutral';
  let sentimentScore = 0.5;

  if (combined.includes('urgent') || combined.includes('asap') || combined.includes('immediately') || combined.includes('critical')) {
    sentiment = 'frustrated';
    sentimentScore = 0.2;
  } else if (combined.includes('thank') || combined.includes('appreciate') || combined.includes('great')) {
    sentiment = 'positive';
    sentimentScore = 0.8;
  } else if (combined.includes('frustrated') || combined.includes('disappointed') || combined.includes('angry')) {
    sentiment = 'negative';
    sentimentScore = 0.3;
  }

  // Urgency scoring
  let urgencyScore = 50;
  if (ticket.priority === 'urgent') urgencyScore = 95;
  else if (ticket.priority === 'high') urgencyScore = 75;
  else if (ticket.priority === 'medium') urgencyScore = 50;
  else if (ticket.priority === 'low') urgencyScore = 25;

  if (sentiment === 'frustrated') urgencyScore += 15;
  if (userContext?.subscription_status === 'past_due') urgencyScore += 10;

  urgencyScore = Math.min(100, urgencyScore);

  return {
    issueType,
    issueConfidence,
    affectedFeature,
    autoResolvable,
    autoResolutionConfidence,
    suggestedResponse,
    sentiment,
    sentimentScore,
    urgencyScore,
    reasoning: 'Rule-based analysis (AI unavailable)',
  };
}
