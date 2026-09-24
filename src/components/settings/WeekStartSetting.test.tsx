import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import "@/i18n/appLocale";

const h = vi.hoisted(() => ({
  set: vi.fn(),
  value: 1 as 0 | 1,
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/hooks/useWeekStartsOn", () => ({
  useWeekStartsOnSetting: () => ({ weekStartsOn: h.value, setWeekStartsOn: h.set, signedIn: true }),
}));
vi.mock("sonner", () => ({ toast: { success: h.success, error: h.error } }));

import { WeekStartSetting } from "./WeekStartSetting";

beforeEach(() => {
  h.set.mockReset();
  h.success.mockReset();
  h.error.mockReset();
  h.value = 1;
});

describe("WeekStartSetting", () => {
  it("shows Monday selected by default", () => {
    render(<WeekStartSetting />);
    expect(screen.getByRole("radio", { name: "Monday" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Sunday" })).not.toBeChecked();
  });

  it("saves Sunday and confirms", async () => {
    const user = userEvent.setup();
    h.set.mockResolvedValue({ error: null });
    render(<WeekStartSetting />);
    await user.click(screen.getByRole("radio", { name: "Sunday" }));
    expect(h.set).toHaveBeenCalledWith(0);
    await waitFor(() =>
      expect(h.success).toHaveBeenCalledWith("Weeks now start on Sunday", expect.anything()),
    );
  });

  it("offers Undo on success, which restores the previous day", async () => {
    const user = userEvent.setup();
    h.set.mockResolvedValue({ error: null });
    render(<WeekStartSetting />);
    await user.click(screen.getByRole("radio", { name: "Sunday" }));
    await waitFor(() => expect(h.success).toHaveBeenCalled());
    const opts = h.success.mock.calls[0][1] as { action: { label: string; onClick: () => void } };
    expect(opts.action.label).toBe("Undo");
    await act(async () => {
      opts.action.onClick();
    });
    expect(h.set).toHaveBeenLastCalledWith(1);
    // The undo's own confirmation does not offer another undo.
    await waitFor(() => expect(h.success).toHaveBeenCalledTimes(2));
    expect(h.success.mock.calls[1]).toEqual(["Weeks now start on Monday"]);
  });

  it("says when the account save failed", async () => {
    const user = userEvent.setup();
    h.set.mockResolvedValue({ error: "denied" });
    render(<WeekStartSetting />);
    await user.click(screen.getByRole("radio", { name: "Sunday" }));
    await waitFor(() => expect(h.error).toHaveBeenCalled());
    expect(h.success).not.toHaveBeenCalled();
  });

  it("keeps a retry line after a failed save until a save succeeds", async () => {
    const user = userEvent.setup();
    h.set.mockResolvedValueOnce({ error: "denied" });
    const { rerender } = render(<WeekStartSetting />);
    await user.click(screen.getByRole("radio", { name: "Sunday" }));
    const line = await screen.findByRole("status");
    expect(line).toHaveTextContent("Saved on this device only.");
    // The hook has applied Sunday locally; the retry re-saves that value.
    h.value = 0;
    rerender(<WeekStartSetting />);
    h.set.mockResolvedValueOnce({ error: null });
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(h.set).toHaveBeenLastCalledWith(0);
    await waitFor(() => expect(screen.queryByText("Saved on this device only.")).not.toBeInTheDocument());
  });

  it("shows the account scope and renders a compact variant", () => {
    const { unmount } = render(<WeekStartSetting />);
    expect(screen.getByText("Saved to your account")).toBeInTheDocument();
    unmount();
    render(<WeekStartSetting compact />);
    expect(screen.getByRole("radiogroup", { name: "Week starts on" })).toBeInTheDocument();
    expect(screen.queryByText("Planner week")).not.toBeInTheDocument();
  });
});
