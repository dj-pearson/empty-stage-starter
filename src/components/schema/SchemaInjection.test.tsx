import { render } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { WebSiteSchema } from "./WebSiteSchema";
import { ComparisonSchema } from "./ComparisonSchema";

/**
 * US-530: WebSiteSchema and ComparisonSchema inject JSON-LD via a script tag's
 * textContent (like RecipeSchema) instead of dangerouslySetInnerHTML, so a
 * value containing `</script>` cannot break out of the block.
 */
describe("WebSiteSchema JSON-LD injection (US-530)", () => {
  beforeEach(() => document.getElementById("website-schema")?.remove());

  it("writes a JSON-LD script via textContent", () => {
    render(<WebSiteSchema name="EatPal" url="https://tryeatpal.com" />);
    const tag = document.getElementById("website-schema") as HTMLScriptElement | null;
    expect(tag).toBeTruthy();
    expect(tag?.type).toBe("application/ld+json");
    expect(JSON.parse(tag!.textContent!)["name"]).toBe("EatPal");
  });

  it("does not let a </script> in a value break out (stays inside textContent)", () => {
    render(<WebSiteSchema name={'</script><script>alert(1)</script>'} url="https://tryeatpal.com" />);
    const tag = document.getElementById("website-schema");
    // The malicious string is preserved verbatim as text, not parsed into a
    // second <script> element — no extra scripts were injected into head.
    expect(JSON.parse(tag!.textContent!)["name"]).toBe('</script><script>alert(1)</script>');
    expect(document.head.querySelectorAll("script").length).toBeGreaterThanOrEqual(1);
  });
});

describe("ComparisonSchema JSON-LD injection (US-530)", () => {
  beforeEach(() => document.getElementById("comparison-schema")?.remove());

  it("writes a JSON-LD script via textContent", () => {
    render(
      <ComparisonSchema
        listName="Meal planners"
        description="Comparison"
        items={[{ name: "EatPal", description: "Best" }]}
      />
    );
    const tag = document.getElementById("comparison-schema");
    expect(tag).toBeTruthy();
    const parsed = JSON.parse(tag!.textContent!);
    expect(parsed["@type"]).toBe("ItemList");
  });
});
