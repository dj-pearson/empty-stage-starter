import { useFeatureFlag } from '@/hooks/useFeatureFlag';

/**
 * The exposure ladder is on for everyone (item 40).
 *
 * Food Tracker no longer asks: the legacy tracker it used to fall back to is
 * gone, so there is nothing for it to switch to. The flag survives as a kill
 * switch for the surfaces built around the ladder (Safe Food Insurance, the
 * Home insight slot, the Insights sections, the Food Chaining link).
 *
 * The default is ON, and migration 20260926000002 seeds the flag row enabled at
 * 100%. That row matters more than this default: `evaluate_feature_flag`
 * returns false for a key with no row, so the default only applies when the
 * flag cannot be evaluated at all (signed out, or both lookups erroring). To
 * switch the surfaces off, set `feature_flags.enabled = false` for
 * `exposure_ladder`; every evaluation path then reads false.
 */
export const EXPOSURE_LADDER_FLAG = 'exposure_ladder';
export const EXPOSURE_LADDER_DEFAULT = true;

export function useExposureLadderFlag(): boolean {
  return useFeatureFlag(EXPOSURE_LADDER_FLAG, EXPOSURE_LADDER_DEFAULT);
}
