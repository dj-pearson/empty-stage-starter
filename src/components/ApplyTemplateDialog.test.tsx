import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// Real i18n instance, so t() interpolates the defaultValue copy.
import "@/i18n";
import type { Kid } from "@/types";

vi.mock("@/lib/mealPlanTemplatesApi", () => ({
  applyTemplate: vi.fn(() => Promise.resolve({ data: { entriesCreated: 3, skippedCount: 0 }, error: null })),
}));

import { ApplyTemplateDialog } from "./ApplyTemplateDialog";

const kids: Kid[] = [
  { id: "k1", name: "Emma" },
  { id: "k2", name: "Leo" },
];

const template = {
  id: "t1",
  name: "Easy week",
  description: null,
  meal_plan_template_entries: [],
};

function renderDialog(open: boolean, extra: Partial<Parameters<typeof ApplyTemplateDialog>[0]> = {}) {
  return (
    <ApplyTemplateDialog
      open={open}
      onOpenChange={() => {}}
      template={template}
      kids={kids}
      activeKidId="k1"
      defaultStartDate={new Date(2026, 8, 23)} // Wed Sep 23 2026
      {...extra}
    />
  );
}

describe("ApplyTemplateDialog", () => {
  it("toggles a kid exactly once per checkbox click", async () => {
    const user = userEvent.setup();
    render(renderDialog(true, { activeKidId: undefined }));
    const emma = screen.getByRole("checkbox", { name: /Emma/ });
    expect(emma).toBeChecked();
    await user.click(emma);
    expect(emma).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Leo/ })).toBeChecked();
  });

  it("snaps the default start date to the planner's Sunday week start", () => {
    render(renderDialog(true));
    expect(screen.getByTestId("apply-template-range")).toHaveTextContent(
      "Applied from Sun Sep 20 to Sat Sep 26, 2026"
    );
  });

  it("resets selection and mode when reopened", async () => {
    const user = userEvent.setup();
    const { rerender } = render(renderDialog(true));
    // Opens on the active kid only, in merge mode.
    expect(screen.getByRole("checkbox", { name: /Emma/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Leo/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Merge/ })).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("checkbox", { name: /Leo/ }));
    await user.click(screen.getByRole("radio", { name: /Replace/ }));
    expect(screen.getByRole("radio", { name: /Replace/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("apply-template-mode-warning")).toHaveTextContent(/removes every meal/);

    rerender(renderDialog(false));
    rerender(renderDialog(true));

    expect(screen.getByRole("checkbox", { name: /Leo/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Merge/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("apply-template-mode-warning")).toHaveTextContent(/stay where they are/);
  });
});
