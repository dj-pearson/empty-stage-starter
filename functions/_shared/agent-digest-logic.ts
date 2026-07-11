/**
 * Pure email/summary logic for the agent digest function (US-488).
 *
 * Separated from the edge function so the "is there anything to report?" gate,
 * the yesterday window, approval grouping, and the HTML bodies are unit-testable
 * without a database, network, or Resend.
 */

/** Minimal escalation shape the instant email needs. */
export interface DigestEscalation {
  title: string;
  severity: string;
  domain: string | null;
  tier: number;
}

export interface DailyStats {
  openTier2: number;
  pendingApprovalsByType: Record<string, number>;
  yesterdaySpendUsd: number;
  failedRunsCount: number;
}

export interface EmailBody {
  subject: string;
  html: string;
}

/** Escape text before interpolating into the HTML email body. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** UTC [start, end) covering all of "yesterday" relative to `now`. */
export function yesterdayUtcWindow(now: Date): { start: string; end: string } {
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const yesterdayStart = todayStart - 86_400_000;
  return {
    start: new Date(yesterdayStart).toISOString(),
    end: new Date(todayStart).toISOString(),
  };
}

/** Count pending approvals per action_type. */
export function groupApprovalsByActionType(
  rows: Array<{ action_type: string }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.action_type] = (out[r.action_type] ?? 0) + 1;
  return out;
}

/** Does the daily digest have anything actionable worth an email? */
export function dailyHasContent(stats: DailyStats): boolean {
  const pending = Object.values(stats.pendingApprovalsByType).reduce((a, b) => a + b, 0);
  return stats.openTier2 > 0 || pending > 0 || stats.failedRunsCount > 0;
}

function money(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/** Instant tier-3 alert email. */
export function buildInstantEmail(esc: DigestEscalation, appBaseUrl: string): EmailBody {
  const link = `${appBaseUrl.replace(/\/$/, '')}/admin/agents?tab=escalations`;
  const subject = `[EatPal] Tier-3 escalation: ${esc.title}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px">
      <h2 style="color:#b91c1c;margin:0 0 8px">Tier-3 escalation</h2>
      <p style="font-size:16px;margin:0 0 12px"><strong>${escapeHtml(esc.title)}</strong></p>
      <table style="font-size:14px;border-collapse:collapse">
        <tr><td style="color:#6b7280;padding:2px 12px 2px 0">Severity</td><td>${escapeHtml(esc.severity)}</td></tr>
        <tr><td style="color:#6b7280;padding:2px 12px 2px 0">Domain</td><td>${escapeHtml(esc.domain ?? '—')}</td></tr>
        <tr><td style="color:#6b7280;padding:2px 12px 2px 0">Tier</td><td>${esc.tier}</td></tr>
      </table>
      <p style="margin:16px 0 0">
        <a href="${link}" style="background:#b91c1c;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none">
          Open Command Center
        </a>
      </p>
    </div>`.trim();
  return { subject, html };
}

/** Daily tier-2 summary email. Call only when dailyHasContent() is true. */
export function buildDailyDigest(stats: DailyStats, appBaseUrl: string): EmailBody {
  const link = `${appBaseUrl.replace(/\/$/, '')}/admin/agents`;
  const approvalRows = Object.entries(stats.pendingApprovalsByType)
    .map(
      ([type, n]) =>
        `<tr><td style="padding:2px 12px 2px 0">${escapeHtml(type)}</td><td>${n}</td></tr>`,
    )
    .join('');
  const approvalsSection = approvalRows
    ? `<table style="font-size:14px;border-collapse:collapse">${approvalRows}</table>`
    : `<p style="color:#6b7280;margin:0">None</p>`;

  const subject = `[EatPal] Agentic OS daily digest`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px">
      <h2 style="margin:0 0 12px">Agentic OS — daily digest</h2>
      <h3 style="margin:16px 0 4px">Open tier-2 escalations</h3>
      <p style="margin:0">${stats.openTier2}</p>
      <h3 style="margin:16px 0 4px">Pending approvals by type</h3>
      ${approvalsSection}
      <h3 style="margin:16px 0 4px">Yesterday's agent spend</h3>
      <p style="margin:0">${money(stats.yesterdaySpendUsd)}</p>
      <h3 style="margin:16px 0 4px">Failed runs (yesterday)</h3>
      <p style="margin:0">${stats.failedRunsCount}</p>
      <p style="margin:20px 0 0">
        <a href="${link}" style="background:#111827;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none">
          Open Command Center
        </a>
      </p>
    </div>`.trim();
  return { subject, html };
}
