import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import "@/i18n";
import "@/i18n/appLocale";
import type { Kid } from "@/types";

// ---------------------------------------------------------------------------
// Supabase: a chainable fake that records each resolved call.
// ---------------------------------------------------------------------------

interface Call {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload: unknown;
  filters: Array<[string, unknown]>;
}

interface Row {
  [key: string]: unknown;
}

const db = vi.hoisted(() => ({
  calls: [] as Call[],
  conversations: [] as Row[],
  messages: {} as Record<string, Row[]>,
  seq: 0,
  failConversationInsert: false,
}));

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => {
  function from(table: string) {
    const state: Call = { table, op: "select", payload: null, filters: [] };
    const resolve = (single: boolean) => {
      db.calls.push({ ...state, filters: [...state.filters] });
      const now = new Date().toISOString();
      if (state.op === "insert") {
        const input = (state.payload as Row[])[0];
        db.seq += 1;
        if (table === "ai_coach_conversations") {
          const row = { id: `conv-new-${db.seq}`, is_archived: false, created_at: now, updated_at: now, ...input };
          return Promise.resolve({ data: single ? row : [row], error: null });
        }
        const row = { id: `msg-${db.seq}`, created_at: now, ...input };
        return Promise.resolve({ data: single ? row : [row], error: null });
      }
      if (state.op === "update" || state.op === "delete") return Promise.resolve({ data: null, error: null });
      if (table === "ai_coach_conversations") return Promise.resolve({ data: db.conversations, error: null });
      const convId = state.filters.find(([c]) => c === "conversation_id")?.[1] as string;
      return Promise.resolve({ data: db.messages[convId] ?? [], error: null });
    };
    const b = {
      select: () => b,
      insert: (payload: unknown) => {
        state.op = "insert";
        state.payload = payload;
        return b;
      },
      update: (payload: unknown) => {
        state.op = "update";
        state.payload = payload;
        return b;
      },
      delete: () => {
        state.op = "delete";
        return b;
      },
      eq: (col: string, val: unknown) => {
        state.filters.push([col, val]);
        return b;
      },
      order: () => b,
      limit: () => b,
      single: () => resolve(true),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => resolve(false).then(ok, bad),
    };
    return b;
  }
  return { supabase: { from, functions: { invoke } } };
});

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

const kidA = {
  id: "kid-a",
  name: "Emma",
  allergens: ["peanut"],
  allergen_severity: { peanut: "severe" },
  date_of_birth: "2021-01-15",
} as unknown as Kid;
// allergens absent = never recorded.
const kidB = { id: "kid-b", name: "Liam", date_of_birth: "2022-03-01" } as unknown as Kid;

const app = vi.hoisted(() => ({ activeKidId: "kid-a" as string | null, kids: [] as unknown[] }));

vi.mock("@/contexts/AppContext", () => ({
  useKids: () => ({ activeKidId: app.activeKidId, kids: app.kids }),
  useFoods: () => ({ foods: [] }),
  usePlan: () => ({ planEntries: [] }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ userId: "user-1", householdId: "hh-1" }) }));

const ladderCalls = vi.hoisted(() => [] as Array<string | null | undefined>);
vi.mock("@/hooks/useFoodLadder", () => {
  const empty = { rows: [], addFoodToLadder: async () => true };
  return {
    useFoodLadder: (kidId: string | null | undefined) => {
      ladderCalls.push(kidId);
      return empty;
    },
  };
});

const online = vi.hoisted(() => ({ value: true }));
vi.mock("@/hooks/useCommon", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useCommon")>()),
  useOnline: () => online.value,
}));

const toastMock = vi.hoisted(() => {
  const fn = vi.fn() as ReturnType<typeof vi.fn> & { error: ReturnType<typeof vi.fn>; success: ReturnType<typeof vi.fn> };
  fn.error = vi.fn();
  fn.success = vi.fn();
  return fn;
});
vi.mock("sonner", () => ({ toast: toastMock }));

// P3 header and chips: stubbed so this file tests the thread, not the chips.
vi.mock("@/components/aiCoach/CoachKidHeader", () => ({
  CoachKidHeader: ({ kid }: { kid?: { id: string } }) => <div data-testid="kid-header">{kid?.id ?? "none"}</div>,
}));
vi.mock("@/components/aiCoach/CoachActionChips", () => ({ CoachActionChips: () => null }));
vi.mock("@/hooks/useCoachActions", () => {
  const empty = new Set<string>();
  const result = { actionsFor: () => [], run: async () => {}, pending: empty, done: empty };
  return { useCoachActions: () => result };
});

import { AIMealCoach } from "./AIMealCoach";

// ---------------------------------------------------------------------------

const textbox = () => screen.getByRole("textbox", { name: "Message the coach" });
const sendButton = () => screen.getByRole("button", { name: "Send message" });
const callsFor = (table: string, op: Call["op"]) => db.calls.filter((c) => c.table === table && c.op === op);

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function type(text: string) {
  fireEvent.change(textbox(), { target: { value: text } });
}

async function renderReady() {
  const utils = render(<AIMealCoach />);
  await waitFor(() => expect(callsFor("ai_coach_conversations", "select").length).toBeGreaterThan(0));
  return utils;
}

function invokeBody(n = 0) {
  return invoke.mock.calls[n][1].body as {
    messages: Array<{ role: string; content: string }>;
    kidContext: Record<string, unknown> | null;
  };
}

beforeEach(() => {
  db.calls = [];
  db.conversations = [];
  db.messages = {};
  db.seq = 0;
  app.activeKidId = "kid-a";
  app.kids = [kidA, kidB];
  online.value = true;
  ladderCalls.length = 0;
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { message: "Try **carrots** next to pasta.", model: "m-1" }, error: null });
  toastMock.mockClear();
  toastMock.error.mockClear();
  toastMock.success.mockClear();
  try {
    localStorage.clear();
  } catch {
    // no storage in this environment
  }
});

describe("AIMealCoach composer and first send", () => {
  it("shows the composer with no conversation and creates one conversation then one user row, even on a double click", async () => {
    await renderReady();
    expect(textbox()).toBeInTheDocument();

    type("She only eats beige food");
    fireEvent.click(sendButton());
    fireEvent.click(sendButton());

    await waitFor(() => expect(screen.getByText("carrots")).toBeInTheDocument());
    const convInserts = callsFor("ai_coach_conversations", "insert");
    expect(convInserts).toHaveLength(1);
    expect((convInserts[0].payload as Row[])[0]).toMatchObject({ user_id: "user-1", kid_id: "kid-a" });
    const msgInserts = callsFor("ai_coach_messages", "insert");
    expect(msgInserts.map((c) => (c.payload as Row[])[0].role)).toEqual(["user", "assistant"]);
    expect(invoke).toHaveBeenCalledTimes(1);
    // The conversation insert resolved before the user row.
    const convIdx = db.calls.findIndex((c) => c.table === "ai_coach_conversations" && c.op === "insert");
    const userIdx = db.calls.findIndex((c) => c.table === "ai_coach_messages" && c.op === "insert");
    expect(convIdx).toBeLessThan(userIdx);
  });

  it("sends no name, redacts names, marks unknown allergies and keeps family data out of the stored row", async () => {
    app.activeKidId = "kid-b";
    await renderReady();
    type("How do I get Liam to try broccoli? Emma eats it.");
    fireEvent.click(sendButton());
    await waitFor(() => expect(invoke).toHaveBeenCalled());

    const body = invokeBody();
    expect(body.kidContext).not.toBeNull();
    expect(Object.keys(body.kidContext ?? {})).not.toContain("name");
    const allergens = body.kidContext?.allergens as string[];
    expect(allergens[0].startsWith("NOT RECORDED")).toBe(true);
    for (const m of body.messages) {
      expect(m.content).not.toMatch(/Liam|Emma/);
    }
    const last = body.messages[body.messages.length - 1];
    expect(last.content).toContain("<family_data>");

    await waitFor(() => expect(callsFor("ai_coach_messages", "insert")).toHaveLength(2));
    const [userInsert, aiInsert] = callsFor("ai_coach_messages", "insert").map((c) => (c.payload as Row[])[0]);
    expect(userInsert.content).toBe("How do I get Liam to try broccoli? Emma eats it.");
    expect(String(userInsert.content)).not.toContain("<family_data>");
    expect(JSON.stringify(aiInsert.context_snapshot)).not.toMatch(/Liam|Emma|"name":"Liam"/);
    expect(aiInsert.context_snapshot).toMatchObject({ v: 1 });
  });

  it("no success toast fires on a reply", async () => {
    await renderReady();
    type("Refuses vegetables");
    fireEvent.click(sendButton());
    await waitFor(() => expect(screen.getByText("carrots")).toBeInTheDocument());
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });
});

describe("AIMealCoach failed send", () => {
  it("deletes the orphan user row, restores the draft, retries, and never toasts raw error text", async () => {
    db.conversations = [
      { id: "conv-1", conversation_title: "Beige food", kid_id: "kid-a", updated_at: "2026-09-20T10:00:00Z", created_at: "2026-09-20T10:00:00Z", is_archived: false },
    ];
    db.messages["conv-1"] = [];
    invoke.mockResolvedValueOnce({ data: { error: "Edge function exploded", details: "stack details here" }, error: null });

    await renderReady();
    fireEvent.click(await screen.findByRole("button", { name: /^Beige food/ }));
    await waitFor(() => expect(textbox()).toBeEnabled());

    type("Help with dinner");
    fireEvent.click(sendButton());

    await waitFor(() => expect(callsFor("ai_coach_messages", "delete")).toHaveLength(1));
    // The existing thread needs no conversation insert, so the user row is the first insert.
    const savedId = "msg-1";
    expect(callsFor("ai_coach_messages", "delete")[0].filters).toContainEqual(["id", savedId]);

    await waitFor(() => expect(textbox()).toHaveValue("Help with dinner"));
    for (const call of toastMock.error.mock.calls) {
      expect(String(call[0])).not.toMatch(/Edge function|details/);
    }
    expect(toastMock.error).toHaveBeenCalledTimes(1);

    const retry = await screen.findByRole("button", { name: "Retry" });
    fireEvent.click(retry);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(invokeBody(1).messages.at(-1)?.content).toContain("Help with dinner");
    await waitFor(() => expect(screen.getByText("carrots")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});

describe("AIMealCoach threads", () => {
  it("switching threads mid-send leaves the new thread's messages untouched", async () => {
    db.conversations = [
      { id: "conv-1", conversation_title: "First", kid_id: "kid-a", updated_at: "2026-09-21T10:00:00Z", created_at: "2026-09-21T10:00:00Z", is_archived: false },
      { id: "conv-2", conversation_title: "Second", kid_id: "kid-a", updated_at: "2026-09-20T10:00:00Z", created_at: "2026-09-20T10:00:00Z", is_archived: false },
    ];
    db.messages["conv-1"] = [];
    db.messages["conv-2"] = [
      { id: "m2", role: "assistant", content: "Old advice for thread two", created_at: "2026-09-20T10:00:00Z" },
    ];
    const pending = deferred<{ data: unknown; error: null }>();
    invoke.mockReturnValueOnce(pending.promise);

    await renderReady();
    fireEvent.click(await screen.findByRole("button", { name: /^First/ }));
    await waitFor(() => expect(textbox()).toBeEnabled());
    type("Question in thread one");
    fireEvent.click(sendButton());
    await waitFor(() => expect(invoke).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /^Second/ }));
    await screen.findByText("Old advice for thread two");

    await act(async () => {
      pending.resolve({ data: { message: "Late reply for thread one", model: "m" }, error: null });
      await pending.promise;
    });
    await waitFor(() => expect(callsFor("ai_coach_messages", "insert")).toHaveLength(2));

    expect(screen.getByText("Old advice for thread two")).toBeInTheDocument();
    expect(screen.queryByText("Late reply for thread one")).not.toBeInTheDocument();
    expect(screen.queryByText("Question in thread one")).not.toBeInTheDocument();
  });

  it("a thread pinned to kid B while A is active builds context from B and says so", async () => {
    db.conversations = [
      { id: "conv-b", conversation_title: "About B", kid_id: "kid-b", updated_at: "2026-09-21T10:00:00Z", created_at: "2026-09-21T10:00:00Z", is_archived: false },
    ];
    db.messages["conv-b"] = [];
    await renderReady();
    fireEvent.click(await screen.findByRole("button", { name: /^About B/ }));

    await waitFor(() => expect(screen.getByTestId("kid-header")).toHaveTextContent("kid-b"));
    expect(ladderCalls.at(-1)).toBe("kid-b");
    expect(screen.getByText(/This conversation is about Liam/)).toBeInTheDocument();

    await waitFor(() => expect(textbox()).toBeEnabled());
    type("What next?");
    fireEvent.click(sendButton());
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect((invokeBody().kidContext?.allergens as string[])[0].startsWith("NOT RECORDED")).toBe(true);
  });

  it("archives on delete, restores on Undo, and never nests a button in a button", async () => {
    db.conversations = [
      { id: "conv-1", conversation_title: "Veggies", kid_id: "kid-a", updated_at: "2026-09-21T10:00:00Z", created_at: "2026-09-21T10:00:00Z", is_archived: false },
    ];
    const { container } = await renderReady();
    await screen.findByRole("button", { name: /^Veggies/ });
    expect(container.querySelector("button button")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Delete conversation Veggies" }));
    await waitFor(() => expect(callsFor("ai_coach_conversations", "update")).toHaveLength(1));
    expect(callsFor("ai_coach_conversations", "update")[0].payload).toEqual({ is_archived: true });
    expect(callsFor("ai_coach_conversations", "delete")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /^Veggies/ })).not.toBeInTheDocument();

    const options = toastMock.mock.calls[0][1] as { action: { label: string; onClick: () => Promise<void> } };
    expect(options.action.label).toBe("Undo");
    await act(async () => {
      await options.action.onClick();
    });
    expect(callsFor("ai_coach_conversations", "update")[1].payload).toEqual({ is_archived: false });
    expect(await screen.findByRole("button", { name: /^Veggies/ })).toBeInTheDocument();
    // The toast closing after Undo must not delete what Undo brought back.
    (options as unknown as { onDismiss: () => void }).onDismiss();
    expect(callsFor("ai_coach_conversations", "delete")).toHaveLength(0);
  });

  it("really deletes the conversation once the Undo toast closes without Undo", async () => {
    db.conversations = [
      { id: "conv-1", conversation_title: "Veggies", kid_id: "kid-a", updated_at: "2026-09-21T10:00:00Z", created_at: "2026-09-21T10:00:00Z", is_archived: false },
    ];
    await renderReady();
    fireEvent.click(await screen.findByRole("button", { name: "Delete conversation Veggies" }));
    await waitFor(() => expect(callsFor("ai_coach_conversations", "update")).toHaveLength(1));
    const options = toastMock.mock.calls[0][1] as { onAutoClose: () => void; onDismiss: () => void };
    options.onAutoClose();
    options.onDismiss();
    await waitFor(() => expect(callsFor("ai_coach_conversations", "delete")).toHaveLength(1));
    expect(callsFor("ai_coach_conversations", "delete")[0].filters).toContainEqual(["id", "conv-1"]);
  });
});

describe("AIMealCoach composer keys and offline", () => {
  it("disables send and says so when offline", async () => {
    online.value = false;
    await renderReady();
    type("Hello");
    expect(sendButton()).toBeDisabled();
    expect(screen.getByText("You're offline. Reconnect to send.")).toBeInTheDocument();
  });

  it("Enter while composing or with Shift does not send; plain Enter does", async () => {
    await renderReady();
    type("Broccoli ideas");
    fireEvent.keyDown(textbox(), { key: "Enter", isComposing: true });
    fireEvent.keyDown(textbox(), { key: "Enter", shiftKey: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(callsFor("ai_coach_conversations", "insert")).toHaveLength(0);

    fireEvent.keyDown(textbox(), { key: "Enter" });
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
  });

  it("pins the emergency card above a red-flag question before the reply arrives", async () => {
    const pending = deferred<{ data: unknown; error: null }>();
    invoke.mockReturnValueOnce(pending.promise);
    await renderReady();
    type("He is choking on a grape");
    fireEvent.click(sendButton());
    expect(await screen.findByText(/call 911 now/)).toBeInTheDocument();
    // The reply is still pending: the card does not wait for the model.
    expect(callsFor("ai_coach_messages", "insert").map((c) => (c.payload as Row[])[0].role)).not.toContain("assistant");
    await act(async () => {
      pending.resolve({ data: { message: "ok", model: "m" }, error: null });
      await pending.promise;
    });
  });

  it("starter chips send immediately", async () => {
    await renderReady();
    const starters = screen.getByRole("button", { name: "Only eats beige food" });
    fireEvent.click(starters);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    const log = await screen.findByRole("log");
    expect(within(log).getByText("Only eats beige food")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Server-side daily limit (owner decision 1a): the web identifies itself so
// ai-coach-chat enforces the limit, and a refusal leaves past advice readable.
// ---------------------------------------------------------------------------

function httpError(status: number, body: unknown) {
  const response = { status, clone: () => ({ json: async () => body }) };
  return { name: "FunctionsHttpError", message: "Edge Function returned a non-2xx status code", context: response };
}

describe("AIMealCoach server-side daily limit", () => {
  const pastThread = () => {
    db.conversations = [
      { id: "conv-1", conversation_title: "Beige food", kid_id: "kid-a", updated_at: "2026-09-20T10:00:00Z", created_at: "2026-09-20T10:00:00Z", is_archived: false },
    ];
    db.messages["conv-1"] = [
      { id: "old-u", role: "user", content: "Only eats pasta", created_at: "2026-09-20T10:00:00Z" },
      { id: "old-a", role: "assistant", content: "Put one pea beside the pasta.", created_at: "2026-09-20T10:00:05Z" },
    ];
  };

  it("sends the web client header on every coach call", async () => {
    await renderReady();
    type("Refuses vegetables");
    fireEvent.click(sendButton());
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke.mock.calls[0][0]).toBe("ai-coach-chat");
    expect(invoke.mock.calls[0][1].headers).toEqual({ "X-Client-Info": "eatpal-web/1" });
  });

  it("a 402 ai_coach_limit reports the limit, removes the unanswered row and keeps past advice on screen", async () => {
    pastThread();
    const onLimitReached = vi.fn();
    invoke.mockResolvedValueOnce({
      data: null,
      error: httpError(402, { error: "Daily AI Coach limit reached.", code: "ai_coach_limit", limit: 5, current: 5 }),
    });
    render(<AIMealCoach onLimitReached={onLimitReached} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Beige food/ }));
    expect(await screen.findByText("Put one pea beside the pasta.")).toBeInTheDocument();
    await waitFor(() => expect(textbox()).toBeEnabled());

    type("What about carrots?");
    fireEvent.click(sendButton());

    await waitFor(() => expect(onLimitReached).toHaveBeenCalledTimes(1));
    expect(toastMock.error).toHaveBeenCalledWith("You've used today's coach questions. Past answers are still here.");
    expect(callsFor("ai_coach_messages", "delete")).toHaveLength(1);
    expect(callsFor("ai_coach_messages", "insert").map((c) => (c.payload as Row[])[0].role)).toEqual(["user"]);
    expect(screen.getByText("Put one pea beside the pasta.")).toBeInTheDocument();
  });

  it("a 503 from a failed plan check reads as busy, not as a used-up quota", async () => {
    const onLimitReached = vi.fn();
    invoke.mockResolvedValueOnce({
      data: null,
      error: httpError(503, { error: "Could not check your AI Coach plan.", code: "ai_coach_limit_unavailable" }),
    });
    render(<AIMealCoach onLimitReached={onLimitReached} />);
    await waitFor(() => expect(callsFor("ai_coach_conversations", "select").length).toBeGreaterThan(0));
    type("Help");
    fireEvent.click(sendButton());
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    expect(toastMock.error).toHaveBeenCalledWith("The coach is busy right now. Try again in a minute.");
    expect(onLimitReached).not.toHaveBeenCalled();
  });

  it("when exhausted, the composer is closed with a notice and past conversations stay readable", async () => {
    pastThread();
    render(<AIMealCoach exhausted />);
    fireEvent.click(await screen.findByRole("button", { name: /^Beige food/ }));
    expect(await screen.findByText("Put one pea beside the pasta.")).toBeInTheDocument();
    expect(
      screen.getByText("You've used today's coach questions. Your past conversations are still here."),
    ).toBeInTheDocument();
    type("One more?");
    expect(sendButton()).toBeDisabled();
    expect(invoke).not.toHaveBeenCalled();
  });
});
