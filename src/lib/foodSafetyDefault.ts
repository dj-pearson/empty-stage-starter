/**
 * What `is_safe` means on a food the app created rather than the parent (US-803).
 *
 * `is_safe` is the flag a parent sets deliberately. The safe-food ladder reads
 * it, meal suggestions read it, and in an app built for ARFID and selective
 * eating it is the single field where being wrong costs the most: telling a
 * parent a food is safe when nobody has said so invites a meal that was never
 * going to work, and undoes the trust the ladder is built on.
 *
 * Eight places used to hardcode that flag on, across seven files, all from the
 * same kind of action -- checking a grocery item off, finishing the shop,
 * scanning a barcode, photographing a food, parsing a receipt, importing a CSV,
 * and the two pantry quick-adds. Every one of those means "this food is now in
 * my house", or "here is its name and how much of it I have". None of them
 * means "my child eats this". Buying is not accepting, and typing is not
 * accepting either.
 *
 * So an acquired food arrives unmarked, and the parent marks it. A false that
 * should be true is one tap to fix and the app said nothing untrue on the way;
 * a true that should be false is a wrong suggestion the parent has to notice
 * first.
 *
 * NOT covered by this: the curated starter foods offered at onboarding, which a
 * parent is choosing from a list of typical safe foods, and
 * public.refresh_food_is_safe, which rolls the per-kid ladder up into this flag.
 * That one does set is_safe true automatically, but from bites the parent
 * logged rather than from an assumption, and it moves in both directions.
 */
export const ACQUIRED_FOOD_IS_SAFE = false;

/** Same reasoning: nothing acquired is a "try bite" until a parent says so. */
export const ACQUIRED_FOOD_IS_TRY_BITE = false;
