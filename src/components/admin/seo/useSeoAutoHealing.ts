import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { logger } from '@/lib/logger';
import type { AuditResult } from '@/lib/seoScore';

/**
 * US-553: AI auto-healing, lifted out of SEOManager.
 *
 * Reads the audit it is healing rather than owning it, so the audit results,
 * the audit id and the re-run trigger come in from useSeoAudit. They are
 * getters for the reason established across these hooks: they are read after
 * awaiting a long edge-function call, and a captured value could describe a
 * previous audit entirely.
 */
export interface UseSeoAutoHealingOptions {
  getAuditResults: () => AuditResult[];
  getCurrentAuditId: () => string | null;
  runComprehensiveAudit: () => void | Promise<void>;
  /** Applying fixes rewrites robots.txt and the sitemap, so the editors reload. */
  reloadSeoSettings: () => void | Promise<void>;
}

export function useSeoAutoHealing({
  getAuditResults,
  getCurrentAuditId,
  runComprehensiveAudit,
  reloadSeoSettings,
}: UseSeoAutoHealingOptions) {
  const [isAutoHealing, setIsAutoHealing] = useState(false);
  const [autoHealingResults, setAutoHealingResults] = useState<Record<string, unknown> | null>(null);
  const [fixSuggestions, setFixSuggestions] = useState<Record<string, unknown>[]>([]);
  const [isApplyingFixes, setIsApplyingFixes] = useState(false);
  const [fixesAppliedResults, setFixesAppliedResults] = useState<Record<string, unknown> | null>(null);

  const runAIAutoHealing = async () => {
    setIsAutoHealing(true);
    setAutoHealingResults(null);

    try {
      // Call the apply-seo-fixes edge function
      const { data, error } = await invokeEdgeFunction("apply-seo-fixes", {
        body: {
          auditResults: getAuditResults(),
          auditId: getCurrentAuditId(),
          autoApply: false, // Set to true to automatically apply fixes
          userId: (await supabase.auth.getUser()).data.user?.id,
        },
      });

      if (error) throw error;

      setFixSuggestions(data.suggestions || []);

      setAutoHealingResults({
        success: true,
        appliedFixes: data.appliedFixes || 0,
        totalSuggestions: data.totalSuggestions || 0,
        autoApplyEnabled: data.autoApplyEnabled || false,
        message: data.autoApplyEnabled && data.appliedFixes > 0
          ? `Applied ${data.appliedFixes} SEO fixes automatically!`
          : `Generated ${data.totalSuggestions} AI-powered optimization suggestions!`
      });

      if (data.autoApplyEnabled && data.appliedFixes > 0) {
        // Re-run audit to see improvements
        setTimeout(() => {
          runComprehensiveAudit();
        }, 1000);
      }

      logger.debug("AI Healing Results:", data);
    } catch (error: unknown) {
      logger.error("AI Auto-Healing error:", error);
      setAutoHealingResults({
        success: false,
        error: error.message || "Failed to generate suggestions"
      });
    } finally {
      setIsAutoHealing(false);
    }
  };

  const applyFixesBatch = async () => {
    setIsApplyingFixes(true);
    setFixesAppliedResults(null);

    try {
      const { data, error } = await invokeEdgeFunction("apply-seo-fixes", {
        body: {
          auditResults: getAuditResults(),
          auditId: getCurrentAuditId(),
          autoApply: true, // Actually apply the fixes
          userId: (await supabase.auth.getUser()).data.user?.id,
        },
      });

      if (error) throw error;

      setFixesAppliedResults({
        success: true,
        appliedFixes: data.appliedFixes || 0,
        failedFixes: data.failedFixes || 0,
        message: data.appliedFixes > 0
          ? `Successfully applied ${data.appliedFixes} SEO fixes!`
          : "No fixes were applied",
        warning: data.failedFixes > 0
          ? `${data.failedFixes} fixes failed to apply. Check the logs.`
          : null
      });

      if (data.appliedFixes > 0) {
        // Reload SEO settings
        await reloadSeoSettings();

        // Re-run audit to verify improvements
        setTimeout(() => {
          runComprehensiveAudit();
        }, 1000);
      }
    } catch (error: unknown) {
      logger.error("Error applying fixes:", error);
      setFixesAppliedResults({
        success: false,
        error: error.message || "Failed to apply fixes"
      });
    } finally {
      setIsApplyingFixes(false);
    }
  };

  return {
    isAutoHealing,
    autoHealingResults,
    fixSuggestions,
    isApplyingFixes,
    fixesAppliedResults,
    runAIAutoHealing,
    applyFixesBatch,
  };
}
