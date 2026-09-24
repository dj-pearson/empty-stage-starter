/**
 * Which Settings hub section is open, held in the URL (?section=<key>).
 *
 * - An unknown ?section= is dropped with a replace, so a bad link lands on
 *   the index rather than on a page that pretends to know the section.
 * - A legacy #<key> is accepted once, on first load, and rewritten to
 *   ?section= with a replace.
 * - setSection(key) PUSHES, so the phone's Back gesture returns from a section
 *   to the index. setSection(null) goes back one entry when that entry is the
 *   index we came from, and otherwise pushes the index.
 * - When the section changes, its h2 takes focus and the section scrolls into
 *   view ('auto' under reduced motion, else 'smooth'). &focus=<controlId>
 *   then focuses that control, but only an id registered for that section in
 *   SETTINGS_SECTIONS. Nothing here opens a dialog or runs an action: a link
 *   can select and focus, never act.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  isSettingsControlOf,
  isSettingsSectionKey,
  type SettingsSectionKey,
} from '@/lib/settingsSections';

export const SECTION_PARAM = 'section';
export const FOCUS_PARAM = 'focus';

/** History state marking an entry pushed from the hub index. */
export interface SettingsHistoryState {
  fromSettingsIndex?: boolean;
}
export const FROM_INDEX_STATE: SettingsHistoryState = Object.freeze({ fromSettingsIndex: true });

/** How long to wait for a lazily loaded control before giving up on &focus=. */
const FOCUS_ATTEMPTS = 20;
const FOCUS_INTERVAL_MS = 150;

export interface UseSettingsSection {
  /** The section in the URL, or null for none (the phone index). */
  section: SettingsSectionKey | null;
  /** A registered control id from &focus=, or null. */
  focus: string | null;
  setSection: (key: SettingsSectionKey | null) => void;
}

function cameFromIndex(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as SettingsHistoryState).fromSettingsIndex === true;
}

export function useSettingsSection(): UseSettingsSection {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const osReducedMotion = useReducedMotion();

  const raw = searchParams.get(SECTION_PARAM);
  const section = isSettingsSectionKey(raw) ? raw : null;
  const rawFocus = searchParams.get(FOCUS_PARAM);
  const focus = section && isSettingsControlOf(section, rawFocus) ? rawFocus : null;

  // Read inside the scroll effect without re-running it when the toggle flips.
  const reducedRef = useRef(osReducedMotion);
  reducedRef.current = osReducedMotion;

  // Unknown ?section= (or a focus with no section): drop it, replacing.
  useEffect(() => {
    const badSection = raw !== null && section === null;
    const orphanFocus = rawFocus !== null && focus === null;
    if (!badSection && !orphanFocus) return;
    const next = new URLSearchParams(searchParams);
    if (badSection) next.delete(SECTION_PARAM);
    next.delete(FOCUS_PARAM);
    setSearchParams(next, { replace: true, state: location.state });
  }, [raw, section, rawFocus, focus, searchParams, setSearchParams, location.state]);

  // Legacy #<key>, first load only.
  const hashChecked = useRef(false);
  useEffect(() => {
    if (hashChecked.current) return;
    hashChecked.current = true;
    if (raw !== null) return;
    const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!isSettingsSectionKey(hash)) return;
    navigate({ pathname: location.pathname, search: `?${SECTION_PARAM}=${hash}`, hash: '' }, { replace: true });
  }, [raw, location.hash, location.pathname, navigate]);

  // Focus and scroll on every change of section, focus or history entry.
  const previousSection = useRef<SettingsSectionKey | null>(null);
  useEffect(() => {
    const prev = previousSection.current;
    previousSection.current = section;
    const behavior: ScrollBehavior =
      reducedRef.current ||
      (typeof document !== 'undefined' && document.documentElement.classList.contains('reduce-motion'))
        ? 'auto'
        : 'smooth';

    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      if (!section) {
        // Back on the index: return focus to the row the reader left from.
        if (prev) document.querySelector<HTMLElement>(`[data-settings-row="${prev}"]`)?.focus();
        return;
      }
      const el = document.getElementById(`settings-${section}`);
      if (!el) return;
      el.scrollIntoView?.({ behavior, block: 'start' });
      const heading = el.querySelector<HTMLElement>('h2');
      if (heading) {
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
      if (!focus) return;
      let attempts = 0;
      const tryFocus = () => {
        const target = document.getElementById(focus);
        if (target) {
          target.scrollIntoView?.({ behavior, block: 'center' });
          target.focus({ preventScroll: true });
          return;
        }
        attempts += 1;
        if (attempts < FOCUS_ATTEMPTS) timer = setTimeout(tryFocus, FOCUS_INTERVAL_MS);
      };
      tryFocus();
    });
    return () => {
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
    };
  }, [section, focus, location.key]);

  const setSection = useCallback(
    (key: SettingsSectionKey | null) => {
      if (key === null) {
        if (cameFromIndex(location.state)) {
          navigate(-1);
          return;
        }
        navigate({ pathname: location.pathname, search: '' });
        return;
      }
      const next = new URLSearchParams();
      next.set(SECTION_PARAM, key);
      setSearchParams(next, { state: section === null ? FROM_INDEX_STATE : undefined });
    },
    [location.state, location.pathname, navigate, section, setSearchParams]
  );

  return { section, focus, setSection };
}
