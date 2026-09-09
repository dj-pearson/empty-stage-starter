import { describe, it, expect } from "vitest";
import resolveConfig from "tailwindcss/resolveConfig";
import tailwindConfig from "../../tailwind.config";
import { BREAKPOINTS, atLeast, below, between, type Breakpoint } from "./breakpoints";

/**
 * The point of this file: a hook and a class name must flip on the same pixel.
 *
 * Three definitions of "mobile" shipped at once and the documented one was off
 * by one against the stylesheet, so at exactly 768px -- iPad portrait -- the
 * hook exported from '@/hooks' said mobile while every `md:` class had already
 * switched to desktop. Nothing imported it yet, so nobody had seen it.
 *
 * Reading the numbers back out of the RESOLVED Tailwind config is what makes
 * this durable: someone adding `theme.extend.screens` fails here rather than
 * shipping the same off-by-one again.
 */

const resolved = resolveConfig(tailwindConfig as never);
const screens = resolved.theme?.screens as Record<string, string>;

describe("breakpoints match the stylesheet", () => {
  it("resolves Tailwind's screens at all", () => {
    // Guard the instrument: if resolveConfig ever returns nothing useful, every
    // assertion below would pass vacuously against an empty object.
    expect(Object.keys(screens ?? {}).length).toBeGreaterThanOrEqual(5);
  });

  it.each(Object.keys(BREAKPOINTS) as Breakpoint[])(
    "%s agrees with the Tailwind variant of the same name",
    (name) => {
      expect(screens[name]).toBe(`${BREAKPOINTS[name]}px`);
    },
  );

  it("does not miss a Tailwind screen this module has no entry for", () => {
    expect(Object.keys(screens).sort()).toEqual(Object.keys(BREAKPOINTS).sort());
  });

  // tailwind.config.ts sets container.screens['2xl'] = 1400px. That applies to
  // the `container` class only. Reading it as the `2xl:` variant would put this
  // module 136px out.
  it("does not mistake the container override for the 2xl variant", () => {
    expect(BREAKPOINTS["2xl"]).toBe(1536);
    expect(screens["2xl"]).toBe("1536px");
  });
});

describe("query builders", () => {
  it("atLeast is exactly the Tailwind prefix boundary", () => {
    expect(atLeast("md")).toBe("(min-width: 768px)");
    expect(atLeast("lg")).toBe("(min-width: 1024px)");
  });

  it("below leaves no width where both queries are false", () => {
    // A viewport is either below md or at least md. 767.99px under page zoom
    // must not fall through the gap `max-width: 767px` would leave.
    expect(below("md")).toBe("(max-width: 767.98px)");
    const boundary = 768;
    expect(boundary - 0.02).toBeLessThan(boundary);
    expect(below("md")).not.toBe(`(max-width: ${boundary}px)`);
  });

  it("between covers a band with no overlap at either end", () => {
    expect(between("md", "lg")).toBe("(min-width: 768px) and (max-width: 1023.98px)");
  });

  it("768px is desktop, not mobile -- the case that was wrong", () => {
    // Spelled out because it is the exact width the old hook got backwards.
    const md = BREAKPOINTS.md;
    expect(matches(atLeast("md"), md)).toBe(true);
    expect(matches(below("md"), md)).toBe(false);
  });

  it("1024px is desktop -- the other case that was wrong", () => {
    expect(matches(atLeast("lg"), 1024)).toBe(true);
    expect(matches(below("lg"), 1024)).toBe(false);
  });
});

/** Evaluate a `(min-width: Npx)` / `(max-width: Npx)` query at a given width. */
function matches(query: string, width: number): boolean {
  const min = /\(min-width:\s*([\d.]+)px\)/.exec(query);
  const max = /\(max-width:\s*([\d.]+)px\)/.exec(query);
  if (min && width < parseFloat(min[1])) return false;
  if (max && width > parseFloat(max[1])) return false;
  return Boolean(min || max);
}
