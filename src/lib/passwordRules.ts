import { PasswordSchema } from "@/lib/validations";

/**
 * PasswordSchema's checks as a list the UI can tick off (settings pass B).
 *
 * Read from the schema itself rather than declared a second time, so the
 * checklist cannot promise "8 characters" while the schema demands 12 --
 * which is what Account Settings and the bind-email flow did while signup and
 * reset enforced the stronger rule.
 */

export type PasswordRuleId = "length" | "upper" | "lower" | "number" | "special" | "other";

export interface PasswordRule {
  id: PasswordRuleId;
  test: (value: string) => boolean;
  /** The schema's own minimum, for the length label. */
  min?: number;
  /** The schema's message, shown for a rule this module does not recognise. */
  fallback: string;
}

const REGEX_IDS: Record<string, PasswordRuleId> = {
  "[A-Z]": "upper",
  "[a-z]": "lower",
  "[0-9]": "number",
  "[^A-Za-z0-9]": "special",
};

/** zod 3 keeps a ZodString's checks on _def. Read them, never re-declare them. */
function readRules(): PasswordRule[] {
  const rules: PasswordRule[] = [];
  for (const check of PasswordSchema._def.checks) {
    if (check.kind === "min") {
      const min = check.value;
      rules.push({ id: "length", min, test: (v) => v.length >= min, fallback: check.message ?? "" });
    } else if (check.kind === "regex") {
      const regex = check.regex;
      rules.push({
        id: REGEX_IDS[regex.source] ?? "other",
        test: (v) => regex.test(v),
        fallback: check.message ?? regex.source,
      });
    }
    // max (128) is enforced by the schema and not worth a line on screen.
  }
  return rules;
}

export const PASSWORD_RULES: readonly PasswordRule[] = readRules();

/** The minimum length the schema requires, for minLength attributes. */
export const PASSWORD_MIN_LENGTH = PASSWORD_RULES.find((rule) => rule.id === "length")?.min ?? 12;

/**
 * For Safari's password generator: the schema's rules in the passwordrules
 * syntax (https://developer.apple.com/password-rules/).
 */
export const PASSWORD_RULES_ATTRIBUTE = `minlength: ${PASSWORD_MIN_LENGTH}; required: lower; required: upper; required: digit; required: special;`;

/**
 * Spread onto a new-password input. passwordrules is not in React's attribute
 * types, so it travels as a plain record; React passes unknown lowercase
 * string attributes through to the DOM.
 */
export const PASSWORD_RULES_PROPS: Readonly<Record<string, string>> = {
  passwordrules: PASSWORD_RULES_ATTRIBUTE,
};

/** The same answer the signup and reset screens get. */
export function isPasswordValid(value: string): boolean {
  return PasswordSchema.safeParse(value).success;
}
