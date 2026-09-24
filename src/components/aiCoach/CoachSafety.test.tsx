import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";
import "@/i18n/appLocale";
import type { Food, Kid } from "@/types";
import type { CoachAction } from "@/lib/coachReply";
import { detectRedFlags } from "@/lib/aiSafety";

const kidsState = vi.hoisted(() => ({ kids: [] as Kid[], setActiveKidId: vi.fn() }));

vi.mock("@/contexts/AppContext", () => ({
  useKids: () => kidsState,
}));

import { EscalationCard } from "./EscalationCard";
import { ReplySafetyNotice } from "./ReplySafetyNotice";
import { CoachKidHeader } from "./CoachKidHeader";
import { CoachActionChips } from "./CoachActionChips";

const treeNutKid: Kid = { id: "k1", name: "Ava", allergens: ["tree nuts"], allergen_severity: { "tree nuts": "severe" } };

const PB: Food = { id: "f-pb", name: "peanut butter", category: "protein", is_safe: true, is_try_bite: false, allergens: ["peanut"] };
const CARROT: Food = { id: "f-carrot", name: "carrots", category: "vegetable", is_safe: false, is_try_bite: true };

describe("EscalationCard", () => {
  it("renders nothing for no flags", () => {
    const { container } = render(<EscalationCard flags={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("interrupts with role=alert and a tap-to-call 911 link for the emergency tier", () => {
    render(<EscalationCard flags={detectRedFlags("He started choking on a grape")} />);
    const alert = screen.getByRole("alert");
    const link = alert.querySelector("a[href]");
    expect(link).toHaveAttribute("href", "tel:911");
    expect(link?.className).toContain("min-h-11");
  });

  it("does not use role=alert for the clinician tier, and names the pediatrician", () => {
    render(<EscalationCard flags={detectRedFlags("she has lost weight this month")} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/call your pediatrician/i)).toBeInTheDocument();
  });
});

describe("ReplySafetyNotice", () => {
  it("warns when a reply names the kid's allergen by the canonical matcher", () => {
    render(<ReplySafetyNotice text="You could try almond butter on toast." kid={treeNutKid} />);
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(/tree nut/i);
    expect(note).toHaveTextContent(/severe/i);
    expect(note).toHaveTextContent(/your child/i);
    expect(note).not.toHaveTextContent("Ava");
  });

  it("stays silent for butternut squash", () => {
    const { container } = render(<ReplySafetyNotice text="Roast some butternut squash." kid={treeNutKid} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("notes on every reply when allergies were never recorded", () => {
    render(<ReplySafetyNotice text="Roast some carrots." kid={{ id: "k2", name: "Ben", allergens: undefined }} />);
    expect(screen.getByText(/allergies aren't recorded/i)).toBeInTheDocument();
  });
});

describe("CoachKidHeader", () => {
  const renderHeader = (kid: Kid) =>
    render(
      <MemoryRouter>
        <CoachKidHeader kid={kid} ctx={null} />
      </MemoryRouter>,
    );

  it("shows 'Allergies not recorded' linking to the profile when allergens is undefined", () => {
    kidsState.kids = [{ id: "k2", name: "Ben" }];
    renderHeader({ id: "k2", name: "Ben", allergens: undefined });
    const badge = screen.getByText("Allergies not recorded").closest("a");
    expect(badge).toHaveAttribute("href", expect.stringContaining("/dashboard/kids?kid=k2"));
  });

  it("shows no such badge when the parent recorded no allergies", () => {
    kidsState.kids = [{ id: "k3", name: "Cy" }];
    renderHeader({ id: "k3", name: "Cy", allergens: [] });
    expect(screen.queryByText("Allergies not recorded")).toBeNull();
  });

  it("labels a severe allergen in text, not colour alone", () => {
    kidsState.kids = [treeNutKid];
    renderHeader(treeNutKid);
    expect(screen.getByText(/tree nuts, severe/i)).toBeInTheDocument();
  });
});

describe("CoachActionChips", () => {
  const blocked: CoachAction = {
    key: "try_bite:f-pb",
    type: "try_bite",
    food: PB,
    status: "blocked",
    reason: { allergen: "peanut", severity: "severe" },
  };
  const confirm: CoachAction = { key: "try_bite:f-carrot", type: "try_bite", food: CARROT, status: "confirm" };

  it("keeps a blocked chip visible, aria-disabled, with the conflict as its description", () => {
    const onRun = vi.fn();
    render(<CoachActionChips actions={[blocked]} onRun={onRun} pending={new Set()} done={new Set()} />);
    const button = screen.getByRole("button", { name: "Try bite: peanut butter" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription("Contains peanut (severe)");
    fireEvent.click(button);
    expect(onRun).not.toHaveBeenCalled();
  });

  it("asks before a confirm chip runs, with Cancel focused, and does nothing on Cancel", async () => {
    const onRun = vi.fn();
    render(<CoachActionChips actions={[confirm]} onRun={onRun} pending={new Set()} done={new Set()} />);
    fireEvent.click(screen.getByRole("button", { name: "Try bite: carrots" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/allergies aren't recorded/i);
    const cancel = screen.getByRole("button", { name: "Cancel" });
    await waitFor(() => expect(cancel).toHaveFocus());
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(onRun).not.toHaveBeenCalled();
  });

  it("orders chips try bite, ladder, grocery", () => {
    const actions: CoachAction[] = [
      { key: "grocery:f-carrot", type: "grocery", food: CARROT, status: "ok" },
      { key: "ladder:f-carrot", type: "ladder", food: CARROT, status: "ok" },
      { key: "try_bite:f-carrot", type: "try_bite", food: CARROT, status: "ok" },
    ];
    render(<CoachActionChips actions={actions} onRun={vi.fn()} pending={new Set()} done={new Set()} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Try bite: carrots",
      "Add to ladder: carrots",
      "Add to grocery: carrots",
    ]);
  });
});
