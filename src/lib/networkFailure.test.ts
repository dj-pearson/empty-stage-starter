import { describe, it, expect, afterEach, vi } from "vitest";
import {
  isBrowserOffline,
  isOfflineFailure,
  writeFailureMessage,
  userFacingError,
  OFFLINE_WRITE_MESSAGE,
  OFFLINE_MESSAGE,
} from "./networkFailure";

/** jsdom's navigator.onLine is a getter; override it for the duration of a test. */
function setOnLine(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

afterEach(() => {
  setOnLine(true);
  vi.restoreAllMocks();
});

describe("isBrowserOffline", () => {
  it("is false while the browser reports a connection", () => {
    setOnLine(true);
    expect(isBrowserOffline()).toBe(false);
  });

  it("is true in airplane mode", () => {
    setOnLine(false);
    expect(isBrowserOffline()).toBe(true);
  });
});

describe("isOfflineFailure", () => {
  it("is true whenever the browser is offline, whatever the error says", () => {
    setOnLine(false);
    expect(isOfflineFailure({ status: 500, message: "server exploded" })).toBe(true);
    expect(isOfflineFailure(null)).toBe(true);
  });

  // The captive-portal case: onLine is true, every fetch still throws. This is
  // the reason the message check exists at all.
  it.each([
    "TypeError: Failed to fetch",
    "NetworkError when attempting to fetch resource.",
    "Network request failed",
    "Load failed",
    "net::ERR_INTERNET_DISCONNECTED",
    "fetch failed",
  ])("recognises %j while navigator claims to be online", (message) => {
    setOnLine(true);
    expect(isOfflineFailure({ message })).toBe(true);
  });

  it("recognises GoTrue's retryable fetch error by name", () => {
    setOnLine(true);
    expect(isOfflineFailure({ name: "AuthRetryableFetchError", message: "" })).toBe(true);
  });

  it("accepts a bare string", () => {
    setOnLine(true);
    expect(isOfflineFailure("Failed to fetch")).toBe(true);
    expect(isOfflineFailure("duplicate key value")).toBe(false);
  });

  // The important negative. A response with a status means the request arrived,
  // so blaming the connection would hide a real server-side defect.
  it("is false for anything the server answered, even with fetch-ish wording", () => {
    setOnLine(true);
    expect(isOfflineFailure({ status: 500, message: "Failed to fetch upstream" })).toBe(false);
    expect(isOfflineFailure({ status: 403, message: "row-level security" })).toBe(false);
    expect(isOfflineFailure({ code: "23505", message: "duplicate key value" })).toBe(false);
  });

  it("is false for a missing error while online", () => {
    setOnLine(true);
    expect(isOfflineFailure(null)).toBe(false);
    expect(isOfflineFailure(undefined)).toBe(false);
  });

  it("survives a runtime with no navigator.onLine at all", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => undefined });
    expect(isBrowserOffline()).toBe(false);
    expect(isOfflineFailure({ code: "23505" })).toBe(false);
  });
});

describe("writeFailureMessage", () => {
  it("keeps the caller's wording when the server rejected the write", () => {
    setOnLine(true);
    expect(writeFailureMessage({ status: 403 }, "Couldn't delete that item.")).toBe(
      "Couldn't delete that item.",
    );
  });

  it("replaces 'try again' advice the user cannot act on when offline", () => {
    setOnLine(false);
    expect(writeFailureMessage({ status: 403 }, "Couldn't delete that item.")).toBe(
      OFFLINE_WRITE_MESSAGE,
    );
  });

  // The whole point: bare "try again" is advice an offline user cannot act on.
  // The replacement has to name the connection and say to reconnect first.
  it("names the connection instead of offering bare retry advice", () => {
    setOnLine(false);
    const message = writeFailureMessage(null, "Please try again.");
    expect(message).toMatch(/offline/i);
    expect(message).toMatch(/reconnect/i);
    expect(message).not.toBe("Please try again.");
  });
});


describe("userFacingError", () => {
  // The worst case this fixes: signing in with no connection. `fetch` throws
  // "TypeError: Failed to fetch" and that string was the entire description of
  // the toast -- at the one moment a user cannot get past.
  it("says you are offline instead of printing the fetch error", () => {
    setOnLine(false);
    expect(userFacingError(new TypeError("Failed to fetch"), "Could not sign you in.")).toBe(
      OFFLINE_MESSAGE,
    );
  });

  it("catches a captive portal too, where navigator still claims to be online", () => {
    setOnLine(true);
    expect(userFacingError({ message: "TypeError: Failed to fetch" }, "fallback")).toBe(
      OFFLINE_MESSAGE,
    );
  });

  // GoTrue writes these FOR the user. Swallowing them would make the sign-in
  // form less usable, not more -- "Something went wrong" is worse than
  // "Invalid login credentials".
  it.each([
    "Invalid login credentials",
    "Email not confirmed",
    "User already registered",
    "Password should be at least 6 characters",
  ])("passes a message written for the user straight through: %s", (message) => {
    setOnLine(true);
    expect(userFacingError({ message }, "fallback")).toBe(message);
  });

  // These reach the browser verbatim from PostgREST. They tell a parent
  // nothing and tell a bystander a table name.
  it.each([
    'new row violates row-level security policy for table "plan_entries"',
    'duplicate key value violates unique constraint "grocery_items_pkey"',
    'column foods.colour does not exist',
    "permission denied for table kids",
    'invalid input syntax for type uuid: "abc"',
  ])("replaces database internals with the caller's fallback: %s", (message) => {
    setOnLine(true);
    expect(userFacingError({ message }, "Could not save that.")).toBe("Could not save that.");
  });

  it("falls back when there is no message at all", () => {
    setOnLine(true);
    expect(userFacingError(null, "fallback")).toBe("fallback");
    expect(userFacingError({ message: "   " }, "fallback")).toBe("fallback");
    expect(userFacingError({}, "fallback")).toBe("fallback");
  });
});
