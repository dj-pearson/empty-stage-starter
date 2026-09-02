import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Accessibility linting (compliance audit 2026-07). Set to "warn" so it
      // surfaces issues (e.g. missing button names, invalid ARIA) in editors/CI
      // without failing the currently-red build; promote to "error" once the
      // existing warnings are burned down.
      ...Object.fromEntries(
        Object.entries(jsxA11y.flatConfigs.recommended.rules).map(([rule]) => [rule, "warn"])
      ),
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["error", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_"
      }],
    },
  },
  {
    // US-715: setPlanEntries replaces the whole plan slice in local state and
    // writes nothing to the server. It exists for ONE job: dropping in a fresh
    // server load. Every other use is a bug -- Quick Build and AI Generate Week
    // both used it, so a generated week was gone on reload, never reached a
    // partner's device, and wiped every other kid and week on the way. Mutating
    // callers belong on addPlanEntries / updatePlanEntry / deleteWeekPlan.
    //
    // The two remaining callers in Planner.tsx are server loads and carry an
    // inline disable saying so. New ones are blocked here.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/contexts/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='setPlanEntries']",
          message:
            "setPlanEntries is server-load only (US-715). To change the plan use addPlanEntries, updatePlanEntry or deleteWeekPlan, which persist. If this really is a fresh server load, disable this rule on the line and say so.",
        },
      ],
    },
  },
  {
    // US-343: app code must log through `@/lib/logger`, not console. Scoped to
    // src/ so the Deno edge functions (functions/, which legitimately use
    // console for server logging) are unaffected. logger.ts is the logging
    // implementation itself, so it's exempt.
    files: ["src/**/*.{ts,tsx}"],
    // logger.ts and env-utils.ts are the console-wrapper logging utilities.
    ignores: ["src/lib/logger.ts", "src/lib/env-utils.ts"],
    rules: {
      "no-console": "error",
    },
  },
);
