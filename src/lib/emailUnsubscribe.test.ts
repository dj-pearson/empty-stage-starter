/**
 * US-843: an unsubscribe that stops two of three mailings is not an unsubscribe.
 *
 * `email_suppressions` is where nurture-unsubscribe writes when somebody clicks
 * the link in a nurture email. agent-nurture-engine and agent-weekly-digest
 * both read it. weekly-nutrition-email did not -- it checked only its own
 * `automation_email_subscriptions` row -- so a parent who unsubscribed carried
 * on receiving the weekly nutrition summary indefinitely.
 *
 * And no sender set `List-Unsubscribe` / `List-Unsubscribe-Post`, which Gmail
 * and Yahoo have required of bulk senders since February 2024. Without them a
 * mail client offers no unsubscribe of its own and recipients reach for
 * "report spam", against a reputation shared with the password-reset mail.
 *
 * Imported straight from functions/_shared, the way contentDecay.test.ts and
 * stripeWebhookLogic.test.ts already do, rather than kept as a second copy.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listUnsubscribeHeaders } from '../../functions/_shared/email-headers';
import { isSuppressed, normalizeEmail } from '../../functions/_shared/email-suppression';

const ROOT = process.cwd();
const readFn = (...parts: string[]) => readFileSync(join(ROOT, 'functions', ...parts), 'utf8');

/** A Supabase query builder stubbed down to the one chain isSuppressed uses. */
function stubDb(result: { count?: number; error?: unknown }) {
  const eq = vi.fn(() => Promise.resolve(result));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { db: { from }, from, select, eq };
}

describe('US-843: the suppression check', () => {
  it('says yes when the address is on the list', async () => {
    const { db } = stubDb({ count: 1 });
    expect(await isSuppressed(db, 'parent@example.com')).toBe(true);
  });

  it('says no when it is not', async () => {
    const { db } = stubDb({ count: 0 });
    expect(await isSuppressed(db, 'parent@example.com')).toBe(false);
  });

  it('compares the normalised address, since that is how the table stores it', async () => {
    const { db, eq } = stubDb({ count: 0 });
    await isSuppressed(db, '  Parent@Example.COM ');
    expect(eq).toHaveBeenCalledWith('email', 'parent@example.com');
    expect(normalizeEmail('  Parent@Example.COM ')).toBe('parent@example.com');
  });

  it('fails CLOSED on a query error', async () => {
    // A database blip must not be read as consent. A skipped send is
    // recoverable on the next run; mailing someone who asked us not to is not.
    const { db } = stubDb({ error: { message: 'connection reset' } });
    expect(await isSuppressed(db, 'parent@example.com')).toBe(true);
  });
});

describe('US-843: the one-click headers', () => {
  it('emits both, because one without the other is the old behaviour', () => {
    const headers = listUnsubscribeHeaders('https://fn.example.com/nurture-unsubscribe?t=abc');
    expect(headers).toEqual({
      'List-Unsubscribe': '<https://fn.example.com/nurture-unsubscribe?t=abc>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('wraps the URL in angle brackets, as RFC 8058 requires', () => {
    const { 'List-Unsubscribe': value } = listUnsubscribeHeaders('https://x.test/u');
    expect(value.startsWith('<')).toBe(true);
    expect(value.endsWith('>')).toBe(true);
  });

  it('puts the URL first when a mailto is also offered', () => {
    // A client may take either; the URL is the one that works without the
    // recipient's mail client being able to send on their behalf.
    const { 'List-Unsubscribe': value } = listUnsubscribeHeaders(
      'https://x.test/u',
      'unsubscribe@tryeatpal.com'
    );
    expect(value).toBe('<https://x.test/u>, <mailto:unsubscribe@tryeatpal.com>');
  });
});

describe('US-843: every bulk sender is wired to both', () => {
  it('weekly-nutrition-email consults the suppression list', () => {
    const source = readFn('weekly-nutrition-email', 'index.ts');
    expect(source).toContain('isSuppressed');
    expect(source).toMatch(/if \(await isSuppressed\([^)]*\)\) \{/);
  });

  it('weekly-nutrition-email sets the headers and carries a link in the body', () => {
    const source = readFn('weekly-nutrition-email', 'index.ts');
    expect(source).toContain('listUnsubscribeHeaders');
    expect(source).toContain('nurture-unsubscribe?t=');
    expect(source).toContain('>Unsubscribe</a>');
  });

  it('approval-executor sets the headers when the message carries an unsubscribe URL', () => {
    const source = readFn('approval-executor', 'index.ts');
    expect(source).toContain('listUnsubscribeHeaders');
    expect(source).toContain('payload.unsubscribe_url');
  });

  it('the nurture engine hands that URL to the executor', () => {
    const source = readFn('agent-nurture-engine', 'index.ts');
    expect(source).toContain('unsubscribe_url: unsubscribeUrl');
  });

  it('transactional mail is deliberately left without the headers', () => {
    // A support reply is not a mailing anyone can leave; advertising an
    // unsubscribe there would be a lie. The executor gates on the payload
    // rather than adding them unconditionally.
    const source = readFn('approval-executor', 'index.ts');
    expect(source).toMatch(/\.\.\.\(unsubscribeUrl \? \{ headers: listUnsubscribeHeaders/);
  });

  it('functionsBase has one home, not three', () => {
    // agent-csat and agent-nurture-engine each carried an identical copy and
    // weekly-nutrition-email was about to be the third.
    for (const fn of ['agent-csat', 'agent-nurture-engine', 'weekly-nutrition-email']) {
      const source = readFn(fn, 'index.ts');
      expect(source, `${fn} still declares its own functionsBase`).not.toMatch(
        /function functionsBase\(\)/
      );
      expect(source).toContain('_shared/functions-url.ts');
    }
  });
});
