import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  calls: [] as Array<{ op: string; args: unknown[] }>,
  readResult: { data: null as unknown, error: null as unknown },
  upsertResult: { error: null as unknown },
  toastError: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const readBuilder = () => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit"]) {
      b[m] = (...args: unknown[]) => {
        h.calls.push({ op: m, args });
        return b;
      };
    }
    b.maybeSingle = async () => h.readResult;
    return b;
  };
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: "u1", email: "a@example.com" } } }) },
      from: (table: string) => {
        h.calls.push({ op: "from", args: [table] });
        const b = readBuilder();
        b.upsert = (...args: unknown[]) => {
          h.calls.push({ op: "upsert", args });
          // Awaitable with no .eq(): the old code chained .eq() after upsert.
          return {
            then: (resolve: (v: unknown) => unknown) => resolve(h.upsertResult),
            eq: (...eqArgs: unknown[]) => {
              h.calls.push({ op: "upsert.eq", args: eqArgs });
              return { then: (resolve: (v: unknown) => unknown) => resolve(h.upsertResult) };
            },
          };
        };
        return b;
      },
    },
  };
});
vi.mock("sonner", () => ({ toast: { error: h.toastError, success: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import {
  DEFAULT_EMAIL_SUBSCRIPTIONS,
  formatEmailStatus,
  getEmailSubscriptions,
  updateEmailSubscriptions,
} from "./email";
import * as emailModule from "./email";

beforeEach(() => {
  h.calls.length = 0;
  h.readResult = { data: null, error: null };
  h.upsertResult = { error: null };
  h.toastError.mockReset();
});

describe("updateEmailSubscriptions", () => {
  it("upserts on user_id with onConflict and no .eq()", async () => {
    const ok = await updateEmailSubscriptions({ marketing_emails: false });
    expect(ok).toBe(true);
    const upsert = h.calls.find((c) => c.op === "upsert");
    expect(upsert?.args[0]).toEqual({ user_id: "u1", marketing_emails: false });
    expect(upsert?.args[1]).toEqual({ onConflict: "user_id" });
    expect(h.calls.some((c) => c.op === "upsert.eq")).toBe(false);
  });

  it("clears unsubscribed_at when a category is switched on", async () => {
    await updateEmailSubscriptions({ weekly_summary: true });
    const upsert = h.calls.find((c) => c.op === "upsert");
    expect(upsert?.args[0]).toEqual({ user_id: "u1", weekly_summary: true, unsubscribed_at: null });
  });

  it("leaves unsubscribed_at alone when switching off", async () => {
    await updateEmailSubscriptions({ weekly_summary: false });
    const upsert = h.calls.find((c) => c.op === "upsert");
    expect(upsert?.args[0]).not.toHaveProperty("unsubscribed_at");
  });

  it("returns false and raises an error toast when the write fails", async () => {
    h.upsertResult = { error: { message: "denied" } };
    expect(await updateEmailSubscriptions({ weekly_summary: true })).toBe(false);
    expect(h.toastError).toHaveBeenCalledTimes(1);
  });
});

describe("getEmailSubscriptions", () => {
  it("maps a missing row to the column defaults", async () => {
    h.readResult = { data: null, error: null };
    const result = await getEmailSubscriptions();
    expect(result).toEqual({ status: "missing", prefs: DEFAULT_EMAIL_SUBSCRIPTIONS, unsubscribedAt: null });
    expect(DEFAULT_EMAIL_SUBSCRIPTIONS).toEqual({
      welcome_emails: true,
      milestone_emails: true,
      weekly_summary: true,
      tips_and_advice: true,
      marketing_emails: false,
    });
  });

  it("returns the row and its unsubscribed_at", async () => {
    h.readResult = {
      data: {
        welcome_emails: false,
        milestone_emails: false,
        weekly_summary: false,
        tips_and_advice: false,
        marketing_emails: false,
        unsubscribed_at: "2026-09-01T10:00:00Z",
      },
      error: null,
    };
    const result = await getEmailSubscriptions();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.prefs.weekly_summary).toBe(false);
      expect(result.unsubscribedAt).toBe("2026-09-01T10:00:00Z");
    }
  });

  it("reads a null column as its default", async () => {
    h.readResult = {
      data: {
        welcome_emails: null,
        milestone_emails: true,
        weekly_summary: true,
        tips_and_advice: true,
        marketing_emails: null,
        unsubscribed_at: null,
      },
      error: null,
    };
    const result = await getEmailSubscriptions();
    expect(result.status === "ok" && result.prefs.welcome_emails).toBe(true);
    expect(result.status === "ok" && result.prefs.marketing_emails).toBe(false);
  });

  it("reports a read error as error, not as defaults", async () => {
    h.readResult = { data: null, error: { message: "boom" } };
    expect(await getEmailSubscriptions()).toEqual({ status: "error" });
  });
});

describe("formatEmailStatus", () => {
  it("returns a Badge variant and an icon name, no color classes or glyphs", () => {
    for (const status of ["sent", "pending", "failed", "cancelled", "weird"]) {
      const out = formatEmailStatus(status);
      expect(["default", "secondary", "destructive", "outline"]).toContain(out.variant);
      expect(out.icon).toMatch(/^[A-Z][A-Za-z0-9]+$/);
      expect(Object.keys(out).sort()).toEqual(["defaultLabel", "icon", "labelKey", "variant"]);
      expect(out.defaultLabel).toMatch(/^[A-Za-z ]+$/);
    }
  });
});

describe("parent path", () => {
  it("no longer exports sendTestEmail", () => {
    expect("sendTestEmail" in emailModule).toBe(false);
  });
});
