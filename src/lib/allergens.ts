// The allergen matcher is shared with the edge functions; see the source for why.
export {
  normalizeAllergen,
  matchingAllergen,
  isAllergenSafeFor,
} from "../../supabase/functions/_shared/allergens";
