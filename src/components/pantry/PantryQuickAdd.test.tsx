import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { PantryQuickAdd } from "./PantryQuickAdd";

vi.mock("@/lib/analytics", () => ({ analytics: { trackEvent: vi.fn() } }));

const input = () => screen.getByRole("textbox", { name: "Quick-add a pantry item" });

describe("PantryQuickAdd", () => {
  it("renders (a missing useTranslation would throw here)", () => {
    render(<PantryQuickAdd onAddOne={vi.fn()} onAddMany={vi.fn()} />);
    expect(input()).toBeInTheDocument();
  });

  it("keeps the text when the add is refused", async () => {
    const user = userEvent.setup();
    const onAddOne = vi.fn().mockResolvedValue(false);
    render(<PantryQuickAdd onAddOne={onAddOne} onAddMany={vi.fn()} />);

    await user.type(input(), "2 lb chicken{Enter}");

    await waitFor(() => expect(onAddOne).toHaveBeenCalledTimes(1));
    expect(onAddOne.mock.calls[0][0]).toMatchObject({ name: "chicken", quantity: 2 });
    await waitFor(() => expect(input()).not.toBeDisabled());
    expect(input()).toHaveValue("2 lb chicken");
  });

  it("clears the text when the add lands", async () => {
    const user = userEvent.setup();
    const onAddOne = vi.fn().mockResolvedValue(true);
    render(<PantryQuickAdd onAddOne={onAddOne} onAddMany={vi.fn()} />);

    await user.type(input(), "milk{Enter}");

    await waitFor(() => expect(input()).toHaveValue(""));
  });

  it("ignores the Enter that confirms an IME composition", () => {
    const onAddOne = vi.fn();
    render(<PantryQuickAdd onAddOne={onAddOne} onAddMany={vi.fn()} />);

    fireEvent.change(input(), { target: { value: "gyunyu" } });
    fireEvent.keyDown(input(), { key: "Enter", isComposing: true });

    expect(onAddOne).not.toHaveBeenCalled();
    expect(input()).toHaveValue("gyunyu");
  });

  it("opens bulk mode, pre-filled, when a list is pasted into the line", async () => {
    const onAddMany = vi.fn().mockResolvedValue(true);
    render(<PantryQuickAdd onAddOne={vi.fn()} onAddMany={onAddMany} />);

    fireEvent.paste(input(), {
      clipboardData: { getData: () => "milk\n12 eggs\r\nbread\n" },
    });

    const bulk = await screen.findByRole("textbox", { name: "Paste a list, one item per line" });
    expect(bulk).toHaveValue("milk\n12 eggs\nbread");
    expect(input()).toHaveValue("");

    await userEvent.setup().click(screen.getByRole("button", { name: "Add 3" }));
    await waitFor(() => expect(onAddMany).toHaveBeenCalledTimes(1));
    expect(onAddMany.mock.calls[0][0]).toHaveLength(3);
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Paste a list, one item per line" })).not.toBeInTheDocument()
    );
  });

  it("keeps the bulk panel and its text when the bulk add is refused", async () => {
    const user = userEvent.setup();
    const onAddMany = vi.fn().mockResolvedValue(false);
    render(<PantryQuickAdd onAddOne={vi.fn()} onAddMany={onAddMany} />);

    fireEvent.paste(input(), { clipboardData: { getData: () => "milk\neggs" } });
    await user.click(await screen.findByRole("button", { name: "Add 2" }));

    await waitFor(() => expect(onAddMany).toHaveBeenCalled());
    expect(screen.getByRole("textbox", { name: "Paste a list, one item per line" })).toHaveValue("milk\neggs");
  });

  it("leaves a single-line paste to the input", () => {
    render(<PantryQuickAdd onAddOne={vi.fn()} onAddMany={vi.fn()} />);
    fireEvent.paste(input(), { clipboardData: { getData: () => "milk" } });
    expect(screen.queryByRole("textbox", { name: "Paste a list, one item per line" })).not.toBeInTheDocument();
  });

  it("shows the stack-onto preview for an existing food", async () => {
    const user = userEvent.setup();
    render(
      <PantryQuickAdd
        onAddOne={vi.fn()}
        onAddMany={vi.fn()}
        existingMatch={{ name: "Milk", from: 1, to: 2, unit: "gal" }}
      />
    );
    await user.type(input(), "milk");
    expect(screen.getByTestId("pantry-quick-add-preview")).toHaveTextContent("Milk: 1 gal -> 2 gal");
  });
});
