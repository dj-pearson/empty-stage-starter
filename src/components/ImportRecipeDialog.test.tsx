import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Food, Recipe } from "@/types";
import { ImportRecipeDialog } from "./ImportRecipeDialog";

const invoke = vi.fn();
vi.mock("@/lib/edge-functions", () => ({
  invokeEdgeFunction: (...a: unknown[]) => invoke(...a),
}));
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));
vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("html5-qrcode", () => ({ Html5Qrcode: vi.fn() }));

const foods: Food[] = [
  { id: "egg", name: "Egg", category: "protein", is_safe: true, is_try_bite: false },
  { id: "eggplant", name: "Eggplant", category: "vegetable", is_safe: true, is_try_bite: false },
];

type OnImport = (recipe: Omit<Recipe, "id">) => Promise<void>;

function setup(onImport: OnImport) {
  const onOpenChange = vi.fn();
  render(<ImportRecipeDialog open onOpenChange={onOpenChange} onImport={onImport} foods={foods} />);
  return { onOpenChange };
}

beforeEach(() => {
  invoke.mockReset();
  toastSuccess.mockReset();
});

describe("ImportRecipeDialog", () => {
  it("keeps the dialog open with the URL filled when onImport rejects, and toasts no success", async () => {
    invoke.mockResolvedValue({ data: { recipe: { name: "Pie", ingredients: ["2 eggs"] } }, error: null });
    const onImport = vi.fn<OnImport>().mockRejectedValue(new Error("Database error: boom"));
    const { onOpenChange } = setup(onImport);
    const user = userEvent.setup();

    const input = screen.getByLabelText("Recipe URL");
    await user.type(input, "https://example.com/pie");
    await user.click(screen.getByRole("button", { name: /import from url/i }));

    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent("Database error: boom");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByLabelText("Recipe URL")).toHaveValue("https://example.com/pie");
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("closes once onImport resolves, with the ingredient linked to one food", async () => {
    invoke.mockResolvedValue({
      data: { recipe: { name: "Omelette", ingredients: [{ name: "eggs", quantity: 3, notes: "beaten" }], difficulty: "extreme" } },
      error: null,
    });
    const onImport = vi.fn<OnImport>().mockResolvedValue(undefined);
    const { onOpenChange } = setup(onImport);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Recipe URL"), "https://example.com/omelette");
    await user.click(screen.getByRole("button", { name: /import from url/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const recipe = onImport.mock.calls[0][0];
    expect(recipe.source_type).toBe("website");
    expect(recipe.source_url).toBe("https://example.com/omelette");
    expect(recipe.food_ids).toEqual(["egg"]);
    expect(recipe.recipe_ingredient_rows?.[0]).toMatchObject({ food_id: "egg", quantity: 3, optional_notes: "beaten" });
    // An unknown difficulty is dropped, not saved.
    expect(recipe.difficulty_level).toBeUndefined();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("drops an invalid difficulty and strips a javascript: source_url from JSON", async () => {
    const onImport = vi.fn<OnImport>().mockResolvedValue(undefined);
    setup(onImport);
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "JSON" }));
    const textarea = await screen.findByLabelText("JSON Data");
    const json = JSON.stringify({
      name: "Sneaky",
      difficulty: "impossible",
      source_url: "javascript:alert(1)",
      image_url: "data:text/html,hi",
      tags: "dinner, quick",
      source_type: "manual",
      prepTime: "1 hour",
    });
    // user.type treats braces as key descriptors; paste the text instead.
    await user.click(textarea);
    await user.paste(json);
    await user.click(screen.getByRole("button", { name: /import json/i }));

    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    const recipe = onImport.mock.calls[0][0];
    expect(recipe.difficulty_level).toBeUndefined();
    expect(recipe.source_url).toBeUndefined();
    expect(recipe.image_url).toBeUndefined();
    expect(recipe.tags).toEqual(["dinner", "quick"]);
    expect(recipe.source_type).toBe("imported");
    expect(recipe.total_time_minutes).toBe(60);
  });

  it("shows invalid JSON inline and keeps the dialog open", async () => {
    const onImport = vi.fn<OnImport>();
    const { onOpenChange } = setup(onImport);
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "JSON" }));
    await user.click(await screen.findByLabelText("JSON Data"));
    await user.paste("not json");
    await user.click(screen.getByRole("button", { name: /import json/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/valid JSON/i);
    expect(onImport).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
