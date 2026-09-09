import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { execSync } from "child_process";
import path from "path";

/**
 * US-826: a control that only appears on hover does not appear on a phone.
 *
 * `opacity-0 group-hover:opacity-100` is invisible on any touch device -- there
 * is no hover -- but opacity does NOT remove hit-testing, so the button is
 * still there and still tappable. An invisible Remove button you can hit by
 * accident is worse than a missing one.
 *
 * US-576 fixed exactly this on Grocery.tsx and pinned it in
 * src/pages/Grocery.a11y.test.ts -- for that one file. This is the same rule
 * applied to every file, so the next hover-reveal control cannot ship without
 * a touch and a keyboard route to it.
 *
 * `pointer-coarse:` is a custom variant registered in tailwind.config.ts, not a
 * Tailwind 3 built-in; Grocery.a11y.test.ts asserts the plugin still exists,
 * without which every one of these classes compiles to nothing.
 */

const ROOT = path.resolve(__dirname, "../..");

/**
 * Files whose hover-reveal element is NOT a control. Each needs a reason, and
 * the reason is checked below -- a path that no longer matches its stated
 * reason fails, so this list cannot quietly become a dumping ground.
 */
const EXEMPT: Record<string, { reason: string; proof: RegExp }> = {
  "src/components/ui/toast.tsx": {
    reason: "shadcn-generated; CLAUDE.md forbids editing src/components/ui/",
    proof: /ToastPrimitives/,
  },
  "src/components/ui/QuickActionMenu.tsx": {
    reason: "decorative label, and hidden below md where touch lives",
    proof: /hidden md:flex/,
  },
  "src/components/QuickActionsMenu.tsx": {
    reason: "decorative label hint; pointer-events-none, so not hit-testable",
    proof: /pointer-events-none/,
  },
};

interface Finding {
  file: string;
  className: string;
  missing: string[];
}

function scan(): { total: number; findings: Finding[] } {
  const files = execSync("grep -rl 'opacity-0' src --include=*.tsx", {
    encoding: "utf8",
    cwd: ROOT,
  })
    .trim()
    .split("\n")
    .filter((f) => f && !/\.test\./.test(f));

  const findings: Finding[] = [];
  let total = 0;

  for (const file of files) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    const classNames =
      source.match(/className=(?:"[^"]*"|\{`[^`]*`\}|\{cn\([^)]*\))/g) ?? [];

    for (const className of classNames) {
      if (!/\bopacity-0\b/.test(className)) continue;
      if (!/(?:group-)?hover:opacity-100/.test(className)) continue;
      total++;
      if (EXEMPT[file]) continue;

      const missing: string[] = [];
      if (!/(?:group-)?focus-within:opacity-100/.test(className)) missing.push("focus-within");
      if (!/focus(?:-visible)?:opacity-100/.test(className)) missing.push("focus-visible");
      if (!/pointer-coarse:opacity-100/.test(className)) missing.push("pointer-coarse");
      if (missing.length) findings.push({ file, className, missing });
    }
  }
  return { total, findings };
}

describe("hover-reveal controls are reachable without a mouse", () => {
  const { total, findings } = scan();

  it("found hover-reveal controls to check", () => {
    // Assert the instrument. If the className regex stops matching -- a
    // refactor to clsx, say -- every assertion below passes against nothing.
    expect(total).toBeGreaterThanOrEqual(15);
  });

  it("every one reveals on touch and on keyboard focus", () => {
    const report = findings.map(
      (f) => `${f.file}\n    missing ${f.missing.join(", ")}\n    ${f.className.slice(0, 120)}`,
    );
    expect(report).toEqual([]);
  });
});

describe("the exemption list stays honest", () => {
  it.each(Object.entries(EXEMPT))("%s still matches its stated reason", (file, { proof }) => {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    expect(source).toMatch(proof);
  });

  it("exempts nothing that no longer has a hover-reveal class", () => {
    // An entry that stops being needed should be deleted, not left to rot.
    const stale = Object.keys(EXEMPT).filter((file) => {
      const source = readFileSync(path.join(ROOT, file), "utf8");
      return !/\bopacity-0\b/.test(source);
    });
    expect(stale).toEqual([]);
  });
});
