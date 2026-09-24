import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The intake questionnaire used to open blank and save that blank state over
 * the child's profile. A parent who had entered a peanut allergy, then opened
 * "Complete Profile" to answer one more question, saved `allergens: []` and
 * every allergen check downstream had nothing left to filter on.
 *
 * Pinned here: what was saved comes back out, a profile that could not be
 * loaded cannot be saved over, and the save goes through KidsContext.updateKid
 * with a payload that validates and names only real columns.
 */

const savedRow = {
  gender: "female",
  height_cm: 110,
  weight_kg: 19,
  allergens: ["peanuts", "sesame"],
  allergen_severity: { peanuts: "severe" },
  cross_contamination_sensitive: true,
  dietary_restrictions: [],
  health_goals: [],
  nutrition_concerns: [],
  eating_behavior: "some_variety",
  new_food_willingness: null,
  behavioral_notes: null,
  texture_sensitivity_level: null,
  texture_dislikes: ["Slimy"],
  texture_preferences: [],
  preferred_preparations: [],
  favorite_foods: ["crackers"],
  always_eats_foods: [],
  disliked_foods: ["peas"],
  pickiness_level: null,
};

const blankRow = Object.fromEntries(Object.keys(savedRow).map((k) => [k, null]));

const state: {
  loadResult: { data: unknown; error: unknown };
  updateResult: boolean;
} = { loadResult: { data: savedRow, error: null }, updateResult: true };

const updateKid = vi.fn(async (_id: string, _patch: Record<string, unknown>) => state.updateResult);

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/contexts/KidsContext", () => ({
  useKids: () => ({ updateKid }),
}));

vi.mock("@/contexts/FoodsContext", () => ({
  useFoods: () => ({ foods: [{ id: "f1", name: "Mac and cheese" }] }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(state.loadResult),
        }),
      }),
      update: () => {
        throw new Error("the questionnaire must save through updateKid");
      },
    }),
  },
}));

import { ChildIntakeQuestionnaire } from "./ChildIntakeQuestionnaire";

// Item 25 made these kids columns; the blank-profile save must still not invent them.
const INTAKE_COLUMNS = ["pickiness_level", "texture_sensitivity_level", "preferred_preparations"];

function setup() {
  const onComplete = vi.fn();
  const onOpenChange = vi.fn();
  const user = userEvent.setup();
  render(
    <ChildIntakeQuestionnaire
      open
      onOpenChange={onOpenChange}
      kidId="kid-1"
      kidName="Maya"
      onComplete={onComplete}
    />
  );
  return { user, onComplete, onOpenChange };
}

async function next(user: ReturnType<typeof userEvent.setup>, times = 1) {
  for (let i = 0; i < times; i++) {
    await user.click(screen.getByRole("button", { name: /Next/ }));
  }
}

async function waitForLoad() {
  // Step 0 renders the gender select once the row is in; the load is async.
  await waitFor(() => expect(screen.getByRole("heading", { name: /Basic information/ })).toBeInTheDocument());
}

async function save(user: ReturnType<typeof userEvent.setup>) {
  const button = screen.getByRole("button", { name: /Complete Profile/ });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
}

function lastPatch(): Record<string, unknown> {
  expect(updateKid).toHaveBeenCalled();
  return updateKid.mock.calls[updateKid.mock.calls.length - 1][1];
}

beforeEach(() => {
  state.loadResult = { data: savedRow, error: null };
  state.updateResult = true;
  updateKid.mockClear();
});

describe("ChildIntakeQuestionnaire prefill", () => {
  it("saves the allergens that were already on the profile", async () => {
    const { user, onComplete } = setup();
    await waitForLoad();
    await next(user, 6);
    await save(user);

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(updateKid).toHaveBeenCalledTimes(1);
    expect(updateKid.mock.calls[0][0]).toBe("kid-1");
    expect(lastPatch()).toMatchObject({
      allergens: ["peanuts", "sesame"],
      allergen_severity: { peanuts: "severe" },
      cross_contamination_sensitive: true,
      texture_dislikes: ["Slimy"],
      disliked_foods: ["peas"],
      favorite_foods: ["crackers"],
      profile_completed: true,
    });
  });

  it("will not save when the profile could not be loaded", async () => {
    state.loadResult = { data: null, error: { message: "network" } };
    const { user } = setup();
    await next(user, 6);

    const button = screen.getByRole("button", { name: /Complete Profile/ });
    await waitFor(() => expect(button).toBeDisabled());
    await user.click(button);
    expect(updateKid).not.toHaveBeenCalled();
  });
});

describe("ChildIntakeQuestionnaire save", () => {
  it("saves a blank profile without inventing values or naming missing columns", async () => {
    state.loadResult = { data: blankRow, error: null };
    const { user, onComplete, onOpenChange } = setup();
    await waitForLoad();
    await next(user, 6);
    await save(user);

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(updateKid).toHaveBeenCalledTimes(1);
    const patch = lastPatch();
    for (const key of ["gender", "height_cm", "weight_kg", "allergens", ...INTAKE_COLUMNS]) {
      expect(patch).not.toHaveProperty(key);
    }
    expect(patch.profile_completed).toBe(true);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("saves the most limited answers (the old calculator produced a value the schema rejected)", async () => {
    const { user, onComplete } = setup();
    await waitForLoad();
    await next(user, 2);
    await user.click(screen.getByLabelText(/Limited variety \(10-15 foods\)/));
    await user.click(screen.getByLabelText(/Refuses to try new foods entirely/));
    await next(user, 4);
    expect(screen.getByText("Extremely picky")).toBeInTheDocument();
    await save(user);

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    const patch = lastPatch();
    expect(patch).toMatchObject({
      eating_behavior: "limited",
      new_food_willingness: "refuses",
      pickiness_level: "extremely_picky",
    });
  });

  it("keeps the texture level the parent picked", async () => {
    const { user } = setup();
    await waitForLoad();
    await next(user, 3);
    await user.click(screen.getByLabelText(/Mild, dislikes 1-2 specific textures/));
    await next(user, 3);
    expect(screen.getByTestId("texture-level")).toHaveTextContent(/mild/i);
    await save(user);
    await waitFor(() => expect(updateKid).toHaveBeenCalled());
    expect(lastPatch().texture_sensitivity_level).toBe("mild");
  });

  it("clears texture dislikes when the parent says there are no texture issues", async () => {
    const { user } = setup();
    await waitForLoad();
    await next(user, 3);
    await user.click(screen.getByLabelText(/No texture issues/));
    expect(screen.queryByLabelText("Slimy")).not.toBeInTheDocument();
    await next(user, 3);
    await save(user);
    await waitFor(() => expect(updateKid).toHaveBeenCalled());
    expect(lastPatch().texture_dislikes).toEqual([]);
  });

  it("commits typed foods as separate chips", async () => {
    const { user } = setup();
    await waitForLoad();
    await next(user, 4);
    await user.type(screen.getByLabelText("Foods they eat every day"), "mac and cheese, peas{Enter}");
    expect(screen.getByRole("button", { name: "Remove mac and cheese" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove peas" })).toBeInTheDocument();

    await next(user, 2);
    await save(user);
    await waitFor(() => expect(updateKid).toHaveBeenCalled());
    expect(lastPatch().always_eats_foods).toEqual(["mac and cheese", "peas"]);
  });

  it("sends [] when the parent says there are no known allergies", async () => {
    const { user } = setup();
    await waitForLoad();
    await next(user, 1);
    await user.click(screen.getByLabelText("No known allergies"));
    await next(user, 5);
    await save(user);
    await waitFor(() => expect(updateKid).toHaveBeenCalled());
    expect(lastPatch()).toMatchObject({ allergens: [], allergen_severity: {}, cross_contamination_sensitive: false });
  });

  it("stays open with the answers when the save fails", async () => {
    state.updateResult = false;
    const { user, onComplete, onOpenChange } = setup();
    await waitForLoad();
    await next(user, 6);
    await save(user);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't save/));
    expect(onComplete).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("button", { name: /Complete Profile/ })).toBeEnabled();
  });

  it("asks before closing with unsaved changes, and can save them without completing", async () => {
    const { user, onOpenChange } = setup();
    await waitForLoad();
    await next(user, 4);
    await user.type(screen.getByLabelText("Foods they eat every day"), "toast{Enter}");
    await user.keyboard("{Escape}");

    const saveLater = await screen.findByRole("button", { name: "Save and finish later" });
    expect(onOpenChange).not.toHaveBeenCalled();
    await user.click(saveLater);

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const patch = lastPatch();
    expect(patch.always_eats_foods).toEqual(["toast"]);
    expect(patch).not.toHaveProperty("profile_completed");
  });
});
