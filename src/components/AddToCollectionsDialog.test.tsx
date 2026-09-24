import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";

vi.mock("@/integrations/supabase/client", async () => (await import("@/test/fakeCollectionsSupabase")).fakeSupabaseModule);
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import { fake } from "@/test/fakeCollectionsSupabase";
import { useRecipeCollections } from "@/hooks/useRecipeCollections";
import { AddToCollectionsDialog } from "./AddToCollectionsDialog";

const USER = "11111111-1111-4111-8111-111111111111";

function Harness({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const c = useRecipeCollections(USER, null);
  if (c.loading) return null;
  return (
    <AddToCollectionsDialog
      open
      onOpenChange={onOpenChange}
      recipeId="r1"
      recipeName="Tacos"
      collections={c.collections}
      currentCollectionIds={c.collectionIdsByRecipe.r1 ?? []}
      onSave={c.setMembership}
      onCreate={c.create}
    />
  );
}

describe("AddToCollectionsDialog", () => {
  beforeEach(() => {
    fake.reset({
      recipe_collections: [
        { id: "c-week", user_id: USER, name: "Weeknight", sort_order: 0, is_default: false },
        { id: "c-kids", user_id: USER, name: "Kid favorites", sort_order: 0, is_default: false },
      ],
    });
  });

  it("clicking a collection name toggles its checkbox once, and Save sends one insert", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);

    await user.click(await screen.findByText("Weeknight"));
    const box = screen.getByRole("checkbox", { name: /Weeknight/ });
    expect(box).toHaveAttribute("data-state", "checked");

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    const writes = fake.calls.filter((c) => c.table === "recipe_collection_items" && c.op !== "select");
    expect(writes).toHaveLength(1);
    expect(writes[0].op).toBe("upsert");
    expect(writes[0].payload).toEqual([{ collection_id: "c-week", recipe_id: "r1" }]);
  });

  it("clicking the checkbox itself also toggles exactly once", async () => {
    const user = userEvent.setup();
    render(<Harness onOpenChange={vi.fn()} />);
    const box = await screen.findByRole("checkbox", { name: /Kid favorites/ });
    await user.click(box);
    expect(box).toHaveAttribute("data-state", "checked");
  });

  it("creates a collection inline and checks it", async () => {
    const user = userEvent.setup();
    render(<Harness onOpenChange={vi.fn()} />);
    await user.type(await screen.findByRole("textbox", { name: /New collection name/ }), "Lunchbox");
    await user.click(screen.getByRole("button", { name: "Add" }));
    const box = await screen.findByRole("checkbox", { name: /Lunchbox/ });
    expect(box).toHaveAttribute("data-state", "checked");
  });
});
