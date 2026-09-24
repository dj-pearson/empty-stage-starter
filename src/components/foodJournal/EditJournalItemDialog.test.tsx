import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";

const h = vi.hoisted(() => ({ toastSuccess: vi.fn(), toastError: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: h.toastSuccess, error: h.toastError }),
}));

import { EditJournalItemDialog, type EditJournalItemDialogProps } from "./EditJournalItemDialog";
import type { JournalItem } from "@/lib/foodJournal";
import type { PlanEntry } from "@/types";

const baseEntry: PlanEntry = {
  id: "e1",
  kid_id: "k1",
  date: "2026-09-20",
  meal_slot: "dinner",
  food_id: "f1",
  result: "refused",
  amount_eaten: null,
  notes: "spat it out",
};

const itemFor = (entry: PlanEntry): JournalItem => ({
  entryId: entry.id,
  kidId: entry.kid_id,
  date: entry.date,
  mealSlot: entry.meal_slot,
  foodId: entry.food_id,
  recipeId: null,
  name: "broccoli",
  exposureNumber: 1,
  firstTry: false,
  allergen: null,
  components: [],
  result: entry.result,
  amountEaten: entry.amount_eaten ?? null,
  notes: [
    ...(entry.notes ? [{ key: "entry", text: entry.notes, source: "entry" as const }] : []),
    { key: "fb1", text: "Gagged a little", source: "feedback" as const, userId: "u2" },
  ],
});

function setup(entry: PlanEntry = baseEntry, props: Partial<EditJournalItemDialogProps> = {}) {
  const save = vi.fn().mockResolvedValue({ error: null });
  const onClose = vi.fn();
  const all: EditJournalItemDialogProps = {
    item: itemFor(entry),
    entry,
    authorLabel: (n) => (n.userId === "u2" ? "Maria, 12:40" : null),
    onClose,
    save,
    ...props,
  };
  const utils = render(<EditJournalItemDialog {...all} />);
  return { ...utils, save: all.save as typeof save, onClose, user: userEvent.setup(), props: all };
}

const saveButton = () => screen.getByRole("button", { name: "Save" });
const amountButton = () => screen.queryByRole("button", { name: "Nibbles" });

beforeEach(() => {
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

describe("the amount picker", () => {
  it("is hidden for a refusal, with a line saying why", () => {
    setup();
    expect(amountButton()).not.toBeInTheDocument();
    expect(screen.getByText("No amount for a refusal.")).toBeInTheDocument();
  });

  it("is hidden when no result is logged", () => {
    setup({ ...baseEntry, result: null });
    expect(amountButton()).not.toBeInTheDocument();
    expect(screen.getByText("Pick a result to record how much.")).toBeInTheDocument();
  });

  it("appears once the result is Tasted", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Tasted" }));
    expect(amountButton()).toBeInTheDocument();
  });
});

describe("saving", () => {
  it("is disabled until something changes", async () => {
    const { user } = setup();
    expect(saveButton()).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Tasted" }));
    expect(saveButton()).toBeEnabled();
  });

  it("corrects Refused to Tasted", async () => {
    const { user, save, onClose } = setup();

    await user.click(screen.getByRole("button", { name: "Tasted" }));
    expect(screen.getByRole("button", { name: "Tasted" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Nibbles" }));
    await user.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith("e1", {
      result: "tasted",
      notes: "spat it out",
      amount_eaten: "nibbles",
    });
    expect(onClose).toHaveBeenCalled();
    expect(h.toastSuccess).toHaveBeenCalledWith("Saved", expect.objectContaining({ action: expect.anything() }));
  });

  it("clears the result with Not logged", async () => {
    const { user, save } = setup({ ...baseEntry, result: "ate", amount_eaten: "some" });

    await user.click(screen.getByRole("button", { name: "Not logged" }));
    await user.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][1]).toMatchObject({ result: null, amount_eaten: null });
  });

  it("offers an Undo that restores only what was written", async () => {
    const { user, save } = setup();

    await user.click(screen.getByRole("button", { name: "Tasted" }));
    await user.click(saveButton());
    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalled());

    const { action } = h.toastSuccess.mock.calls[0][1] as { action: { onClick: () => Promise<void> } };
    await action.onClick();

    expect(save).toHaveBeenLastCalledWith("e1", { result: "refused", notes: "spat it out" });
  });

  it("keeps the dialog open, with the text, when the save fails", async () => {
    const save = vi.fn().mockResolvedValue({ error: { message: "row level security" } });
    const { user, onClose } = setup(baseEntry, { save });

    const box = screen.getByLabelText("Note");
    await user.clear(box);
    await user.type(box, "ate the stalks");
    await user.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't save");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Note")).toHaveValue("ate the stalks");
  });

  it("blocks a note over 500 characters", () => {
    const { save } = setup();

    // maxLength stops typing past the cap; a paste or a script can still
    // put more in the field, so the save itself has to refuse it.
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "a".repeat(501) } });

    expect(saveButton()).toBeDisabled();
    expect(screen.getByText("501 / 500")).toBeInTheDocument();
    fireEvent.click(saveButton());
    expect(save).not.toHaveBeenCalled();
  });
});

describe("a note changed elsewhere while the dialog is open", () => {
  it("says so, blocks Save until the parent picks a version", async () => {
    const { rerender, props, user } = setup();
    await user.click(screen.getByRole("button", { name: "Tasted" }));

    const changed = { ...baseEntry, notes: "spat it out, then asked for more" };
    rerender(<EditJournalItemDialog {...props} entry={changed} />);

    expect(screen.getByText("Someone else changed this note while you were editing.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Use theirs" }));

    expect(screen.queryByText("Someone else changed this note while you were editing.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Note")).toHaveValue("spat it out, then asked for more");
    expect(saveButton()).toBeEnabled();
  });

  it("keeps the parent's text on Keep mine", async () => {
    const { rerender, props, user } = setup();
    const box = screen.getByLabelText("Note");
    await user.clear(box);
    await user.type(box, "mine");

    rerender(<EditJournalItemDialog {...props} entry={{ ...baseEntry, notes: "theirs" }} />);
    await user.click(screen.getByRole("button", { name: "Keep mine" }));

    expect(screen.getByLabelText("Note")).toHaveValue("mine");
    expect(saveButton()).toBeEnabled();
  });
});

describe("other people's notes", () => {
  it("are listed read-only with who wrote them", () => {
    setup();
    expect(screen.getByText("Maria, 12:40:")).toBeInTheDocument();
    expect(screen.getByText(/Gagged a little/)).toBeInTheDocument();
  });
});
