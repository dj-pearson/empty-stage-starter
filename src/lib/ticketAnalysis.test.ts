// @vitest-environment node
// Vitest coverage for supabase/functions/_shared/ticketAnalysis.ts, the request
// builder and response parser analyze-support-ticket hands to AIServiceV2.
import { describe, expect, it } from 'vitest';
import {
  buildTicketAnalysisRequest,
  parseTicketAnalysis,
  ruleBasedAnalysis,
  TICKET_ANALYSIS_SYSTEM_PROMPT,
} from '../../supabase/functions/_shared/ticketAnalysis';

const ticket = {
  subject: 'Cannot log in',
  description: 'I forgot my password',
  category: 'account',
  priority: 'high',
};

const validJson = JSON.stringify({
  issueType: 'account',
  issueConfidence: 0.92,
  affectedFeature: 'authentication',
  autoResolvable: true,
  autoResolutionConfidence: 0.9,
  suggestedResponse: 'Reset link sent.',
  sentiment: 'negative',
  sentimentScore: 0.3,
  urgencyScore: 70,
  reasoning: 'Password reset request',
});

describe('buildTicketAnalysisRequest', () => {
  it('builds the AIRequest shape generateContent takes: messages, not a bare prompt', () => {
    const req = buildTicketAnalysisRequest(ticket, { subscription_status: 'active' }, [
      { resolution_summary: 'Sent reset link', resolution_time_hours: 1.26, similarity_score: 0.83 },
    ]);
    expect(req.temperature).toBe(0.3);
    expect(req.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(req.messages[0].content).toBe(TICKET_ANALYSIS_SYSTEM_PROMPT);
    const user = req.messages[1].content;
    expect(user).toContain('- Subject: Cannot log in');
    expect(user).toContain('- Subscription Status: active');
    expect(user).toContain('Time to resolve: 1.3 hours');
    expect(user).toContain('Similarity: 83%');
  });

  it('survives missing context and similar tickets, and non-numeric scores', () => {
    const empty = buildTicketAnalysisRequest(ticket, null, null).messages[1].content;
    expect(empty).toContain('- Subscription Status: None');
    expect(empty).toContain('None found');

    const odd = buildTicketAnalysisRequest(ticket, {}, [{ resolution_summary: 'x' }]).messages[1].content;
    expect(odd).toContain('Time to resolve: unknown hours');
  });
});

describe('parseTicketAnalysis', () => {
  it('reads plain JSON content', () => {
    const a = parseTicketAnalysis(validJson);
    expect(a).toMatchObject({ issueType: 'account', autoResolvable: true, autoResolutionConfidence: 0.9, urgencyScore: 70 });
  });

  it('reads JSON inside a ```json fence with prose around it', () => {
    const a = parseTicketAnalysis(`Here is my analysis:\n\`\`\`json\n${validJson}\n\`\`\`\nHope that helps.`);
    expect(a?.sentiment).toBe('negative');
  });

  it('returns null for non-JSON, empty, or non-string content so the caller falls back', () => {
    expect(parseTicketAnalysis('Sorry, I cannot help with that.')).toBeNull();
    expect(parseTicketAnalysis('{ not json }')).toBeNull();
    expect(parseTicketAnalysis('')).toBeNull();
    expect(parseTicketAnalysis(undefined)).toBeNull();
    expect(parseTicketAnalysis({ content: validJson })).toBeNull();
  });

  it('does not let a malformed answer clear the 0.85 auto-resolve bar', () => {
    const a = parseTicketAnalysis(
      JSON.stringify({ autoResolvable: 'false', autoResolutionConfidence: 85, urgencyScore: 400, sentiment: 'furious' }),
    );
    expect(a?.autoResolvable).toBe(false);
    expect(a?.autoResolutionConfidence).toBe(1);
    expect(a?.urgencyScore).toBe(100);
    expect(a?.sentiment).toBe('neutral');
  });

  it('keeps a legitimate zero instead of replacing it with the default', () => {
    const a = parseTicketAnalysis(JSON.stringify({ issueConfidence: 0, sentimentScore: 0 }));
    expect(a?.issueConfidence).toBe(0);
    expect(a?.sentimentScore).toBe(0);
    expect(a?.issueType).toBe('question');
  });
});

describe('ruleBasedAnalysis', () => {
  it('classifies a password ticket as auto-resolvable account issue', () => {
    const a = ruleBasedAnalysis(ticket, null);
    expect(a.issueType).toBe('account');
    expect(a.autoResolvable).toBe(true);
    expect(a.urgencyScore).toBe(75);
    expect(a.reasoning).toBe('Rule-based analysis (AI unavailable)');
  });

  it('tolerates a ticket with no text fields', () => {
    expect(ruleBasedAnalysis({}, { subscription_status: 'past_due' }).urgencyScore).toBe(60);
  });
});
