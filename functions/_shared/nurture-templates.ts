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

function encouragementLine(ctx: TemplateContext): string {
  const e = typeof ctx.encouragement === 'string' ? ctx.encouragement.trim() : '';
  return e ? `<p>${e}</p>` : '';
}

export const NURTURE_TEMPLATES: Record<string, (ctx: TemplateContext) => { subject: string; body: string }> = {
  // Onboarding sequence (US-499). Merge fields: kidCount, foodsAdded, encouragement.
  welcome: (ctx) => ({
    subject: 'Welcome to EatPal 🎉',
    body:
      `<h2>Welcome to EatPal!</h2>
       <p>You're set up to build calmer, more confident mealtimes for your family.</p>
       ${encouragementLine(ctx)}
       <p>Start by adding your child's safe foods — that's the foundation for personalized plans.</p>
       <p><a href="https://tryeatpal.com/pantry">Add your first foods →</a></p>`,
  }),
  add_kid: (ctx) => ({
    subject: 'Add your child to get personalized plans',
    body:
      `<h2>One quick step to unlock plans</h2>
       <p>Add your child's profile so EatPal can tailor try-bites and meal plans to their needs.</p>
       ${encouragementLine(ctx)}
       <p><a href="https://tryeatpal.com/kids">Add your child →</a></p>`,
  }),
  first_plan: (ctx) => ({
    subject: 'Ready for your first meal plan?',
    body:
      `<h2>Let's make your first plan</h2>
       <p>You've added ${Number(ctx.foodsAdded ?? 0)} food(s) and ${Number(ctx.kidCount ?? 0)} child profile(s). ` +
      `Generate a 7-day plan built around safe foods with gentle try-bites.</p>
       ${encouragementLine(ctx)}
       <p><a href="https://tryeatpal.com/planner">Create your plan →</a></p>`,
  }),
  week1_recap: (ctx) => ({
    subject: 'Your first week with EatPal',
    body:
      `<h2>Look how far you've come</h2>
       <p>In your first week you added ${Number(ctx.foodsAdded ?? 0)} food(s) across ${Number(ctx.kidCount ?? 0)} child profile(s).</p>
       ${encouragementLine(ctx)}
       <p>Keep the momentum — small, consistent exposures are what expand a picky eater's diet.</p>
       <p><a href="https://tryeatpal.com/dashboard">Open your dashboard →</a></p>`,
  }),
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
