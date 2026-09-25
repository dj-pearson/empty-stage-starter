/**
 * Prompt building and response parsing for analyze-support-ticket.
 *
 * Pure: no Deno globals, no network, no imports, so it runs under Deno in the
 * function and under Vitest in src/lib/ticketAnalysis.test.ts.
 *
 * The function used to call AIServiceV2.generateContent(prompt, { systemPrompt,
 * taskType, temperature }) and JSON.parse the result. generateContent takes an
 * AIRequest ({ messages, temperature, ... }) plus a taskType and resolves to an
 * AIResponse ({ content, model, usage }), so the request had no messages, every
 * retry threw, and each ticket fell through to the rule-based fallback after the
 * retry backoff. buildTicketAnalysisRequest returns the real request shape and
 * parseTicketAnalysis reads AIResponse.content.
 */

export type TicketSentiment = 'positive' | 'neutral' | 'negative' | 'frustrated';

export interface AIAnalysisResult {
  issueType: string;
  issueConfidence: number;
  affectedFeature: string;
  autoResolvable: boolean;
  autoResolutionConfidence: number;
  suggestedResponse: string;
  sentiment: TicketSentiment;
  sentimentScore: number;
  urgencyScore: number;
  reasoning: string;
}

/** Structurally the AIRequest AIServiceV2.generateContent takes. */
export interface TicketAIRequest {
  messages: { role: 'system' | 'user'; content: string }[];
  temperature: number;
}

type Row = Record<string, unknown>;

const SENTIMENTS: readonly TicketSentiment[] = ['positive', 'neutral', 'negative', 'frustrated'];

export const TICKET_ANALYSIS_SYSTEM_PROMPT = `You are an expert support ticket analyzer. Analyze the support ticket and provide structured output.

Your analysis should include:
1. Issue classification (billing, bug, feature_request, question, account, technical)
2. Confidence level (0-1)
3. Affected feature
4. Whether this is auto-resolvable with high confidence
5. Suggested response (if auto-resolvable)
6. Sentiment analysis
7. Urgency scoring (0-100)

Consider the user context and similar past tickets when generating your response.`;

function fixed(value: unknown, digits: number, scale = 1): string {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? (n * scale).toFixed(digits) : 'unknown';
}

export function buildTicketAnalysisUserPrompt(
  ticket: Row,
  userContext: Row | null | undefined,
  similarTickets: Row[] | null | undefined,
): string {
  const similar = (similarTickets ?? [])
    .map(
      (t, i) => `
${i + 1}. Resolution: ${t.resolution_summary}
   Time to resolve: ${fixed(t.resolution_time_hours, 1)} hours
   Similarity: ${fixed(t.similarity_score, 0, 100)}%
`,
    )
    .join('\n');

  return `Analyze this support ticket:

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
${similar || 'None found'}

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
}

export function buildTicketAnalysisRequest(
  ticket: Row,
  userContext: Row | null | undefined,
  similarTickets: Row[] | null | undefined,
): TicketAIRequest {
  return {
    messages: [
      { role: 'system', content: TICKET_ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: buildTicketAnalysisUserPrompt(ticket, userContext, similarTickets) },
    ],
    temperature: 0.3,
  };
}

/** The first JSON object in the model's text, tolerating ```json fences and prose around it. */
function extractJsonObject(text: string): Row | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(body.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Row) : null;
  } catch {
    return null;
  }
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

/**
 * Read AIResponse.content into an AIAnalysisResult, or null when there is no
 * usable JSON object in it (the caller falls back to rule-based analysis).
 *
 * Confidences are clamped to 0..1 and urgency to 0..100 because the handler
 * auto-resolves a ticket at autoResolutionConfidence >= 0.85: a model that
 * answers 85 meaning "85%" must not clear that bar by accident. For the same
 * reason autoResolvable is true only for a JSON boolean true, not the string
 * "false".
 */
export function parseTicketAnalysis(content: unknown): AIAnalysisResult | null {
  if (typeof content !== 'string' || content.trim() === '') return null;
  const a = extractJsonObject(content);
  if (!a) return null;

  const sentiment = SENTIMENTS.includes(a.sentiment as TicketSentiment)
    ? (a.sentiment as TicketSentiment)
    : 'neutral';

  return {
    issueType: str(a.issueType, 'question'),
    issueConfidence: num(a.issueConfidence, 0.5, 0, 1),
    affectedFeature: str(a.affectedFeature, 'unknown'),
    autoResolvable: a.autoResolvable === true,
    autoResolutionConfidence: num(a.autoResolutionConfidence, 0, 0, 1),
    suggestedResponse: typeof a.suggestedResponse === 'string' ? a.suggestedResponse : '',
    sentiment,
    sentimentScore: num(a.sentimentScore, 0.5, 0, 1),
    urgencyScore: num(a.urgencyScore, 50, 0, 100),
    reasoning: typeof a.reasoning === 'string' ? a.reasoning : '',
  };
}

function lower(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

/** Keyword fallback used when the model is unavailable or answers with no usable JSON. */
export function ruleBasedAnalysis(ticket: Row, userContext: Row | null | undefined): AIAnalysisResult {
  const combined = `${lower(ticket.subject)} ${lower(ticket.description)}`;

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

  let sentiment: TicketSentiment = 'neutral';
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
