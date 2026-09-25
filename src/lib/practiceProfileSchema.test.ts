import { describe, it, expect } from 'vitest';
import {
  PRACTICE_COLOR_DEFAULTS,
  PRACTICE_PROFILE_COLUMNS,
  draftFromRow,
  parsePracticeProfile,
} from './practiceProfileSchema';

/**
 * The schema has to accept exactly what the professional_brand_settings CHECKs
 * accept. A looser rule turns into a Postgres error on save; a stricter one
 * blocks a value the database would take.
 */

const base = () => draftFromRow(null);

describe('practiceProfileSchema', () => {
  it('turns an empty contact email into null and passes', () => {
    const result = parsePracticeProfile({ ...base(), contact_email: '' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.contact_email).toBeNull();
  });

  it('treats whitespace-only fields as blank', () => {
    const result = parsePracticeProfile({ ...base(), business_name: '   ', support_url: ' ' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.business_name).toBeNull();
      expect(result.payload.support_url).toBeNull();
    }
  });

  it("rejects 'a@b', which valid_email rejects", () => {
    const result = parsePracticeProfile({ ...base(), contact_email: 'a@b' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.contact_email).toBe('professional.profile.errors.email');
  });

  it('accepts an address valid_email accepts', () => {
    expect(parsePracticeProfile({ ...base(), contact_email: 'clinic@example.com' }).ok).toBe(true);
  });

  it.each(['#2f6', 'green', '2F6ABC', '#2F6ABCD'])('rejects the color %s', (value) => {
    const result = parsePracticeProfile({ ...base(), primary_color: value });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.primary_color).toBe('professional.profile.errors.color');
  });

  it("accepts '#2F6ABC'", () => {
    const result = parsePracticeProfile({ ...base(), accent_color: '#2F6ABC' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.accent_color).toBe('#2F6ABC');
  });

  it('rejects an http support_url', () => {
    const result = parsePracticeProfile({ ...base(), support_url: 'http://clinic.example.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.support_url).toBe('professional.profile.errors.https');
  });

  it('accepts an https support_url', () => {
    expect(parsePracticeProfile({ ...base(), support_url: 'https://clinic.example.com/book' }).ok).toBe(true);
  });

  it('outputs exactly the whitelisted columns', () => {
    const result = parsePracticeProfile({ ...base(), id: 'x', user_id: 'y', created_at: 'z' } as Parameters<typeof parsePracticeProfile>[0]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(Object.keys(result.payload).sort()).toEqual([...PRACTICE_PROFILE_COLUMNS].sort());
  });

  it('fills a new profile with the table defaults', () => {
    expect(base().primary_color).toBe(PRACTICE_COLOR_DEFAULTS.primary_color);
    expect(base().contact_email).toBe('');
  });
});
