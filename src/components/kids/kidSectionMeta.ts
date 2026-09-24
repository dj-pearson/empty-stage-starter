import type { ProfileGap } from "@/lib/kidProfileCompleteness";
import type { KidSectionId } from "@/lib/kidIntakeForm";

/** The title of each editor section, as the card and the editor both show it. */
export const KID_SECTION_TITLES: Readonly<Record<KidSectionId, { key: string; label: string }>> = {
  basics: { key: "kids.editor.sections.basics", label: "Basics" },
  allergies: { key: "kids.editor.sections.allergies", label: "Allergies" },
  safeFoods: { key: "kids.editor.sections.safeFoods", label: "Safe foods" },
  alwaysEats: { key: "kids.editor.sections.alwaysEats", label: "Always eats" },
  dislikes: { key: "kids.editor.sections.dislikes", label: "Dislikes" },
  textures: { key: "kids.editor.sections.textures", label: "Textures and sensory" },
  behavior: { key: "kids.editor.sections.behavior", label: "Eating behavior" },
  goals: { key: "kids.editor.sections.goals", label: "Goals" },
  notes: { key: "kids.editor.sections.notes", label: "Notes" },
};

/**
 * Where "complete the profile" goes for each gap computeProfileCompleteness
 * reports. Its safe-foods check counts always_eats_foods, so that gap opens
 * Always eats; "preferences" is satisfied by dislikes, textures or behavior,
 * and Dislikes is the quickest of those to answer.
 */
export const GAP_SECTION: Readonly<Record<ProfileGap, KidSectionId>> = {
  allergies: "allergies",
  birthday: "basics",
  safeFoods: "alwaysEats",
  preferences: "dislikes",
  goals: "goals",
};
