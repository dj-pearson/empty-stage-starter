import { describe, it, expect } from "vitest";
import { bucketPickiness } from "./chainNetwork";
import { PICKINESS_LEVELS } from "./validations";

describe("bucketPickiness with the stored snake_case levels", () => {
  it("buckets every PICKINESS_LEVELS value", () => {
    expect(PICKINESS_LEVELS.map(bucketPickiness)).toEqual(["low", "medium", "high", "high"]);
  });

  it("still reads spaced and hyphenated spellings", () => {
    expect(bucketPickiness("Very Picky")).toBe("high");
    expect(bucketPickiness("not-picky")).toBe("low");
    expect(bucketPickiness(null)).toBe("unknown");
  });
});
