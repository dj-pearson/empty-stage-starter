/**
 * Nurture email template registry (US-498; onboarding keys added in US-499).
 *
 * Each template renders a subject + HTML body from a context. Every body must
 * include the unsubscribe link. Unknown keys fall back to a generic body so the
 * engine never drafts an empty email.
 */

export interface TemplateContext {
  unsubscribeUrl: string;
  kidCount?: number;
  foodsAdded?: number;
  [key: string]: unknown;
}

export interface RenderedTemplate {
  subject: string;
  body: string;
  /** True when rendered from a known template (enables bulk-approve). */
  templated: boolean;
}

function footer(ctx: TemplateContext): string {
  return `<p style="color:#9ca3af;font-size:12px;margin-top:24px">
    You're receiving this because you signed up for EatPal.
    <a href="${ctx.unsubscribeUrl}">Unsubscribe</a>.</p>`;
}

function wrap(inner: string, ctx: TemplateContext): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:520px">${inner}${footer(ctx)}</div>`;
}

export const NURTURE_TEMPLATES: Record<string, (ctx: TemplateContext) => { subject: string; body: string }> = {
  // Onboarding templates are registered here in US-499.
};

/** Render a template by key, falling back to a generic body for unknown keys. */
export function renderTemplate(key: string, ctx: TemplateContext): RenderedTemplate {
  const tmpl = NURTURE_TEMPLATES[key];
  if (tmpl) {
    const { subject, body } = tmpl(ctx);
    return { subject, body: wrap(body, ctx), templated: true };
  }
  return {
    subject: 'A note from EatPal',
    body: wrap(`<p>We wanted to check in and help you get the most out of EatPal.</p>`, ctx),
    templated: false,
  };
}
