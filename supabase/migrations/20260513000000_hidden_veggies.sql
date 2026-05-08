-- US-297: Hidden-Veggies auto-rewrite engine
-- Curated catalog of vetted veggie-hiding techniques + recipe variant linkage.

-- 1) Catalog of techniques (publicly readable, admin-managed)
CREATE TABLE IF NOT EXISTS hidden_veggie_techniques (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Veggie being hidden
  veggie_name TEXT NOT NULL,                    -- e.g. 'cauliflower', 'spinach'
  veggie_allergens TEXT[] NOT NULL DEFAULT '{}',-- pass-through to recipe (rare for veggies)

  -- Where it can be hidden
  -- recipe_keywords: any of these keywords (case-insensitive substring match
  -- against recipe.name/description/instructions) makes the recipe a candidate.
  recipe_keywords TEXT[] NOT NULL,              -- e.g. {'mac and cheese','mac & cheese','cheese sauce'}
  -- recipe_categories: optional categorical filter against recipe.category.
  recipe_categories TEXT[] NOT NULL DEFAULT '{}',

  -- How
  technique TEXT NOT NULL,                      -- 'puree','grate','finely-chop','blend','swap-liquid'
  prep_method TEXT NOT NULL,                    -- 'steamed_then_pureed','grated_raw','frozen_then_blended'
  -- Max ratio of the host item to replace/add. e.g. 0.30 = up to 30% of cheese sauce volume.
  max_ratio NUMERIC(3, 2) NOT NULL CHECK (max_ratio > 0 AND max_ratio <= 1.0),
  -- Suggested human-friendly amount string (rendered alongside the rewrite).
  suggested_amount TEXT NOT NULL,               -- e.g. '1/2 cup pureed cauliflower per 2 cups sauce'

  -- Instruction snippet inserted into the rewrite. {{step}} substitutes "Add the
  -- {{prep}} {{veggie}} to..." sentence.
  instruction_template TEXT NOT NULL,
  -- Why this works (shown to parent as a stealth tip)
  stealth_tip TEXT NOT NULL,
  -- 0..100 confidence the kid won't detect (calibrated by domain experts)
  stealth_score INTEGER NOT NULL DEFAULT 70 CHECK (stealth_score BETWEEN 0 AND 100),

  -- Lifecycle
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hidden_veggie_techniques_active
  ON hidden_veggie_techniques(is_active);
CREATE INDEX IF NOT EXISTS idx_hidden_veggie_techniques_veggie
  ON hidden_veggie_techniques(veggie_name);
CREATE INDEX IF NOT EXISTS idx_hidden_veggie_techniques_keywords
  ON hidden_veggie_techniques USING GIN (recipe_keywords);

ALTER TABLE hidden_veggie_techniques ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read active techniques"
  ON hidden_veggie_techniques FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins manage techniques"
  ON hidden_veggie_techniques FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_hidden_veggie_techniques_updated_at
  BEFORE UPDATE ON hidden_veggie_techniques
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 2) Recipe variant linkage. parent_recipe_id points to the original recipe
--    a hidden-veggies variant was generated from. ON DELETE SET NULL so
--    deleting the parent doesn't cascade-delete the variant.
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS parent_recipe_id UUID
    REFERENCES recipes(id) ON DELETE SET NULL;
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS variant_kind TEXT;
-- variant_kind: 'hidden_veggies' is the only value used today; left as TEXT
-- so future variant types (scaled, simplified, etc.) can reuse the column.

CREATE INDEX IF NOT EXISTS idx_recipes_parent_recipe ON recipes(parent_recipe_id)
  WHERE parent_recipe_id IS NOT NULL;

-- 3) Seed catalog (~20 vetted techniques)
INSERT INTO hidden_veggie_techniques (
  veggie_name, recipe_keywords, recipe_categories,
  technique, prep_method, max_ratio, suggested_amount,
  instruction_template, stealth_tip, stealth_score
) VALUES
  -- Cauliflower
  ('cauliflower',
   ARRAY['mac and cheese','mac & cheese','macaroni','cheese sauce','alfredo'],
   ARRAY['carb'],
   'puree', 'steamed_then_pureed', 0.30,
   '1/2 cup steamed-and-pureed cauliflower per 2 cups cheese sauce',
   'Steam the cauliflower until very soft, puree until smooth, then whisk into the cheese sauce before combining with the pasta.',
   'Cauliflower vanishes into cheese sauce - same color, same creaminess, slightly nuttier flavor that the cheese covers.',
   85),

  ('cauliflower',
   ARRAY['mashed potato','mashed potatoes','smashed potato'],
   ARRAY['carb'],
   'puree', 'steamed_then_pureed', 0.40,
   '1 cup steamed cauliflower per 2 cups potato',
   'Steam cauliflower with the potatoes; mash both together with the same butter and milk.',
   'Cauliflower is the same color as potato and disappears with butter. Drop the ratio to 25% if your kid notices texture.',
   88),

  ('cauliflower',
   ARRAY['pizza dough','pizza crust','crust'],
   ARRAY[]::TEXT[],
   'grate', 'grated_then_squeezed_dry', 0.50,
   '2 cups grated cauliflower per cup of flour, squeezed dry',
   'Grate cauliflower, microwave 4 minutes, squeeze out moisture in a clean towel, then mix into the dough as 50% flour replacement.',
   'Cauliflower crust is mainstream now - kids who eat regular pizza rarely flag it.',
   75),

  -- Spinach
  ('spinach',
   ARRAY['brownie','brownies','chocolate cake','chocolate cupcake'],
   ARRAY[]::TEXT[],
   'puree', 'steamed_then_pureed', 0.15,
   '1/4 cup pureed spinach per 8x8 pan of brownies',
   'Steam spinach until wilted, blend with a splash of water, fold into the wet ingredients before adding flour.',
   'Cocoa and chocolate completely mask spinach color and taste at low ratios. Stick to 15% or it darkens too much.',
   90),

  ('spinach',
   ARRAY['smoothie','green smoothie','fruit smoothie'],
   ARRAY[]::TEXT[],
   'blend', 'frozen_raw', 0.25,
   '1 handful frozen spinach per 16oz smoothie',
   'Add frozen spinach with the rest of the smoothie ingredients. Berries (especially blueberries) hide the green color completely.',
   'Frozen spinach blends without leafy bits. Pair with dark berries for color camouflage.',
   80),

  ('spinach',
   ARRAY['pesto','pasta sauce','marinara'],
   ARRAY[]::TEXT[],
   'puree', 'blanched_then_pureed', 0.30,
   '1 cup blanched spinach per 2 cups sauce',
   'Blanch spinach 30 seconds, shock in ice water, blend smooth, then stir into the sauce.',
   'Spinach matches basil tones in pesto and disappears in red sauce when fully pureed.',
   78),

  -- Zucchini
  ('zucchini',
   ARRAY['muffin','quick bread','banana bread'],
   ARRAY[]::TEXT[],
   'grate', 'grated_then_squeezed_dry', 0.30,
   '1 cup grated zucchini per dozen muffins',
   'Grate zucchini on the small holes, squeeze in a clean towel, then fold into the batter with the wet ingredients.',
   'Zucchini melts into baked goods and adds moisture. Stays invisible if you squeeze the water out first.',
   92),

  ('zucchini',
   ARRAY['meatball','meatloaf','burger'],
   ARRAY['protein'],
   'grate', 'grated_then_squeezed_dry', 0.20,
   '1/2 cup grated zucchini per pound of ground meat',
   'Grate finely, squeeze dry, mix into the meat with the breadcrumbs and egg.',
   'Adds moisture without changing flavor. Keeps the meat tender too.',
   86),

  -- Carrot
  ('carrot',
   ARRAY['tomato sauce','marinara','spaghetti sauce','pasta sauce'],
   ARRAY[]::TEXT[],
   'puree', 'roasted_then_pureed', 0.25,
   '1 medium carrot pureed per 2 cups sauce',
   'Roast carrots until soft, blend with a bit of the sauce, then stir back in.',
   'Carrots add natural sweetness that balances acidic tomato - parents have done this for decades.',
   88),

  ('carrot',
   ARRAY['mac and cheese','mac & cheese','cheese sauce'],
   ARRAY[]::TEXT[],
   'puree', 'steamed_then_pureed', 0.20,
   '1/2 cup pureed carrot per 2 cups cheese sauce',
   'Steam carrot until very soft, puree, whisk into the cheese sauce.',
   'Orange + orange = invisible. Carrot reinforces the cheddar color.',
   83),

  -- Beet
  ('beet',
   ARRAY['chocolate cake','chocolate cupcake','red velvet'],
   ARRAY[]::TEXT[],
   'puree', 'roasted_then_pureed', 0.25,
   '1/2 cup pureed beet per 9 inch cake',
   'Roast beets until tender, peel, blend smooth, fold into the wet ingredients.',
   'Beets give chocolate cake a deep color and extra moisture. Pairs with red velvet famously.',
   82),

  ('beet',
   ARRAY['hummus','dip'],
   ARRAY[]::TEXT[],
   'puree', 'roasted_then_pureed', 0.30,
   '1/4 cup roasted beet per 1 cup hummus',
   'Roast and peel beet, blend with the chickpeas and tahini.',
   'Beet hummus is bright pink - kids think it is "fairy hummus". Win.',
   70),

  -- Sweet potato
  ('sweet potato',
   ARRAY['mac and cheese','mac & cheese','cheese sauce'],
   ARRAY[]::TEXT[],
   'puree', 'roasted_then_pureed', 0.30,
   '1/2 cup pureed sweet potato per 2 cups cheese sauce',
   'Roast sweet potato, scoop the flesh, blend smooth, then whisk into the cheese sauce.',
   'Sweet potato matches cheddar color and adds creaminess. Slight sweetness amplifies the cheese flavor.',
   90),

  ('sweet potato',
   ARRAY['pancake','waffle'],
   ARRAY[]::TEXT[],
   'puree', 'roasted_then_pureed', 0.25,
   '1/2 cup pureed sweet potato per cup of flour',
   'Mix the puree into the wet ingredients before adding flour.',
   'Sweet potato pancakes look slightly orange - call them "sunshine pancakes" and the kid is sold.',
   88),

  -- Butternut squash
  ('butternut squash',
   ARRAY['mac and cheese','mac & cheese','cheese sauce','alfredo'],
   ARRAY[]::TEXT[],
   'puree', 'roasted_then_pureed', 0.30,
   '1/2 cup pureed butternut squash per 2 cups cheese sauce',
   'Roast cubed butternut, blend with a bit of milk, then whisk into the sauce.',
   'Butternut and cheddar are basically the same color. Adds silkiness too.',
   90),

  -- Pumpkin
  ('pumpkin',
   ARRAY['muffin','pancake','waffle','quick bread'],
   ARRAY[]::TEXT[],
   'puree', 'canned_or_pureed', 0.30,
   '1/2 cup pumpkin puree per dozen muffins',
   'Use canned pumpkin puree (or roast and blend your own). Add to the wet ingredients.',
   'Pumpkin makes baked goods moist and slightly orange. Pair with cinnamon for cover.',
   89),

  -- Avocado
  ('avocado',
   ARRAY['brownie','chocolate frosting','chocolate pudding'],
   ARRAY[]::TEXT[],
   'puree', 'mashed_smooth', 0.50,
   '1 ripe avocado per pan of brownies (replaces half the butter)',
   'Mash avocado completely smooth, swap in for half the butter or oil.',
   'Cocoa hides avocado completely. Kids get healthy fats instead of butter.',
   85),

  -- Black beans
  ('black beans',
   ARRAY['brownie'],
   ARRAY[]::TEXT[],
   'puree', 'rinsed_then_pureed', 0.40,
   '1 can black beans (drained, rinsed, pureed) per pan of brownies',
   'Drain and rinse the beans well, blend until completely smooth, swap for the flour entirely.',
   'Famous flourless brownie hack. Beans add protein and disappear into the chocolate.',
   75),

  -- Mushroom
  ('mushroom',
   ARRAY['meatball','meatloaf','burger','taco meat'],
   ARRAY['protein'],
   'finely-chop', 'finely_diced', 0.25,
   '1 cup finely-diced mushrooms per pound of ground meat',
   'Dice mushrooms very small (or pulse in a food processor), saute until dry, mix into the meat.',
   'Mushrooms taste meaty and disappear into ground beef texture. Saute first to drive off water.',
   80),

  -- Lentils
  ('lentils',
   ARRAY['bolognese','spaghetti sauce','meat sauce','taco meat'],
   ARRAY['protein'],
   'finely-chop', 'cooked_then_finely_chopped', 0.30,
   '1/2 cup cooked lentils per pound of meat',
   'Cook lentils until soft, drain, mix into the cooked meat with the sauce.',
   'Lentils mimic ground meat texture. Add sparingly the first time.',
   78);

COMMENT ON TABLE hidden_veggie_techniques IS 'US-297: vetted catalog of hidden-veggie techniques';
COMMENT ON COLUMN hidden_veggie_techniques.recipe_keywords IS
  'Case-insensitive substring keywords matched against recipe name/description/instructions';
COMMENT ON COLUMN hidden_veggie_techniques.max_ratio IS
  'Upper bound on host-item replacement; the rewriter caps suggestions here';
COMMENT ON COLUMN hidden_veggie_techniques.stealth_score IS
  '0-100 calibrated likelihood the kid will not detect the swap';
