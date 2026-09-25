import { z } from 'zod';
import type { Database } from '@/integrations/supabase/types';

/**
 * The practice profile a Professional account keeps: the columns of
 * professional_brand_settings a clinician edits on /dashboard/professional-settings.
 *
 * The rules mirror the table's CHECK constraints
 * (supabase/migrations/20251111000000_add_custom_domains.sql) exactly, so a
 * value this accepts is a value Postgres accepts:
 *
 *   valid_colors: each color ~ '^#[0-9A-Fa-f]{6}$'
 *   valid_email:  contact_email IS NULL OR contact_email ~ '^[^@]+@[^@]+\.[^@]+$'
 *
 * Blank strings become null before validation. The old form sent
 * contact_email: '' on a first save, and '' fails valid_email, so the very
 * first save of every new profile was rejected by the database.
 *
 * Error messages are i18n keys under professional.profile.errors.*; the form
 * translates them.
 */

type BrandRow = Database['public']['Tables']['professional_brand_settings']['Row'];
type BrandInsert = Database['public']['Tables']['professional_brand_settings']['Insert'];

export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
export const CONTACT_EMAIL = /^[^@]+@[^@]+\.[^@]+$/;

/** The table's column defaults, used when a row has none yet. */
export const PRACTICE_COLOR_DEFAULTS = Object.freeze({
  primary_color: '#2f6d3c',
  secondary_color: '#a5d6a7',
  accent_color: '#ffa45b',
});

export const PRACTICE_COLOR_FIELDS = ['primary_color', 'secondary_color', 'accent_color'] as const;
export type PracticeColorField = (typeof PRACTICE_COLOR_FIELDS)[number];

/** The only columns a save may send. id, user_id, created_at and updated_at never go. */
export const PRACTICE_PROFILE_COLUMNS = [
  'business_name',
  'contact_email',
  'phone_number',
  'support_url',
  'logo_url',
  'platform_tagline',
  'primary_color',
  'secondary_color',
  'accent_color',
] as const satisfies ReadonlyArray<keyof BrandRow>;

export type PracticeProfileField = (typeof PRACTICE_PROFILE_COLUMNS)[number];

const blankToNull = (value: unknown): unknown => {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().max(max, 'professional.profile.errors.tooLong').nullable());

const isHttpsUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.length > 0;
  } catch {
    return false;
  }
};

const optionalHttpsUrl = z.preprocess(
  blankToNull,
  z
    .string()
    .max(2048, 'professional.profile.errors.tooLong')
    .refine(isHttpsUrl, 'professional.profile.errors.https')
    .nullable(),
);

const color = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z.string().regex(HEX_COLOR, 'professional.profile.errors.color'),
);

export const practiceProfileSchema = z.object({
  business_name: optionalText(120),
  contact_email: z.preprocess(
    blankToNull,
    z
      .string()
      .max(254, 'professional.profile.errors.tooLong')
      .regex(CONTACT_EMAIL, 'professional.profile.errors.email')
      .nullable(),
  ),
  phone_number: z.preprocess(
    blankToNull,
    z
      .string()
      .max(40, 'professional.profile.errors.tooLong')
      .regex(/^[0-9+().\-\s]{7,}$/, 'professional.profile.errors.phone')
      .nullable(),
  ),
  support_url: optionalHttpsUrl,
  logo_url: optionalHttpsUrl,
  platform_tagline: optionalText(160),
  primary_color: color,
  secondary_color: color,
  accent_color: color,
});

/** What a valid form becomes: exactly the whitelisted columns, blanks as null. */
export type PracticeProfilePayload = z.infer<typeof practiceProfileSchema>;

/** What the inputs hold: every field as a string. */
export type PracticeProfileDraft = Record<PracticeProfileField, string>;

/** Form values for a stored row, or the empty profile with the table's default colors. */
export function draftFromRow(row: BrandRow | null): PracticeProfileDraft {
  return {
    business_name: row?.business_name ?? '',
    contact_email: row?.contact_email ?? '',
    phone_number: row?.phone_number ?? '',
    support_url: row?.support_url ?? '',
    logo_url: row?.logo_url ?? '',
    platform_tagline: row?.platform_tagline ?? '',
    primary_color: row?.primary_color ?? PRACTICE_COLOR_DEFAULTS.primary_color,
    secondary_color: row?.secondary_color ?? PRACTICE_COLOR_DEFAULTS.secondary_color,
    accent_color: row?.accent_color ?? PRACTICE_COLOR_DEFAULTS.accent_color,
  };
}

export type PracticeProfileErrors = Partial<Record<PracticeProfileField, string>>;

export type PracticeProfileParse =
  | { ok: true; payload: PracticeProfilePayload }
  | { ok: false; errors: PracticeProfileErrors };

/** Validate a draft. Errors are i18n keys, one per field (the first issue). */
export function parsePracticeProfile(draft: Partial<Record<PracticeProfileField, unknown>>): PracticeProfileParse {
  const result = practiceProfileSchema.safeParse(draft);
  if (result.success) return { ok: true, payload: result.data };
  const errors: PracticeProfileErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && (PRACTICE_PROFILE_COLUMNS as readonly string[]).includes(field)) {
      const key = field as PracticeProfileField;
      if (!errors[key]) errors[key] = issue.message.startsWith('professional.') ? issue.message : 'professional.profile.errors.invalid';
    }
  }
  return { ok: false, errors };
}

/**
 * The upsert body: the whitelisted columns from a parsed payload, plus the
 * signed-in user's id, which the onConflict target and the INSERT policy both
 * need. id, created_at and updated_at never go, and user_id comes from auth,
 * never from the loaded row.
 */
export function buildPracticeProfileUpsert(userId: string, payload: PracticeProfilePayload): BrandInsert {
  const body: BrandInsert = { user_id: userId };
  for (const column of PRACTICE_PROFILE_COLUMNS) body[column] = payload[column];
  return body;
}
