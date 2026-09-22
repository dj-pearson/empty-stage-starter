import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The intake questionnaire used to open blank and save that blank state over
 * the child's profile. A parent who had entered a peanut allergy, then opened
 * "Complete Profile" to answer one more question, saved `allergens: []` and
 * every allergen check downstream had nothing left to filter on.
 *
 * Pinned here: what was saved comes back out, and a profile that could not be
 * loaded cannot be saved over.
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

const state: {
  loadResult: { data: unknown; error: unknown };
  updates: Record<string, unknown>[];
} = { loadResult: { data: savedRow, error: null }, updates: [] };

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(state.loadResult),
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        state.updates.push(payload);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  },
}));

import { ChildIntakeQuestionnaire } from "./ChildIntakeQuestionnaire";

function setup() {
  const onComplete = vi.fn();
  render(
    <ChildIntakeQuestionnaire
      open
      onOpenChange={vi.fn()}
      kidId="kid-1"
      kidName="Maya"
      onComplete={onComplete}
    />
  );
  return { user: userEvent.setup(), onComplete };
}

async function walkToReview(user: ReturnType<typeof userEvent.setup>) {
  for (let i = 0; i < 6; i++) {
    await user.click(screen.getByRole("button", { name: /Next/ }));
  }
}

beforeEach(() => {
  state.loadResult = { data: savedRow, error: null };
  state.updates = [];
});

describe("ChildIntakeQuestionnaire prefill", () => {
  it("saves the allergens that were already on the profile", async () => {
    const { user, onComplete } = setup();
    await walkToReview(user);

    const save = screen.getByRole("button", { name: /Complete Profile/ });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({
      allergens: ["peanuts", "sesame"],
      allergen_severity: { peanuts: "severe" },
      cross_contamination_sensitive: true,
      texture_dislikes: ["Slimy"],
      disliked_foods: ["peas"],
      favorite_foods: ["crackers"],
    });
  });

  it("will not save when the profile could not be loaded", async () => {
    state.loadResult = { data: null, error: { message: "network" } };
    const { user } = setup();
    await walkToReview(user);

    const save = screen.getByRole("button", { name: /Complete Profile/ });
    await waitFor(() => expect(save).toBeDisabled());
    await user.click(save);
    expect(state.updates).toHaveLength(0);
  });
});
