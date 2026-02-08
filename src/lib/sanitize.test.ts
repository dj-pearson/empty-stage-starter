import { describe, it, expect } from "vitest";
import { sanitizeHtml, sanitizeText, sanitizeUrl, sanitizeObject } from "./sanitize";

describe("sanitizeHtml", () => {
  it("returns empty string for empty input", () => {
    expect(sanitizeHtml("")).toBe("");
    expect(sanitizeHtml(null as unknown as string)).toBe("");
    expect(sanitizeHtml(undefined as unknown as string)).toBe("");
  });

  it("preserves safe formatting tags", () => {
    const input = "<p>Hello <strong>world</strong> and <em>italic</em></p>";
    expect(sanitizeHtml(input)).toBe(input);
  });

  it("preserves headings", () => {
    const input = "<h1>Title</h1><h2>Subtitle</h2><h3>Section</h3>";
    expect(sanitizeHtml(input)).toBe(input);
  });

  it("preserves lists", () => {
    const input = "<ul><li>Item 1</li><li>Item 2</li></ul>";
    expect(sanitizeHtml(input)).toBe(input);
  });

  it("preserves links with href", () => {
    const input = '<a href="https://example.com">Link</a>';
    expect(sanitizeHtml(input)).toContain('href="https://example.com"');
    expect(sanitizeHtml(input)).toContain("Link");
  });

  it("preserves images with safe attributes", () => {
    const input = '<img src="https://example.com/img.webp" alt="Photo" width="300">';
    const result = sanitizeHtml(input);
    expect(result).toContain('src="https://example.com/img.webp"');
    expect(result).toContain('alt="Photo"');
  });

  it("strips script tags", () => {
    const input = '<p>Hello</p><script>alert("xss")</script>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert");
    expect(result).toContain("<p>Hello</p>");
  });

  it("strips iframe tags", () => {
    const input = '<iframe src="https://evil.com"></iframe><p>Content</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("<iframe");
    expect(result).toContain("<p>Content</p>");
  });

  it("strips object and embed tags", () => {
    const input = '<object data="evil.swf"></object><embed src="evil.swf"><p>Safe</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("<object");
    expect(result).not.toContain("<embed");
    expect(result).toContain("<p>Safe</p>");
  });

  it("strips form tags", () => {
    const input = '<form action="https://evil.com"><input type="text"><button>Submit</button></form><p>Content</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("<form");
    expect(result).toContain("<p>Content</p>");
  });

  it("strips event handler attributes", () => {
    const input = '<p onclick="alert(1)" onmouseover="steal()">Text</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("onmouseover");
    expect(result).toContain("<p>Text</p>");
  });

  it("strips style tags", () => {
    const input = '<style>body { background: url("evil.com") }</style><p>Content</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("<style");
    expect(result).toContain("<p>Content</p>");
  });

  it("strips javascript: protocol in href", () => {
    const input = '<a href="javascript:alert(1)">Click</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("javascript:");
  });

  it("strips data attributes", () => {
    const input = '<div data-secret="token123">Content</div>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("data-secret");
  });

  it("preserves table structure", () => {
    const input = "<table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>";
    expect(sanitizeHtml(input)).toBe(input);
  });
});

describe("sanitizeText", () => {
  it("returns empty string for empty input", () => {
    expect(sanitizeText("")).toBe("");
    expect(sanitizeText(null as unknown as string)).toBe("");
    expect(sanitizeText(undefined as unknown as string)).toBe("");
  });

  it("passes through plain text unchanged", () => {
    expect(sanitizeText("Hello world")).toBe("Hello world");
    expect(sanitizeText("Chicken Nuggets")).toBe("Chicken Nuggets");
  });

  it("strips all HTML tags", () => {
    const input = "<p>Hello <strong>world</strong></p>";
    const result = sanitizeText(input);
    expect(result).not.toContain("<p>");
    expect(result).not.toContain("<strong>");
    expect(result).toContain("Hello");
    expect(result).toContain("world");
  });

  it("strips script tags and their content", () => {
    const input = 'Hello<script>alert("xss")</script>World';
    const result = sanitizeText(input);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert");
  });

  it("handles special characters in food names", () => {
    // DOMPurify returns decoded text when all tags are stripped
    expect(sanitizeText("Mac & Cheese")).toBe("Mac & Cheese");
    expect(sanitizeText("PB&J Sandwich")).toBe("PB&J Sandwich");
  });

  it("strips all tags from XSS payload", () => {
    const input = '<img src=x onerror=alert(1)>';
    const result = sanitizeText(input);
    expect(result).not.toContain("<img");
    expect(result).not.toContain("onerror");
  });
});

describe("sanitizeUrl", () => {
  it("returns empty string for empty input", () => {
    expect(sanitizeUrl("")).toBe("");
    expect(sanitizeUrl(null as unknown as string)).toBe("");
    expect(sanitizeUrl(undefined as unknown as string)).toBe("");
  });

  it("allows https URLs", () => {
    expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
    expect(sanitizeUrl("https://example.com/path?q=1")).toBe("https://example.com/path?q=1");
  });

  it("allows http URLs", () => {
    expect(sanitizeUrl("http://example.com")).toBe("http://example.com");
  });

  it("allows mailto URLs", () => {
    expect(sanitizeUrl("mailto:user@example.com")).toBe("mailto:user@example.com");
  });

  it("allows tel URLs", () => {
    expect(sanitizeUrl("tel:+1234567890")).toBe("tel:+1234567890");
  });

  it("allows relative URLs", () => {
    expect(sanitizeUrl("/dashboard")).toBe("/dashboard");
    expect(sanitizeUrl("/blog/my-post")).toBe("/blog/my-post");
    expect(sanitizeUrl("./image.webp")).toBe("./image.webp");
  });

  it("allows hash-only URLs", () => {
    expect(sanitizeUrl("#section")).toBe("#section");
  });

  it("blocks javascript: protocol", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBe("");
    expect(sanitizeUrl("JAVASCRIPT:alert(1)")).toBe("");
    expect(sanitizeUrl("JavaScript:alert(1)")).toBe("");
  });

  it("blocks javascript: with whitespace tricks", () => {
    expect(sanitizeUrl("java\tscript:alert(1)")).toBe("");
    expect(sanitizeUrl("java\nscript:alert(1)")).toBe("");
    expect(sanitizeUrl("java script:alert(1)")).toBe("");
  });

  it("blocks data: protocol", () => {
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBe("");
    expect(sanitizeUrl("DATA:text/html,<script>alert(1)</script>")).toBe("");
  });

  it("blocks vbscript: protocol", () => {
    expect(sanitizeUrl("vbscript:msgbox(1)")).toBe("");
    expect(sanitizeUrl("VBSCRIPT:msgbox(1)")).toBe("");
  });

  it("blocks blob: protocol", () => {
    expect(sanitizeUrl("blob:https://example.com/uuid")).toBe("");
  });

  it("blocks unknown protocols", () => {
    expect(sanitizeUrl("ftp://files.example.com")).toBe("");
    expect(sanitizeUrl("file:///etc/passwd")).toBe("");
  });

  it("trims whitespace", () => {
    expect(sanitizeUrl("  https://example.com  ")).toBe("https://example.com");
  });

  it("rejects malformed URLs that aren't relative", () => {
    expect(sanitizeUrl("not a url at all")).toBe("");
  });
});

describe("sanitizeObject", () => {
  it("sanitizes string values", () => {
    const input = {
      name: '<script>alert("xss")</script>Apple',
      category: "fruit",
    };
    const result = sanitizeObject(input);
    expect(result.name).not.toContain("<script");
    expect(result.category).toBe("fruit");
  });

  it("preserves non-string values", () => {
    const input = {
      name: "Apple",
      calories: 95,
      is_safe: true,
      allergens: null as unknown as string,
    };
    const result = sanitizeObject(input);
    expect(result.name).toBe("Apple");
    expect(result.calories).toBe(95);
    expect(result.is_safe).toBe(true);
    expect(result.allergens).toBeNull();
  });

  it("sanitizes nested objects", () => {
    const input = {
      name: "Recipe",
      nutrition: {
        label: '<img src=x onerror=alert(1)>calories',
        value: 100,
      },
    };
    const result = sanitizeObject(input);
    expect((result.nutrition as Record<string, unknown>).label).not.toContain("<img");
    expect((result.nutrition as Record<string, unknown>).value).toBe(100);
  });

  it("sanitizes string values in arrays", () => {
    const input = {
      name: "Recipe",
      tags: ['<script>alert(1)</script>healthy', "quick"],
    };
    const result = sanitizeObject(input);
    expect((result.tags as string[])[0]).not.toContain("<script");
    expect((result.tags as string[])[1]).toBe("quick");
  });

  it("preserves non-string array values", () => {
    const input = {
      scores: [1, 2, 3],
      flags: [true, false],
    };
    const result = sanitizeObject(input);
    expect(result.scores).toEqual([1, 2, 3]);
    expect(result.flags).toEqual([true, false]);
  });
});
