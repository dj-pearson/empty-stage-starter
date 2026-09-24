import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import type { Food, Kid, Recipe } from "@/types";
import { getKidRecipeFit, summarizeKidFits, type KidFit, type KidHit } from "@/lib/kidFit";
import { KidFitBadges, kidFitChips } from "./KidFitBadges";

const t = i18n.t.bind(i18n);

function kidFit(over: Partial<KidFit> = {}): KidFit {
  return {
    allergen: null,
    disliked: false,
    alwaysEats: false,
    safe: false,
    tryBite: false,
    tries: 0,
    ate: 0,
    offered: 0,
    lastResult: null,
    ...over,
  };
}

const ava: Kid = { id: "k1", name: "Ava", allergens: ["peanuts"] };
const ben: Kid = { id: "k2", name: "Ben", allergens: [] };

describe("KidFitBadges", () => {
  it("an unknown allergy status never renders the safe label", () => {
    // Every food flagged safe, but one ingredient could not be checked.
    const fit = summarizeKidFits([{ kid: ben, fit: kidFit({ safe: true }) }], { unchecked: 1 });
    expect(fit.allergenStatus).toBe("unknown");
    render(<KidFitBadges fit={fit} mode="full" />);
    expect(screen.getByText(/Allergy not checked/)).toBeInTheDocument();
    expect(screen.queryByText(/Safe for/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No allergens/)).not.toBeInTheDocument();
  });

  it("a kid whose allergy list is missing is unknown, not safe", () => {
    const noList: Kid = { id: "k3", name: "Cy" };
    const fit = summarizeKidFits([{ kid: noList, fit: kidFit({ safe: true }) }]);
    const tones = kidFitChips(fit, t, "full").map((c) => c.tone);
    expect(tones).toContain("unknown");
    expect(tones).not.toContain("safe");
  });

  it("puts allergen hits first, then dislikes, and drops trying when someone is allergic", () => {
    const perKid: KidHit[] = [
      { kid: ava, fit: kidFit({ allergen: "peanut" }) },
      { kid: ben, fit: kidFit({ disliked: true, tryBite: true }) },
    ];
    const fit = summarizeKidFits(perKid);
    const chips = kidFitChips(fit, t, "full");
    expect(chips.map((c) => c.label)).toEqual(["Not for Ava: peanut", "Ben dislikes an ingredient"]);
  });

  it("puts safe before trying and shows history for a single kid", () => {
    const fit = summarizeKidFits([{ kid: ben, fit: kidFit({ safe: true, tryBite: true, tries: 4, ate: 3 }) }]);
    expect(kidFitChips(fit, t, "full").map((c) => c.tone)).toEqual(["safe", "trying", "neutral"]);
    render(<KidFitBadges fit={fit} />);
    expect(screen.getByText("Ate 3 of 4")).toBeInTheDocument();
    expect(screen.getByText("Safe for Ben")).toBeInTheDocument();
  });

  it("names the kid from a real recipe with a canonical allergen match", () => {
    const food: Food = {
      id: "f1",
      name: "Peanut butter",
      category: "protein",
      is_safe: true,
      is_try_bite: false,
      allergens: ["en:peanuts"],
    };
    const recipe: Recipe = { id: "r1", name: "PB toast", food_ids: ["f1"] };
    const fit = summarizeKidFits([{ kid: ava, fit: getKidRecipeFit(ava, recipe, new Map([["f1", food]]), []) }]);
    render(<KidFitBadges fit={fit} />);
    expect(screen.getByText(/Not for Ava/)).toBeInTheDocument();
  });

  it("caps compact mode at three chips plus a +N", () => {
    const kids: Kid[] = ["A", "B", "C", "D", "E"].map((n, i) => ({ id: `k${i}`, name: n, allergens: ["milk"] }));
    const fit = summarizeKidFits(kids.map((kid) => ({ kid, fit: kidFit({ allergen: "milk" }) })));
    render(<KidFitBadges fit={fit} mode="compact" />);
    expect(screen.getAllByText(/^Not for /)).toHaveLength(3);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("renders nothing without kids", () => {
    const { container } = render(<KidFitBadges fit={summarizeKidFits([])} />);
    expect(container).toBeEmptyDOMElement();
  });
});
