import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AIServiceV2 } from '../_shared/ai-service-v2.ts';
import { requireAdmin } from '../_shared/require-admin.ts';
import { meterAdminRequest, rejectNonPost } from '../_shared/ai-gate.ts';
import { publicMessage } from '../_shared/errors.ts';
import {
  type AIAnalysisResult,
  buildTicketAnalysisRequest,
  parseTicketAnalysis,
  ruleBasedAnalysis,
} from '../_shared/ticketAnalysis.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TicketAnalysisRequest {
  ticketId: string;
  autoResolve?: boolean; // If true and confidence is high, auto-resolve the ticket
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
  userContext: Record<string, unknown> | null,
  similarTickets: Record<string, unknown>[] | null
): Promise<AIAnalysisResult> {
  try {
    const aiService = new AIServiceV2();
    // Support ticket analysis is complex: standard model, not lightweight.
    const response = await aiService.generateContent(
      buildTicketAnalysisRequest(ticket, userContext, similarTickets),
      'standard'
    );

    const analysis = parseTicketAnalysis(response?.content);
    if (analysis) return analysis;

    console.error('AI ticket analysis returned no usable JSON; using rule-based analysis');
  } catch (error) {
    console.error('AI ticket analysis failed; using rule-based analysis:', error);
  }
  return ruleBasedAnalysis(ticket, userContext);
}
