import { sanitizeUrl } from "./sanitize";

/**
 * A recipe's image_url or source_url, made safe to store and render.
 *
 * sanitizeUrl blocks javascript:, data: and friends but still lets through
 * mailto:, tel: and relative paths, none of which is a recipe link. This keeps
 * only absolute http(s) URLs.
 *
 * Returns '' for an empty value and null for one that cannot be made safe, so
 * a form can tell "left blank" from "typed something wrong".
 *
 * With `addScheme`, a value typed without a scheme ("example.com/pie") gets
 * https:// in front first, which is what a person typing a link means.
 */
export function toSafeHttpUrl(
  value: string | null | undefined,
  opts: { addScheme?: boolean } = {},
): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  let candidate = raw;
  if (opts.addScheme && !/^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    candidate = `https://${candidate.replace(/^\/+/, "")}`;
  }
  const clean = sanitizeUrl(candidate);
  if (!clean || !/^https?:\/\//i.test(clean)) return null;
  try {
    const url = new URL(clean);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname || !url.hostname.includes(".")) return null;
    return clean;
  } catch {
    return null;
  }
}
