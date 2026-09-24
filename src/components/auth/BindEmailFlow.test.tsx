import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";

// input-otp's password-manager badge probe calls document.elementFromPoint on
// a timer, which jsdom does not implement (same shim as Auth.otp.test.tsx).
if (typeof document.elementFromPoint !== "function") {
  document.elementFromPoint = () => null;
}

const h = vi.hoisted(() => ({
  updateUser: vi.fn(),
  refreshSession: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { updateUser: h.updateUser, refreshSession: h.refreshSession } },
}));
vi.mock("@/lib/edge-functions", () => ({ invokeEdgeFunction: h.invoke }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BindEmailFlow } from "./BindEmailFlow";

beforeEach(() => {
  h.updateUser.mockReset().mockResolvedValue({ error: null });
  h.refreshSession.mockReset().mockResolvedValue({ data: {}, error: null });
  h.invoke.mockReset();
  sessionStorage.clear();
});

describe("BindEmailFlow password step", () => {
  it("rejects an 8-character password that the signup schema would refuse", async () => {
    const ue = userEvent.setup();
    render(<BindEmailFlow mode="password-only" />);
    const field = screen.getByLabelText("Set a password");
    expect(field).toHaveAttribute("minLength", "12");
    await ue.type(field, "abcd1234");
    await ue.type(screen.getByLabelText("Confirm password"), "abcd1234");
    await ue.click(screen.getByRole("button", { name: "Set password" }));
    expect(await screen.findByText(/doesn't meet every rule/)).toBeInTheDocument();
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it("sets a strong password, shows All set, and completes only on Done", async () => {
    const ue = userEvent.setup();
    const onComplete = vi.fn();
    render(<BindEmailFlow mode="password-only" onComplete={onComplete} />);
    await ue.type(screen.getByLabelText("Set a password"), "Correct-Horse-9");
    await ue.type(screen.getByLabelText("Confirm password"), "Correct-Horse-9");
    await ue.click(screen.getByRole("button", { name: "Set password" }));
    expect(await screen.findByText("All set")).toBeInTheDocument();
    expect(h.updateUser).toHaveBeenCalledWith({ password: "Correct-Horse-9" });
    expect(onComplete).not.toHaveBeenCalled();
    await ue.click(screen.getByRole("button", { name: "Done" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("bind-email-flow-step")).toBeNull();
  });

  it("names a password failure as a password failure", async () => {
    h.updateUser.mockResolvedValue({ error: { message: "", code: "unexpected_failure" } });
    const ue = userEvent.setup();
    render(<BindEmailFlow mode="password-only" />);
    await ue.type(screen.getByLabelText("Set a password"), "Correct-Horse-9");
    await ue.type(screen.getByLabelText("Confirm password"), "Correct-Horse-9");
    await ue.click(screen.getByRole("button", { name: "Set password" }));
    expect(await screen.findByText("Could not set your password. Please try again.")).toBeInTheDocument();
  });
});

describe("BindEmailFlow email steps", () => {
  it("refreshes the session and reports the bound email after a verified code", async () => {
    h.invoke.mockImplementation(async (name: string) =>
      name === "bind-email-request"
        ? { data: { ok: true, expiresInSeconds: 600 }, error: null }
        : { data: { ok: true, email: "sam@example.com" }, error: null }
    );
    const onEmailBound = vi.fn();
    const ue = userEvent.setup();
    render(<BindEmailFlow mode="email-only" onEmailBound={onEmailBound} />);
    await ue.type(screen.getByLabelText("Real email address"), "sam@example.com");
    await ue.click(screen.getByRole("button", { name: "Send verification code" }));
    const otp = await screen.findByLabelText("6-digit verification code");
    await ue.type(otp, "123456");
    await ue.click(screen.getByRole("button", { name: "Verify code" }));
    await waitFor(() => expect(onEmailBound).toHaveBeenCalledWith("sam@example.com"));
    expect(h.refreshSession).toHaveBeenCalled();
    // email-only skips the password step.
    expect(await screen.findByText("All set")).toBeInTheDocument();
    // Let input-otp's selection timers run before the environment is torn down.
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it("resumes at the saved step after a remount", async () => {
    sessionStorage.setItem(
      "bind-email-flow-step",
      JSON.stringify({ mode: "full", step: "code", email: "sam@example.com" })
    );
    render(<BindEmailFlow mode="full" />);
    expect(screen.getByText("sam@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify code" })).toBeInTheDocument();
  });
});
