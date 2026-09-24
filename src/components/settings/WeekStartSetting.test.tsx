import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";

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
    await waitFor(() => expect(h.success).toHaveBeenCalledWith("Weeks now start on Sunday"));
  });

  it("says when the account save failed", async () => {
    const user = userEvent.setup();
    h.set.mockResolvedValue({ error: "denied" });
    render(<WeekStartSetting />);
    await user.click(screen.getByRole("radio", { name: "Sunday" }));
    await waitFor(() => expect(h.error).toHaveBeenCalled());
    expect(h.success).not.toHaveBeenCalled();
  });
});
