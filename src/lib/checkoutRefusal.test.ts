import { describe, expect, it } from "vitest";
import { readCheckoutRefusal } from "@/lib/checkoutRefusal";
import { EdgeFunctionError } from "@/lib/edge-functions";

describe("readCheckoutRefusal", () => {
  it("reads create-checkout's 409 off an EdgeFunctionError, with its source", () => {
    const err = new EdgeFunctionError("Edge Function 'create-checkout' failed: x", 409, {
      error: "You already have an active subscription",
      code: "already_subscribed",
      source: "comp",
    });
    expect(err.code).toBe("already_subscribed");
    expect(err.message).toBe("Edge Function 'create-checkout' failed: x");
    expect(readCheckoutRefusal(err)).toEqual({ kind: "alreadySubscribed", source: "comp" });
  });

  it("drops a source it does not know rather than trusting it", () => {
    const err = new EdgeFunctionError("m", 409, { code: "already_subscribed", source: "<script>" });
    expect(readCheckoutRefusal(err)).toEqual({ kind: "alreadySubscribed", source: null });
  });

  it("reads the 503 entitlement_unverified", () => {
    const err = new EdgeFunctionError("m", 503, { code: "entitlement_unverified" });
    expect(readCheckoutRefusal(err)).toEqual({ kind: "unverified" });
  });

  it("leaves every other failure to the caller's existing handling", () => {
    expect(readCheckoutRefusal(new EdgeFunctionError("m", 400, { code: "price_not_configured" }))).toBeNull();
    expect(readCheckoutRefusal(new Error("Failed to fetch"))).toBeNull();
    expect(readCheckoutRefusal(null)).toBeNull();
  });
});
