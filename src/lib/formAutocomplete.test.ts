import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { execSync } from "child_process";
import path from "path";

/**
 * US-827: credential and contact fields must declare what they hold.
 *
 * The damage is not "autofill is a bit nicer". Without autoComplete on a
 * change-password form a manager cannot tell the three boxes apart, so it will
 * not offer the saved password, will not generate a new one, and -- the part
 * that locks people out -- will not prompt to UPDATE the stored password after
 * the change succeeds. The user changes it, the manager keeps the old one, and
 * the next sign-in fails.
 *
 * Auth.tsx already got this right (email / new-password / current-password on
 * all five of its fields). AccountSettings, which is where a password is
 * actually changed, had none. This gate is here so the correct half cannot
 * drift back to the incorrect one.
 */

const ROOT = path.resolve(__dirname, "../..");
const NEEDS_AUTOCOMPLETE = new Set(["email", "password", "tel"]);

/**
 * Read a JSX opening tag by brace depth.
 *
 * Not a regex: `onChange={(e) => ...}` contains a `>`, so a `<[^>]*>` pattern
 * ends the tag in the middle of the handler and reports attributes missing that
 * are sitting three lines below. The first version of this sweep did exactly
 * that and produced a false positive on Auth.tsx's sign-in email field.
 */
function openingTags(source: string, name: string): string[] {
  const out: string[] = [];
  const open = new RegExp(`<${name}(?=[\\s/>])`, "g");
  let m: RegExpExecArray | null;
  while ((m = open.exec(source))) {
    let i = m.index;
    let depth = 0;
    let quote: string | null = null;
    for (; i < source.length; i++) {
      const c = source[i];
      if (quote) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    out.push(source.slice(m.index, i + 1));
  }
  return out;
}

function scan() {
  const files = execSync("find src -name '*.tsx' | grep -v '.test.'", {
    encoding: "utf8",
    cwd: ROOT,
  })
    .trim()
    .split("\n")
    .filter(Boolean);

  const missing: string[] = [];
  let checked = 0;

  for (const file of files) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    for (const tag of [...openingTags(source, "Input"), ...openingTags(source, "input")]) {
      const type = /type\s*=\s*"(\w+)"/.exec(tag)?.[1];
      if (!type || !NEEDS_AUTOCOMPLETE.has(type)) continue;
      checked++;
      if (!/autoComplete/.test(tag)) {
        const id = /id\s*=\s*"([^"]+)"/.exec(tag)?.[1] ?? "(no id)";
        missing.push(`${file} [type=${type}] ${id}`);
      }
    }
  }
  return { checked, missing };
}

describe("credential and contact inputs declare autoComplete", () => {
  const { checked, missing } = scan();

  it("found inputs to check", () => {
    // Assert the instrument: a parser change that stops matching <Input> would
    // otherwise report a clean sweep over nothing.
    expect(checked).toBeGreaterThanOrEqual(10);
  });

  it("every email, password and tel field says what it holds", () => {
    expect(missing).toEqual([]);
  });
});

describe("the change-password form is legible to a password manager", () => {
  const source = readFileSync(path.join(ROOT, "src/pages/dashboard/AccountSettings.tsx"), "utf8");

  it.each([
    ["currentPassword", "current-password"],
    ["newPassword", "new-password"],
    ["confirmPassword", "new-password"],
  ])("%s declares %s", (id, expected) => {
    const tag = openingTags(source, "Input").find((t) => t.includes(`id="${id}"`));
    expect(tag, `no <Input id="${id}">`).toBeDefined();
    expect(tag).toMatch(new RegExp(`autoComplete="${expected}"`));
  });

  // The delete-account confirmation is the one field that must NOT be filled
  // in for the user: typing the address deliberately is the confirmation.
  it("the delete-account confirmation opts out instead", () => {
    const tag = openingTags(source, "Input").find((t) => t.includes('id="confirm-email"'));
    expect(tag).toMatch(/autoComplete="off"/);
  });
});
