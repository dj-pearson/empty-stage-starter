import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import "@/i18n/appLocale";
import type { EmailSubscriptionsResult } from "@/lib/email";

const h = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  history: vi.fn(),
}));

vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  getEmailSubscriptions: h.get,
  updateEmailSubscriptions: h.update,
  getEmailHistory: h.history,
}));

import { EmailPreferences } from "./EmailPreferences";

const PREFS = {
  welcome_emails: true,
  milestone_emails: true,
  weekly_summary: true,
  tips_and_advice: true,
  marketing_emails: false,
};

beforeEach(() => {
  h.get.mockReset();
  h.update.mockReset();
  h.history.mockReset();
  h.history.mockResolvedValue([]);
});

describe("EmailPreferences", () => {
  it("shows Retry on a load error and reloads with it", async () => {
    const user = userEvent.setup();
    h.get.mockResolvedValueOnce({ status: "error" } satisfies EmailSubscriptionsResult);
    render(<EmailPreferences />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load your email preferences.");
    h.get.mockResolvedValueOnce({ status: "ok", prefs: PREFS, unsubscribedAt: null });
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("switch", { name: "Weekly summary" })).toBeChecked();
  });

  it("shows the unsubscribed banner and turns email back on", async () => {
    const user = userEvent.setup();
    h.get.mockResolvedValue({
      status: "ok",
      prefs: { ...PREFS, welcome_emails: false, milestone_emails: false, weekly_summary: false, tips_and_advice: false },
      unsubscribedAt: "2026-09-01T10:00:00Z",
    });
    h.update.mockResolvedValue(true);
    render(<EmailPreferences />);
    expect(await screen.findByText(/You unsubscribed from all EatPal email on/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Turn email back on" }));
    expect(h.update).toHaveBeenCalledWith({
      welcome_emails: true,
      milestone_emails: true,
      weekly_summary: true,
      tips_and_advice: true,
    });
    await waitFor(() => expect(screen.queryByText(/You unsubscribed/)).not.toBeInTheDocument());
    expect(screen.getByRole("switch", { name: "Weekly summary" })).toBeChecked();
  });

  it("renders no Send Test button and treats a missing row as defaults", async () => {
    h.get.mockResolvedValue({ status: "missing", prefs: PREFS, unsubscribedAt: null });
    render(<EmailPreferences />);
    expect(await screen.findByRole("switch", { name: "Product news" })).not.toBeChecked();
    expect(screen.queryByRole("button", { name: /send test/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/You unsubscribed/)).not.toBeInTheDocument();
  });

  it("reverts only the switch whose save failed", async () => {
    const user = userEvent.setup();
    h.get.mockResolvedValue({ status: "ok", prefs: PREFS, unsubscribedAt: null });
    h.update.mockResolvedValue(false);
    render(<EmailPreferences />);
    const weekly = await screen.findByRole("switch", { name: "Weekly summary" });
    await user.click(weekly);
    await waitFor(() => expect(h.update).toHaveBeenCalledWith({ weekly_summary: false }));
    await waitFor(() => expect(weekly).toBeChecked());
  });

  it("names each switch by its label and describes it with the helper text", async () => {
    h.get.mockResolvedValue({ status: "ok", prefs: PREFS, unsubscribedAt: null });
    render(<EmailPreferences />);
    const tips = await screen.findByRole("switch", { name: "Tips for picky eating" });
    expect(tips).toHaveAccessibleDescription(/feeding specialists/);
  });

  it("has a history toggle that reports its state", async () => {
    const user = userEvent.setup();
    h.get.mockResolvedValue({ status: "ok", prefs: PREFS, unsubscribedAt: null });
    h.history.mockResolvedValue([
      {
        id: "e1",
        template_key: "weekly_summary",
        to_email: "a@example.com",
        subject: "Your week",
        status: "failed",
        created_at: "2026-09-20T10:00:00Z",
        error_message: "smtp 550 mailbox unavailable",
      },
    ]);
    render(<EmailPreferences />);
    const toggle = await screen.findByRole("button", { name: "Recent emails" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Couldn't deliver. We'll retry.")).toBeInTheDocument();
    expect(screen.queryByText(/smtp 550/)).not.toBeInTheDocument();
  });
});
