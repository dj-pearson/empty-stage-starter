// Vitest mirror for the edge function's AI Coach limit gate, so the decision
// runs in CI without Deno. Deno twin: supabase/functions/_shared/aiCoachGate.test.ts
import { describe, expect, it } from "vitest";
import {
  AI_COACH_LIMIT_CODE,
  AI_COACH_LIMIT_UNAVAILABLE_CODE,
  classifyCoachClient,
  runCoachTurn,
  type CoachClient,
  type LimitLookup,
} from "../../supabase/functions/_shared/aiCoachGate";
import { AI_COACH_CLIENT_HEADERS } from "@/lib/aiCoachClient";

const WEB: CoachClient = { kind: "web", version: 1 };
const LEGACY: CoachClient = { kind: "legacy" };
const UNDER: LimitLookup = { ok: true, result: { allowed: true, limit: 10, current: 3 } };
const OVER: LimitLookup = { ok: true, result: { allowed: false, limit: 10, current: 10 } };
const FREE: LimitLookup = { ok: true, result: { allowed: false, limit: 0, current: 0 } };
const FAILED: LimitLookup = { ok: false };

function harness(client: CoachClient, lookup: LimitLookup | "throw", flag: boolean | "throw", modelFails = false) {
  const order: string[] = [];
  const calls = { generate: 0, increment: 0, flagReads: 0 };
  const run = () =>
    runCoachTurn({
      client,
      checkLimit: () => {
        order.push("check");
        return lookup === "throw" ? Promise.reject(new Error("rpc down")) : Promise.resolve(lookup);
      },
      readEnforceLegacy: () => {
        calls.flagReads += 1;
        return flag === "throw" ? Promise.reject(new Error("flag read")) : Promise.resolve(flag);
      },
      generate: () => {
        order.push("generate");
        calls.generate += 1;
        return modelFails ? Promise.reject(new Error("provider 500")) : Promise.resolve("reply");
      },
      incrementUsage: () => {
        order.push("increment");
        calls.increment += 1;
        return Promise.resolve();
      },
    });
  return { calls, order, run };
}

describe("classifyCoachClient", () => {
  it("reads the header the web app actually sends as web", () => {
    expect(classifyCoachClient(AI_COACH_CLIENT_HEADERS["X-Client-Info"])).toEqual({ kind: "web", version: 1 });
  });

  it("treats the bare global header as web and everything else as legacy", () => {
    expect(classifyCoachClient("eatpal-web")).toEqual({ kind: "web", version: 0 });
    expect(classifyCoachClient(null)).toEqual({ kind: "legacy" });
    expect(classifyCoachClient("")).toEqual({ kind: "legacy" });
    expect(classifyCoachClient("supabase-js-web/2.57.0")).toEqual({ kind: "legacy" });
    expect(classifyCoachClient("eatpal-webby")).toEqual({ kind: "legacy" });
  });
});

describe("runCoachTurn", () => {
  it("web over the limit: 402 ai_coach_limit, model never called, nothing metered", async () => {
    const h = harness(WEB, OVER, false);
    const out = await h.run();
    expect(out.kind).toBe("refused");
    if (out.kind !== "refused") return;
    expect(out.decision.status).toBe(402);
    expect(out.decision.body).toMatchObject({ code: AI_COACH_LIMIT_CODE, limit: 10, current: 10 });
    expect(h.calls).toEqual({ generate: 0, increment: 0, flagReads: 0 });
  });

  it("web on a Free plan (limit 0) is refused with 402", async () => {
    const out = await harness(WEB, FREE, false).run();
    expect(out.kind === "refused" && out.decision.status).toBe(402);
  });

  it("web under the limit: allowed and incremented once, after the reply", async () => {
    const h = harness(WEB, UNDER, false);
    const out = await h.run();
    expect(out).toMatchObject({ kind: "replied", value: "reply", reason: "within_limit", metered: true });
    expect(h.order).toEqual(["check", "generate", "increment"]);
    expect(h.calls.increment).toBe(1);
  });

  it("legacy over the limit with the flag off: allowed and metered", async () => {
    const h = harness(LEGACY, OVER, false);
    const out = await h.run();
    expect(out).toMatchObject({ kind: "replied", reason: "legacy_grace" });
    expect(h.calls).toEqual({ generate: 1, increment: 1, flagReads: 1 });
  });

  it("legacy over the limit with the flag on: 402", async () => {
    const h = harness(LEGACY, OVER, true);
    const out = await h.run();
    expect(out.kind === "refused" && out.decision.status).toBe(402);
    expect(h.calls.generate).toBe(0);
  });

  it("legacy under the limit is metered and never reads the flag", async () => {
    const h = harness(LEGACY, UNDER, true);
    await h.run();
    expect(h.calls).toEqual({ generate: 1, increment: 1, flagReads: 0 });
  });

  it("model failure: the error propagates and nothing is metered", async () => {
    for (const client of [WEB, LEGACY]) {
      const h = harness(client, UNDER, false, true);
      await expect(h.run()).rejects.toThrow("provider 500");
      expect(h.calls.increment).toBe(0);
    }
  });

  it("check RPC error: web fails closed with 503 and a code that is not the limit code", async () => {
    for (const lookup of [FAILED, "throw"] as const) {
      const h = harness(WEB, lookup, false);
      const out = await h.run();
      expect(out.kind).toBe("refused");
      if (out.kind !== "refused") continue;
      expect(out.decision.status).toBe(503);
      expect(out.decision.body.code).toBe(AI_COACH_LIMIT_UNAVAILABLE_CODE);
      expect(h.calls.generate).toBe(0);
    }
  });

  it("check RPC error: legacy is allowed and metered during grace, refused after", async () => {
    const grace = harness(LEGACY, "throw", false);
    expect((await grace.run()).kind).toBe("replied");
    expect(grace.calls.increment).toBe(1);

    const after = harness(LEGACY, FAILED, true);
    const out = await after.run();
    expect(out.kind === "refused" && out.decision.status).toBe(503);
  });

  it("a failed flag read keeps the grace period", async () => {
    const out = await harness(LEGACY, OVER, "throw").run();
    expect(out.kind).toBe("replied");
  });

  it("a failed increment does not fail a reply that already exists", async () => {
    const out = await runCoachTurn({
      client: WEB,
      checkLimit: () => Promise.resolve(UNDER),
      readEnforceLegacy: () => Promise.resolve(false),
      generate: () => Promise.resolve("reply"),
      incrementUsage: () => Promise.reject(new Error("db")),
    });
    expect(out).toMatchObject({ kind: "replied", metered: false });
  });
});
