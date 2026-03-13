# EatPal pSEO 2.0 System — Phase 1: Niche Taxonomy

---

## PROJECT VARIABLES (Adapted for EatPal)

```
PROJECT_NAME: "EatPal"
SITE_URL: "https://eatpal.com"
SITE_DESCRIPTION: "AI-powered meal planning platform for families with picky eaters 
  ages 2-12. Uses food chaining science to gradually expand a child's diet from 
  safe foods to new ones through systematic, evidence-based exposure."

PRIMARY_DATA_ASSETS:
  - "500+ foods with category, texture profile, flavor profile, sensory properties, 
     and food chain relationships"
  - "Food chaining maps: safe food → bridge food → target food (3-step progressions)"
  - "Meal plan templates organized by age group, challenge type, and dietary restriction"
  - "20+ feeding challenge types with clinical descriptions (ARFID, texture aversion, 
     food neophobia, limited repertoire, mealtime anxiety, brand dependency, etc.)"
  - "50+ picky-eater-adapted recipes with substitution guides"
  - "Progress tracking data schema: ate / tasted / refused / refused to look at"

TECH_STACK: "React TypeScript, Supabase (PostgreSQL), Tailwind CSS, 
  Claude/OpenAI via Supabase Edge Functions, n8n for automation"

TARGET_AUDIENCE: "Parents of children ages 2-12 with selective eating, families 
  managing ARFID or sensory food aversion, feeding therapists seeking white-label tools"

COMPETITORS: ["yummly.com", "mealime.com", "feedingtherapy.com", "arfidawareness.com"]

PRIMARY_GOAL: "Own long-tail search for food chaining, picky eater meal planning, 
  and feeding challenge content through 1,200-1,500 programmatic pages that are 
  genuinely more useful than anything else ranking for these terms"

MONTHLY_ORGANIC_CLICKS_CURRENT: 0 (pre-launch)
TARGET_PAGES_TO_GENERATE: 1500
```

---

## PHASE 1A: DIMENSION IDENTIFICATION

### Overview

Five core dimensions produce EatPal's page matrix. The key insight: **food chaining** 
is a scientifically-backed term with meaningful search volume and almost zero SaaS 
competition. Every dimension below is designed to intersect with it naturally.

---

### Dimension 1: SAFE FOOD (Starting Point)

**What it is:** The food a child already accepts. The anchor of every food chaining page.  
**Why it works:** Parents search by the *specific* food their child eats — not generic picky eating.  
**Estimated values:** 52 foods across 3 tiers  
**Estimated combinations with D2 + D3:** 52 × 4 × 8 = **1,664 possible pages**

#### Tier 1 — Highest Search Volume + Conversion Intent (22 foods)

These are the foods parents mention most often when describing their picky eater.
Pages built on these foods get the most organic surface area.

| Slug | Display Name | Category |
|------|-------------|----------|
| `chicken-nuggets` | Chicken Nuggets | Protein |
| `mac-and-cheese` | Mac and Cheese | Carb/Dairy |
| `plain-pasta` | Plain Pasta (no sauce) | Carb |
| `pizza` | Plain Cheese Pizza | Mixed |
| `grilled-cheese` | Grilled Cheese | Carb/Dairy |
| `hot-dogs` | Hot Dogs | Protein |
| `french-fries` | French Fries | Carb/Veg |
| `white-bread` | White Bread / Toast | Carb |
| `peanut-butter` | Peanut Butter (on crackers/bread) | Protein |
| `applesauce` | Applesauce | Fruit |
| `bananas` | Bananas | Fruit |
| `cheese` | Cheese (sliced/cubed) | Dairy |
| `crackers` | Crackers (Goldfish, Ritz, etc.) | Carb |
| `yogurt` | Yogurt (plain or vanilla) | Dairy |
| `scrambled-eggs` | Scrambled Eggs | Protein |
| `pancakes` | Pancakes / Waffles | Carb |
| `quesadilla` | Cheese Quesadilla | Carb/Dairy |
| `cereal` | Dry Cereal | Carb |
| `apple-slices` | Apple Slices | Fruit |
| `rice` | Plain White Rice | Carb |
| `butter-noodles` | Butter Noodles | Carb |
| `pb-and-j` | PB&J Sandwich | Mixed |

#### Tier 2 — Moderate Volume, Strong Intent (18 foods)

| Slug | Display Name | Category |
|------|-------------|----------|
| `chicken-tenders` | Chicken Tenders | Protein |
| `meatballs` | Meatballs (plain) | Protein |
| `corn` | Corn (plain / off the cob) | Veg |
| `carrots-raw` | Raw Carrots | Veg |
| `cucumber` | Cucumber Slices | Veg |
| `string-cheese` | String Cheese | Dairy |
| `milk` | Milk | Dairy |
| `goldfish-crackers` | Goldfish Crackers | Carb |
| `saltine-crackers` | Saltine Crackers | Carb |
| `plain-hamburger` | Plain Hamburger (no toppings) | Protein |
| `fish-sticks` | Fish Sticks | Protein |
| `frozen-waffles` | Frozen Waffles | Carb |
| `oatmeal-plain` | Plain Oatmeal | Carb |
| `plain-chicken-breast` | Plain Baked Chicken Breast | Protein |
| `mashed-potatoes` | Mashed Potatoes (plain) | Veg/Carb |
| `grapes` | Grapes | Fruit |
| `strawberries` | Strawberries | Fruit |
| `watermelon` | Watermelon | Fruit |

#### Tier 3 — Lower Volume, High Specificity (12 foods)

| Slug | Display Name | Category |
|------|-------------|----------|
| `plain-toast` | Plain Toast (dry) | Carb |
| `raisins` | Raisins | Fruit |
| `pear` | Pear (peeled) | Fruit |
| `mandarin-oranges` | Mandarin Orange Slices | Fruit |
| `plain-bagel` | Plain Bagel | Carb |
| `cream-cheese` | Cream Cheese | Dairy |
| `hummus` | Hummus | Protein |
| `edamame` | Edamame | Protein/Veg |
| `plain-rice-cakes` | Plain Rice Cakes | Carb |
| `vanilla-ice-cream` | Vanilla Ice Cream | Dairy |
| `vanilla-pudding` | Vanilla Pudding | Dairy |
| `bread-rolls` | Plain Dinner Rolls | Carb |

---

### Dimension 2: AGE GROUP / DEVELOPMENTAL STAGE

**What it is:** Child's current age, which determines developmental context and feeding approach.  
**Why it matters:** Parent search behavior changes dramatically by age. A 2-year-old's refusal 
is developmental; a 10-year-old's may be ARFID. Content needs to reflect this.  
**Values:** 4 tiers (all Tier 1 — all drive significant traffic)

| Slug | Display Name | Age Range | Tier |
|------|-------------|-----------|------|
| `toddler` | Toddler | 18 months – 3 years | 1 |
| `preschooler` | Preschooler | 3 – 5 years | 1 |
| `early-elementary` | Early Elementary | 6 – 8 years | 1 |
| `tween` | Tween | 9 – 12 years | 1 |

---

### Dimension 3: FEEDING CHALLENGE TYPE

**What it is:** The specific selective eating pattern driving the parent's search.  
**Why it matters:** This dimension produces the most differentiated content. A page about 
mac and cheese for toddlers with texture sensitivity is completely different from one 
about mac and cheese for preschoolers with food neophobia.  
**Values:** 10 types across 2 tiers

#### Tier 1 — Highest Search Volume (6 types)

| Slug | Display Name | Description | Tier |
|------|-------------|-------------|------|
| `texture-sensitivity` | Texture Sensitivity | Child refuses foods based on how they feel in the mouth — slimy, mushy, crunchy, grainy | 1 |
| `limited-repertoire` | Limited Food Repertoire | Child eats fewer than 20 foods; any new food is met with refusal | 1 |
| `food-neophobia` | Food Neophobia | Fear of new or unfamiliar foods; will only eat known/safe foods | 1 |
| `mealtime-battles` | Mealtime Battles & Anxiety | Mealtimes are stressful events; child cries, has tantrums, or shuts down at the table | 1 |
| `arfid` | ARFID | Avoidant/Restrictive Food Intake Disorder; clinically significant restriction affecting nutrition or weight | 1 |
| `sensory-processing` | Sensory Processing Differences | Broader sensory issues that include but extend beyond food texture | 1 |

#### Tier 2 — Moderate Volume, High Specificity (4 types)

| Slug | Display Name | Description | Tier |
|------|-------------|-------------|------|
| `color-refusal` | Color-Based Refusal | Child refuses foods based on color (won't eat anything green, brown, etc.) | 2 |
| `brand-dependency` | Brand Dependency | Child will only eat specific brand versions of safe foods | 2 |
| `food-jag` | Food Jag / Neophobia Regression | Child previously ate more foods but has narrowed repertoire after a negative experience | 2 |
| `mixed-foods-refusal` | Mixed / Touching Foods Refusal | Child refuses foods that touch on the plate or are mixed together | 2 |

---

### Dimension 4: MEAL OCCASION

**What it is:** When and where the meal is being served.  
**Why it matters:** "School lunch ideas for picky eaters" and "dinner ideas for picky eaters" 
are completely different searches with different constraints and solutions.  
**Values:** 7 occasions across 2 tiers

| Slug | Display Name | Key Constraint | Tier |
|------|-------------|---------------|------|
| `weeknight-dinner` | Weeknight Dinner | Speed + family-friendly | 1 |
| `school-lunch` | School / Daycare Lunch | No heating, no allergens, visually safe | 1 |
| `breakfast` | Breakfast | Morning time pressure, nutritional start | 1 |
| `snack` | Snacks & Between-Meals | Small portions, safe foods, energy | 1 |
| `holiday-meals` | Holiday & Special Occasion | High-pressure, unfamiliar foods present | 2 |
| `restaurant` | Restaurant Dining | No control over kitchen, peer pressure | 2 |
| `birthday-party` | Birthday Parties | Social anxiety, cake pressure, peer foods | 2 |

---

### Dimension 5: DIETARY RESTRICTION (Filter Layer)

**What it is:** Household dietary constraints that narrow food options further.  
**Why it matters:** A picky eater with a gluten intolerance is a dramatically underserved 
search niche — twice constrained.  
**Values:** 6 types  
**Usage:** Applied as a filter/modifier to D1-D4 pages, not a standalone primary dimension.  
Creates secondary URL patterns like `/gluten-free/food-chaining/chicken-nuggets`

| Slug | Display Name | Notes | Tier |
|------|-------------|-------|------|
| `no-restrictions` | No Dietary Restrictions | Default state | 1 |
| `gluten-free` | Gluten-Free | Celiac or sensitivity — enormous underserved niche | 1 |
| `dairy-free` | Dairy-Free | Allergy or intolerance | 1 |
| `nut-free` | Nut-Free | School policy + allergy | 1 |
| `egg-free` | Egg-Free | Common childhood allergy | 2 |
| `top8-free` | Top 8 Allergen-Free | Multiple simultaneous restrictions | 2 |

---

### Dimension Combination Matrix

| Dimension Cross | Formula | Estimated Pages |
|----------------|---------|-----------------|
| Safe Food × Age Group | 52 × 4 | 208 |
| Safe Food × Challenge Type | 52 × 10 | 520 |
| Age Group × Meal Occasion | 4 × 7 | 28 |
| Age Group × Challenge Type | 4 × 10 | 40 |
| Challenge Type × Meal Occasion | 10 × 7 | 70 |
| Safe Food × Age Group × Challenge (3-way, Tier 1 only) | 22 × 4 × 6 | 528 |
| Meal Occasion × Dietary Restriction | 7 × 5 | 35 |
| Safe Food × Dietary Restriction (Tier 1 foods only) | 22 × 5 | 110 |
| **TOTAL ESTIMATED UNIQUE PAGES** | | **~1,539** |

**Within target of 1,500.** Priority order for generation: Start with Safe Food × Challenge 
(520 pages) since food chaining is the golden keyword, then layer in 3-way combos.

---

## PHASE 1B: CONTEXT OBJECTS

Complete context objects for all Tier 1 values across all 5 dimensions.

---

### DIMENSION 1: SAFE FOOD — Context Objects

---

```json
{
  "slug": "chicken-nuggets",
  "name": "Chicken Nuggets",
  "dimension": "safe_food",
  "tier": 1,
  "context": {
    "audience": "Parents whose child exclusively accepts chicken nuggets as their main protein source — usually a shaped, breaded, uniform product. Often the child requires a specific brand (Tyson, Perdue, McDonald's) and refuses homemade versions.",
    "pain_points": "Child will eat nuggets at every meal. Parent worries about nutrition, processing, sodium. Has tried introducing other proteins but child refuses any variation. Guilt about serving the same food daily. Afraid of 'breaking' the nugget acceptance if they push too hard.",
    "search_behavior": "Searches: 'my kid only eats chicken nuggets', 'food chaining chicken nuggets', 'how to get toddler to eat more than nuggets', 'what to serve with chicken nuggets picky eater'. Uses desperate, specific phrasing.",
    "content_that_works": "Step-by-step food chaining progression (nuggets → grilled chicken strips → chicken breast). Comparison table of bridge foods that share texture/flavor properties. Printable try-bite tracking sheet. Real parent success story format.",
    "what_makes_it_useful": "A specific 3-step progression with exactly which bridge foods to try first and how long to wait before moving to the next step. Not generic 'introduce new foods slowly' — actual named foods with rationale.",
    "subtopics": [
      "homemade nuggets as bridge food",
      "dipping sauce variations to introduce flavor",
      "nugget-shaped foods in other proteins (fish nuggets, turkey nuggets)",
      "texture-matching foods for texture-sensitive kids",
      "when nugget dependency signals ARFID vs normal picky eating"
    ],
    "food_chain_progression": {
      "step_1_bridges": ["chicken tenders (less uniform)", "homemade chicken nuggets", "popcorn chicken"],
      "step_2_targets": ["grilled chicken strips", "baked chicken breast pieces", "chicken stir-fry pieces"],
      "step_3_long_range": ["turkey meatballs", "fish fillets", "pork tenderloin strips"],
      "shared_properties": ["crispy exterior", "mild flavor", "uniform shape/size", "dippable"]
    }
  }
}
```

---

```json
{
  "slug": "mac-and-cheese",
  "name": "Mac and Cheese",
  "dimension": "safe_food",
  "tier": 1,
  "context": {
    "audience": "Parents whose child accepts mac and cheese as primary or only carb/dinner option. Child may require boxed version (Kraft blue box specifically) and reject homemade, restaurant, or any variation. Dairy + carb combo is texture-appealing to many sensory-sensitive kids.",
    "pain_points": "Child detects any recipe change (different pasta shape, different cheese, added vegetables). Parent can't hide vegetables in it. Child's diet is nutritionally narrow. Embarrassment when eating out — only orders mac and cheese. Parents wonder if the child will eat this forever.",
    "search_behavior": "Searches: 'food chaining mac and cheese', 'getting picky eater off mac and cheese', 'mac and cheese variations picky eater', 'my child only eats mac and cheese dinner', 'hiding vegetables in mac and cheese picky eater'. Volume peaks at 6pm on weeknights.",
    "content_that_works": "Side-by-side comparison of mac variations the child is likely to accept. Bridge food chart based on shared creaminess + carb properties. Recipe with 5-ingredient homemade version that mimics boxed texture. Visual step ladder graphic.",
    "what_makes_it_useful": "The specific order in which to introduce mac variations (shape change first, then brand change, then sauce change, then added mix-ins) with a week-by-week timeline. Acknowledging that Kraft blue box acceptance is a starting point, not a failure.",
    "subtopics": [
      "creamy texture foods similar to mac and cheese",
      "pasta shape variations as first bridge food",
      "adding protein to mac and cheese without changing flavor",
      "homemade mac and cheese recipe that mimics boxed",
      "moving from mac to other pasta dishes",
      "mac and cheese as school lunch (thermos tips)"
    ],
    "food_chain_progression": {
      "step_1_bridges": ["different mac shape (same brand)", "homemade mac close to Kraft texture", "white pasta with butter and parmesan"],
      "step_2_targets": ["pasta with mild cream sauce", "cheese ravioli", "pasta with small hidden additions"],
      "step_3_long_range": ["risotto", "grilled cheese cut into pasta-sized pieces", "any creamy casserole"],
      "shared_properties": ["creamy/smooth texture", "mild cheese flavor", "soft pasta", "uniform appearance"]
    }
  }
}
```

---

```json
{
  "slug": "plain-pasta",
  "name": "Plain Pasta (No Sauce)",
  "dimension": "safe_food",
  "tier": 1,
  "context": {
    "audience": "Parents whose child only eats pasta with no sauce whatsoever — not even butter in some cases. Often paired with Dimension 3: texture sensitivity or Dimension 3: mixed foods refusal since sauce changes the texture of pasta.",
    "pain_points": "Every family dinner requires cooking a separate plain batch. Child cannot eat restaurant pasta. Nutritionally void meal. Other family members frustrated. Parent exhausted by double-cooking.",
    "search_behavior": "Searches: 'toddler only eats plain pasta', 'picky eater refuses pasta sauce', 'how to get kids to try pasta with sauce', 'plain pasta picky eater dinner ideas'. Often combined with age-specific searches.",
    "content_that_works": "The 'dry dip' method — introducing sauce on the side as a dipping option before it touches pasta. Texture progression from dry to lightly coated. Parent-friendly framing that validates the child's sensory experience.",
    "what_makes_it_useful": "Specific techniques for introducing sauce that don't require food touching: sauce on the side, pasta served separately from sauce, tiny amounts of butter first since it's transparent. Printable 'pasta progression ladder' from dry to sauced.",
    "subtopics": [
      "why kids refuse pasta sauce (texture science)",
      "introducing butter as first pasta coating",
      "separate-plate serving technique",
      "pasta shapes that hold different sauce amounts",
      "moving from plain pasta to other soft carbs"
    ],
    "food_chain_progression": {
      "step_1_bridges": ["pasta with tiny amount of butter (transparent)", "pasta with very light olive oil", "pasta with parmesan dusted on top (dry)"],
      "step_2_targets": ["pasta with butter and mild cheese", "pasta with cream sauce (white, not red)", "pasta with very smooth tomato sauce"],
      "step_3_long_range": ["pasta bake / casserole", "soup with pasta in it", "any mixed pasta dish"],
      "shared_properties": ["soft texture", "neutral/mild flavor", "no visible sauce", "predictable appearance"]
    }
  }
}
```

---

```json
{
  "slug": "pizza",
  "name": "Cheese Pizza (Plain)",
  "dimension": "safe_food",
  "tier": 1,
  "context": {
    "audience": "Parents whose child accepts cheese pizza but refuses any topping variations. Child may require specific brand/restaurant pizza. This is actually a strong starting point — pizza has multiple components (bread, sauce, cheese) that can be separated and used as bridge foods.",
    "pain_points": "Toppings on pizza are a non-starter. Birthday parties where only pepperoni pizza is available become anxiety events. Child refuses homemade pizza because it 'looks different'. Parent frustrated because pizza seems easy but the restrictions are very specific.",
    "search_behavior": "Searches: 'picky eater only eats plain cheese pizza', 'food chaining from pizza', 'birthday party food for picky eaters', 'how to get kids to try pizza toppings'.",
    "content_that_works": "Pizza deconstruction approach — each component of pizza (bread, sauce, cheese) as individual bridge foods. Side-by-side visual of 'pizza family' foods. Party planning guide for picky eater with pizza as social-eating anchor.",
    "what_makes_it_useful": "Strategy for using pizza components to expand diet: if they eat pizza sauce, they can eat tomato-based pasta. If they eat the bread, they can eat flatbread. Pizza as a multi-door entry point is underused.",
    "subtopics": [
      "using pizza components as bridge foods",
      "introducing toppings one at a time",
      "pizza for school lunch (thermos, cold slice)",
      "flatbread as pizza bridge food",
      "navigating birthday parties with picky eaters"
    ],
    "food_chain_progression": {
      "step_1_bridges": ["cheese flatbread", "French bread pizza", "pizza rolls (same flavor, different shape)"],
      "step_2_targets": ["pizza with one topping child chose", "stromboli (rolled, less visible toppings)", "calzone"],
      "step_3_long_range": ["any tomato-based pasta", "lasagna (familiar cheese layer)", "caprese salad"],
      "shared_properties": ["familiar tomato-cheese combination", "bread base", "melted cheese texture", "predictable flavor"]
    }
  }
}
```

---

```json
{
  "slug": "grilled-cheese",
  "name": "Grilled Cheese",
  "dimension": "safe_food",
  "tier": 1,
  "context": {
    "audience": "Parents whose child accepts grilled cheese as a safe lunch or dinner. Often correlates with acceptance of other 'crispy outside / soft inside' foods. The contrast texture is key — child may have specific preferences about how toasted it is.",
    "pain_points": "Grilled cheese is the only 'real food' the child reliably eats. Parent needs variety but child refuses quesadilla, panini, or any variation. Meal gets boring. Child refuses when bread brand changes.",
    "search_behavior": "Searches: 'variations on grilled cheese for picky eaters', 'food chaining from grilled cheese', 'grilled cheese picky eater lunch ideas', 'my kid only eats grilled cheese'.",
    "content_that_works": "The 'grilled cheese family' — visual chart of all foods sharing crispy-outside/soft-inside texture. Ingredient variation guide (cheese types, bread types) with difficulty ratings. What to serve alongside as try-bite.",
    "what_makes_it_useful": "Recognition that grilled cheese is actually a versatile safe food — the crispy/melted texture profile opens doors to quesadillas, paninis, grilled chicken with cheese, and more. Framing acceptance as a strength.",
    "subtopics": [
      "cheese type variations (same texture)",
      "bread variations to try first",
      "quesadilla as grilled cheese bridge food",
      "adding protein to grilled cheese",
      "grilled cheese for school lunch"
    ],
    "food_chain_progression": {
      "step_1_bridges": ["quesadilla (familiar cheese, corn tortilla)", "panini (same concept, different bread)", "grilled cheese with different cheese type"],
      "step_2_targets": ["grilled cheese with thin turkey slice (hidden inside)", "grilled cheese with tomato", "melt (open-face, cheese on any base)"],
      "step_3_long_range": ["sandwich with melted cheese as topping", "pizza (similar cheese component)", "any casserole with cheese crust"],
      "shared_properties": ["crispy exterior", "melted cheese interior", "toasted bread base", "mild flavor"]
    }
  }
}
```

---

```json
{
  "slug": "hot-dogs",
  "name": "Hot Dogs",
  "dimension": "safe_food",
  "tier": 1,
  "context": {
    "audience": "Parents whose child accepts hot dogs as primary protein. Child often requires a specific brand and may refuse when cut differently or served without bun. Hot dogs are nutritionally concerning to parents but reliably accepted by extremely selective eaters due to soft texture + mild processed flavor.",
    "pain_points": "Hot dogs every night is embarrassing and nutritionally worrying. Child rejects all other proteins. Parent embarrassed to admit this to pediatrician. Fear the child will never eat 'real' meat.",
    "search_behavior": "Searches: 'my toddler only eats hot dogs', 'food chaining from hot dogs', 'how to get picky eater to try other proteins besides hot dogs', 'healthy alternatives to hot dogs for picky eaters'.",
    "content_that_works": "Non-judgmental validation that hot dog acceptance is actually useful starting data (soft texture, mild processed flavor preference). Clear protein progression from hot dogs to other sausages to ground meat. How to use hot dog flavor profile as compass.",
    "what_makes_it_useful": "Specific list of 'hot dog family' proteins in order of introduction difficulty. Turkey hot dogs vs. beef as first brand variation. Corn dogs as slightly elevated version with batter coating. Sausage links as shape-similar bridge.",
    "subtopics": [
      "hot dog varieties as progression steps",
      "corn dogs as bridge food",
      "sausage links as hot dog substitute",
      "hiding vegetables in hot dog dishes",
      "cutting technique impact on acceptance"
    ],
    "food_chain_progression": {
      "step_1_bridges": ["turkey hot dogs (same shape, different brand)", "mini hot dogs / cocktail sausages", "corn dogs (same interior, different exterior)"],
      "step_2_targets": ["breakfast sausage links (similar texture)", "kielbasa (sliced)", "ground meat in familiar sauce"],
      "step_3_long_range": ["meatballs (same processing level)", "burger (similar ground meat)", "sausage in pasta"],
      "shared_properties": ["processed/smooth meat texture", "mild savory flavor", "cylindrical shape", "soft bite"]
    }
  }
}
```

---

```json
{
  "slug": "french-fries",
  "name": "French Fries",
  "dimension": "safe_food",
  "tier": 1,
  "context": {
    "audience": "Parents whose child reliably eats french fries but refuses most other vegetables. Fries are often a 'gateway vegetable' — the child is technically eating potato. Understanding this opens up potato-based and crispy vegetable progressions.",
    "pain_points": "Parent doesn't want to serve fries every day. Child refuses oven-baked versions. Child won't try other potato preparations. Parent frustrated that the only vegetable accepted is fried. Nutrition guilt is high.",
    "search_behavior": "Searches: 'food chaining from french fries vegetables', 'my kid only eats french fries no other vegetables', 'how to get picky eater to eat vegetables like french fries', 'crispy vegetables for picky eaters'.",
    "content_that_works": "The 'crispy vegetable family' concept — foods that share the crispy-exterior/soft-interior profile of fries. Oven-baked vs. air-fryer as first step. Potato varieties as middle steps. Then non-potato vegetables in the same format.",
    "what_makes_it_useful": "Reframe fries not as junk food to eliminate but as a bridge food to build from. Air fryer technique for carrot fries, zucchini fries, green bean fries that share shape + texture. Recipe cards for 6 'fry-style' vegetables.",
    "subtopics": [
      "oven-baked fries as first step from deep-fried",
      "sweet potato fries as bridge food",
      "carrot fries recipe for picky eaters",
      "air fryer vegetables that taste like fries",
      "dipping sauces to introduce alongside new fry-style vegetables"
    ],
    "food_chain_progression": {
      "step_1_bridges": ["oven-baked fries (same food, different cooking method)", "sweet potato fries (similar shape, different color — introduce gradually)", "waffle fries (same food, different shape)"],
      "step_2_targets": ["zucchini fries (air-fried)", "carrot fries (roasted to crispy)", "parsnip fries"],
      "step_3_long_range": ["roasted broccoli (crispy florets)", "any vegetable roasted until crispy-edged", "hash browns (potato in new form)"],
      "shared_properties": ["elongated shape", "crispy exterior", "mild/starchy interior", "dippable format"]
    }
  }
}
```

---

```json
{
  "slug": "peanut-butter",
  "name": "Peanut Butter (on crackers or bread)",
  "dimension": "safe_food",
  "tier": 1,
  "context": {
    "audience": "Parents whose child readily accepts peanut butter as protein source. PB is a nutritional win (protein + fat) so parent's main goal is using it as a bridge to other nut butters, seeds, and eventually more varied proteins. High overlap with kids who accept few textures — smooth PB is a very specific texture profile.",
    "pain_points": "Child only accepts smooth, not crunchy. Will only eat on white bread or specific crackers. School is nut-free so this goes away from lunch options. Parent worried about nutritional diversity.",
    "search_behavior": "Searches: 'nut-free alternatives to peanut butter picky eater', 'food chaining from peanut butter', 'picky eater protein sources besides peanut butter', 'sunflower butter picky eater'.",
    "content_that_works": "Nut butter progression chart (PB → almond butter → sunflower seed butter for nut-free schools). Dipping sauce ladder that starts with PB as dip and progresses. List of school-safe alternatives with similar texture profiles.",
    "what_makes_it_useful": "Specific texture comparison of different nut/seed butters with smoothness ratings. Script for introducing new butters (serve PB alongside new option, never replace cold turkey). Nut-free school lunch solution guide.",
    "subtopics": [
      "nut-free alternatives to peanut butter",
      "sunflower seed butter as bridge food",
      "almond butter introduction",
      "peanut butter as protein baseline",
      "PB2 powder as texture bridge",
      "peanut sauce as flavor introduction"
    ],
    "food_chain_progression": {
      "step_1_bridges": ["almond butter (same texture, different flavor)", "sunflower seed butter (nut-free, very similar)", "WowButter (soy-based, closest PB mimic)"],
      "step_2_targets": ["cashew butter", "tahini (sesame, used as dip)", "hummus (similar smooth texture, different flavor)"],
      "step_3_long_range": ["any smooth nut/seed-based sauce", "peanut sauce on noodles", "protein smoothie with PB2"],
      "shared_properties": ["smooth thick texture", "high fat content = satisfaction", "spreadable consistency", "mild sweet-salty flavor"]
    }
  }
}
```

---

```json
{
  "slug": "yogurt",
  "name": "Yogurt (Plain or Vanilla)",
  "dimension": "safe_food",
  "tier": 1,
  "context": {
    "audience": "Parents whose child accepts yogurt — often a significant nutritional win since yogurt provides protein, calcium, and probiotics. Child typically requires smooth (not chunky), usually full-fat, and rejects Greek yogurt's tanginess or any yogurt with fruit pieces.",
    "pain_points": "Child rejects Greek yogurt, flavored yogurts, yogurt with fruit pieces (texture), any yogurt that looks 'different'. Parent wants to use yogurt as calcium source but variety is completely limited.",
    "search_behavior": "Searches: 'food chaining from yogurt', 'picky eater dairy alternatives if they eat yogurt', 'getting kids to try Greek yogurt', 'picky eater calcium sources yogurt'.",
    "content_that_works": "Smooth food family map — yogurt shares texture with pudding, smoothies, applesauce. Greek yogurt introduction with honey to mask tanginess. Smoothie as hidden protein delivery system.",
    "what_makes_it_useful": "Yogurt as hidden protein vehicle — specific recipes for yogurt-based dips that look like sauces. Greek vs. regular yogurt transition technique (mixing 90/10 then adjusting ratio). Yogurt as a 'gateway smooth food' to other dairy sources.",
    "subtopics": [
      "Greek yogurt introduction for kids who eat regular yogurt",
      "yogurt as sauce base (ranch dip recipe)",
      "yogurt smoothie recipes for picky eaters",
      "dairy alternatives if yogurt is the only dairy",
      "yogurt parfait as try-bite delivery system"
    ],
    "food_chain_progression": {
      "step_1_bridges": ["Greek yogurt mixed 80/20 with regular", "yogurt with very smooth (strained) jam", "yogurt-based dip (like tzatziki with familiar flavor)"],
      "step_2_targets": ["cottage cheese (mashed to similar texture)", "sour cream (used as dip)", "any smoothie where yogurt is hidden"],
      "step_3_long_range": ["smoothie bowls", "kefir", "ricotta in sweet preparations"],
      "shared_properties": ["smooth creamy texture", "mild tangy dairy flavor", "cold serving temperature", "high fat content"]
    }
  }
}
```

---

```json
{
  "slug": "scrambled-eggs",
  "name": "Scrambled Eggs",
  "dimension": "safe_food",
  "tier": 1,
  "context": {
    "audience": "Parents whose child accepts scrambled eggs — a protein-rich base that opens several food chaining paths. Child may require specific egg preparation (very soft/wet vs. dry, no browning), which tells you a lot about their texture preferences.",
    "pain_points": "Child only accepts one preparation of eggs (usually very soft). Rejects fried, hard-boiled, poached. Won't eat eggs in dishes (egg in fried rice, frittata). Parent tired of making eggs for every protein meal.",
    "search_behavior": "Searches: 'picky eater egg variations', 'food chaining from scrambled eggs', 'getting kids to eat other forms of eggs', 'scrambled eggs for picky eater breakfast ideas'.",
    "content_that_works": "Egg preparation ladder from softest (scrambled, very wet) to firmer (fried, hard-boiled). 'Eggs in disguise' — using scrambled egg texture in other dishes. Visual guide to egg preparations sorted by texture.",
    "what_makes_it_useful": "If child eats soft scrambled eggs, they may accept: custard (same texture, sweet context), egg drop soup, and eventually soft quiche. The texture profile unlocks a pathway. Specific technique guide for the exact soft scrambled consistency most kids accept.",
    "subtopics": [
      "egg preparation texture spectrum",
      "moving from scrambled to other egg types",
      "eggs in other dishes (fried rice, frittata)",
      "protein breakfast alternatives to eggs",
      "scrambled egg texture in sweet foods (custard)"
    ],
    "food_chain_progression": {
      "step_1_bridges": ["soft scrambled with different add-in (cheese on top)", "egg crepe (very thin, same scrambled interior)", "french toast (egg-soaked bread, familiar flavor)"],
      "step_2_targets": ["frittata (scrambled in different form)", "egg bites/cups", "fried egg (same ingredient, different appearance)"],
      "step_3_long_range": ["quiche (egg in pastry)", "egg fried rice", "egg salad (if they accept mayo texture)"],
      "shared_properties": ["soft pillowy texture", "mild eggy flavor", "yellow color", "hot serving temperature"]
    }
  }
}
```

---

```json
{
  "slug": "crackers",
  "name": "Crackers (Goldfish, Ritz, etc.)",
  "dimension": "safe_food",
  "tier": 1,
  "context": {
    "audience": "Parents whose child accepts crackers as primary snack. Often brand-specific (Goldfish specifically vs. generic). Crackers are a high-leverage safe food because the crunchy texture is shared with many chip-style and baked snack foods, providing a wide bridge surface.",
    "pain_points": "Child eats only one brand. Goldfish substitutes are rejected. Crackers are nutritionally limited. Parent can't use crackers as vehicle for dips or toppings. Snack time is completely non-negotiable.",
    "search_behavior": "Searches: 'alternatives to Goldfish crackers for picky eaters', 'food chaining crackers', 'healthy cracker alternatives picky eater', 'how to get kids to try new crackers'.",
    "content_that_works": "The 'crunch family' chart — all foods sharing crunchy-starchy texture (rice cakes, pretzels, chips, pita chips, breadsticks). Brand variation introduction guide. Using crackers as vehicle to introduce dips.",
    "what_makes_it_useful": "Specific strategy for brand transitions (introduce new cracker beside accepted one, never replace). Dip introduction sequence starting with brand-familiar cheese dip. Cracker to chip to baked snack progression.",
    "subtopics": [
      "brand variation introduction for crackers",
      "using crackers to introduce dips",
      "cracker to chip progression",
      "homemade cracker recipe (control over ingredients)",
      "cracker shapes and acceptance rates"
    ],
    "food_chain_progression": {
      "step_1_bridges": ["different cracker brand same flavor", "crackers in different shape", "rice cakes (similar crunch, different texture)"],
      "step_2_targets": ["pretzels", "breadsticks", "pita chips"],
      "step_3_long_range": ["any crunchy snack food", "raw vegetables with similar crunch (carrots)", "croutons in soup"],
      "shared_properties": ["satisfying crunch", "mild/salty flavor", "dry texture", "hand-held snack format"]
    }
  }
}
```

---

```json
{
  "slug": "applesauce",
  "name": "Applesauce",
  "dimension": "safe_food",
  "tier": 1,
  "context": {
    "audience": "Parents whose child accepts applesauce as a key fruit source — often the primary or only fruit in the diet. High overlap with texture-sensitive children who refuse whole fruit due to variable texture and seeds. Applesauce is the 'safe purée' for many toddlers who never transitioned off.",
    "pain_points": "Child won't eat whole apples, pears, or other fruit. Only smooth pouches or purées. Nutritionally very limited fruit intake. Parent worried about fiber and micronutrients. Child rejects any fruit piece in applesauce.",
    "search_behavior": "Searches: 'food chaining from applesauce to whole fruit', 'my toddler only eats applesauce', 'how to transition from pouches to whole food picky eater', 'picky eater fruit purée whole fruit transition'.",
    "content_that_works": "Applesauce to whole apple progression (applesauce → chunky applesauce → very soft cooked apple pieces → peeled raw apple → apple with skin). The 'smooth to textured' spectrum for fruits. DIY applesauce recipe as control tool.",
    "what_makes_it_useful": "Specific texture progression from smooth purée to whole food. Making DIY chunky applesauce as a controllable bridge. Other purée-based fruits that share properties with applesauce (pear sauce, mango purée). Recognizing that purée acceptance is a valid starting point.",
    "subtopics": [
      "transitioning from puréed to whole fruit",
      "making chunky applesauce at home as bridge",
      "other fruit purées similar to applesauce",
      "fruit pouches for picky eaters (pros and cons)",
      "smoothies as purée-to-whole-fruit bridge"
    ],
    "food_chain_progression": {
      "step_1_bridges": ["chunky applesauce (homemade, controllable texture)", "very soft cooked apple pieces mixed into applesauce", "pear sauce (almost identical texture/sweetness)"],
      "step_2_targets": ["soft cooked apple slices (no skin)", "banana (soft whole fruit, similar texture)", "very ripe mango pieces"],
      "step_3_long_range": ["peeled raw apple", "any soft fruit", "fruit salad"],
      "shared_properties": ["smooth or soft texture", "sweet mild flavor", "no seeds/tough parts", "familiar fruit taste"]
    }
  }
}
```

---

```json
{
  "slug": "bananas",
  "name": "Bananas",
  "dimension": "safe_food",
  "tier": 1,
  "context": {
    "audience": "Parents whose child accepts bananas as primary or sole fruit. Bananas are a high-leverage safe food — they're nutritious, soft, predictable in texture, and the yellow color is non-threatening. Child may require specific ripeness (very ripe vs. less ripe changes texture significantly).",
    "pain_points": "Child won't eat other fruit. Banana has to be at exact ripeness. Child won't accept banana in any form other than plain (rejects banana bread, smoothies with banana). Parent worried about potassium/micronutrient overload from too many bananas.",
    "search_behavior": "Searches: 'food chaining from bananas', 'my toddler only eats bananas', 'picky eater other fruits like bananas', 'soft fruits for picky eaters like bananas'.",
    "content_that_works": "Soft fruit family — foods sharing banana's texture (very ripe mango, peach, cooked pear). Using banana as smoothie introduction bridge. Banana variations (frozen banana, banana in oatmeal) as first steps.",
    "what_makes_it_useful": "Recognizing banana ripeness preference as a texture diagnostic tool — if child prefers very ripe bananas, they like very soft textures, which guides all other food chaining. The ripeness spectrum as a clinical insight.",
    "subtopics": [
      "other soft fruits similar to banana texture",
      "banana in smoothies as hidden bridge",
      "frozen banana as texture variation",
      "banana bread as banana-in-baked-good introduction",
      "mango as closest texture match to ripe banana"
    ],
    "food_chain_progression": {
      "step_1_bridges": ["very ripe mango pieces (softest tropical fruit)", "ripe peach (peeled, very soft)", "banana in smoothie (same food, new context)"],
      "step_2_targets": ["soft cooked pear", "melon (honeydew, very ripe)", "papaya"],
      "step_3_long_range": ["any soft fruit", "fruit purée cups", "fruit in oatmeal"],
      "shared_properties": ["very soft texture", "sweet mild flavor", "no seeds visible", "yellow/orange color (familiar)"]
    }
  }
}
```

---

```json
{
  "slug": "cheese",
  "name": "Cheese (Sliced or Cubed)",
  "dimension": "safe_food",
  "tier": 1,
  "context": {
    "audience": "Parents whose child accepts plain cheese as primary dairy and snack. Often American cheese or mild cheddar. Child may be a 'beige food' eater for whom cheese is a protein/fat staple. The mild, fatty, uniform texture of processed cheese is specifically appealing to texture-sensitive kids.",
    "pain_points": "Child won't try any cheese with stronger flavor. Rejects melted cheese (texture change). Won't accept cheese in dishes. Parent worried about sodium in processed American cheese.",
    "search_behavior": "Searches: 'food chaining from cheese', 'picky eater different cheese varieties', 'how to get kids to eat different types of cheese', 'mild cheese options for picky eaters'.",
    "content_that_works": "Cheese variety ladder from mildest to strongest flavor. Texture ladder from rubbery (American) to crumbly (feta). Using cheese as protein source and bridge to dairy variety.",
    "what_makes_it_useful": "Cheese tasting progression ordered by mildness: American → mild cheddar → colby jack → mozzarella → gouda. Understanding that cheese acceptance = dairy protein acceptance, which matters for nutrition planning.",
    "subtopics": [
      "mild cheese varieties for picky eaters",
      "cheese texture spectrum (rubbery to crumbly)",
      "cheese as protein vehicle",
      "string cheese as interactive food",
      "melted vs. cold cheese and texture sensitivity"
    ],
    "food_chain_progression": {
      "step_1_bridges": ["mild cheddar (similar to American but less processed)", "string cheese (same cheese, different format)", "mozzarella (very mild, different texture)"],
      "step_2_targets": ["colby jack", "muenster", "provolone"],
      "step_3_long_range": ["gouda", "Swiss", "any melted cheese on familiar food"],
      "shared_properties": ["mild dairy flavor", "high fat content", "semisolid texture", "savory/salty taste"]
    }
  }
}
```

---

```json
{
  "slug": "rice",
  "name": "Plain White Rice",
  "dimension": "safe_food",
  "tier": 1,
  "context": {
    "audience": "Parents whose child accepts plain white rice as safe carb — common in families with Asian dietary heritage but also widespread. White rice's soft, uniform, slightly sticky texture makes it ideal for certain texture profiles. Child typically refuses brown rice, fried rice, or rice with anything mixed in.",
    "pain_points": "Child refuses brown rice. Won't eat rice with sauce or seasoning. Can't introduce variety without full rejection. Limited to plain white rice as starch option.",
    "search_behavior": "Searches: 'food chaining from white rice', 'how to get picky eater to eat brown rice', 'rice variations for picky eaters', 'Asian picky eater meals'.",
    "content_that_works": "Rice preparation variations ordered by how similar they are to plain white. Brown rice introduction technique. Rice as base for try-bite attempts (sauce served separately on the side). Congee/porridge as texture-adjusted rice form.",
    "what_makes_it_useful": "Specific technique for transitioning to brown rice (mix 10% brown / 90% white and gradually adjust). Rice as a canvas food — it can hold sauce nearby without contaminating. Rice balls as interactive food for picky eaters.",
    "subtopics": [
      "transitioning from white to brown rice",
      "rice as a 'canvas' safe food alongside try-bites",
      "congee as texture-adjusted rice",
      "fried rice introduction for picky eaters",
      "rice cakes as bridge food from plain rice"
    ],
    "food_chain_progression": {
      "step_1_bridges": ["jasmine rice (fragrant, still white)", "rice with light butter", "rice cakes (compressed, same ingredient)"],
      "step_2_targets": ["rice mixed with mild vegetable broth", "brown rice 10% mixed in", "rice with sauce on the side"],
      "step_3_long_range": ["fried rice (familiar ingredient in new form)", "congee", "risotto"],
      "shared_properties": ["soft texture", "mild neutral flavor", "white/cream color", "fills up stomach"]
    }
  }
}
```

---

```json
{
  "slug": "pb-and-j",
  "name": "PB&J Sandwich",
  "dimension": "safe_food",
  "tier": 1,
  "context": {
    "audience": "Parents whose child accepts PB&J as lunch staple. This is one of the most common 'only foods' for school-age picky eaters. Child may require specific brand of PB, specific jelly flavor, specific bread, no crust. The combination of familiar sweetness + protein + carb makes this extremely reliable.",
    "pain_points": "PB&J every single school lunch for years. School may be nut-free. Child accepts no other sandwich. Can't substitute the jelly. Parent embarrassed at other families' lunches. Nutritionally adequate but boring.",
    "search_behavior": "Searches: 'alternatives to PB&J school lunch picky eater', 'nut-free PB&J alternatives', 'picky eater school lunch ideas besides PB&J', 'food chaining from PB&J sandwich'.",
    "content_that_works": "Nut-free school lunch alternatives that share PB&J's properties. Sandwich progression ladder. The 'same structure, different filling' approach. Week-long school lunch plan built from PB&J as anchor.",
    "what_makes_it_useful": "List of 8 school lunch options that maintain PB&J's reliable properties (portable, no heating required, sweet-savory, familiar). Sunflower butter + honey as first substitute for nut-free schools. Complete school lunch planning guide anchored on PB&J.",
    "subtopics": [
      "nut-free PB&J alternatives for school",
      "sunflower butter and honey sandwich",
      "sandwich variations for picky eaters",
      "building a school lunch plan from PB&J",
      "introducing different jelly flavors first",
      "transitioning from sandwich to wrap"
    ],
    "food_chain_progression": {
      "step_1_bridges": ["sunflower seed butter + same jelly (nut-free)", "PB + different jelly flavor", "PB + honey (no jelly, simpler)"],
      "step_2_targets": ["turkey and cheese sandwich (different filling, same bread + structure)", "cream cheese and jam", "almond butter and banana"],
      "step_3_long_range": ["any sandwich", "wrap (same filling, different bread)", "lunchbox snack plate (deconstructed sandwich)"],
      "shared_properties": ["portable", "no heating required", "familiar bread base", "sweet-savory combination"]
    }
  }
}
```

---

### DIMENSION 2: AGE GROUP — Context Objects

---

```json
{
  "slug": "toddler",
  "name": "Toddler",
  "dimension": "age_group",
  "tier": 1,
  "context": {
    "audience": "Parents of children 18 months to 3 years dealing with the normal developmental picky eating phase ('neophobia peak') who are unsure whether this is typical behavior or something to address. First-time parents are especially worried.",
    "pain_points": "Was eating everything at 12 months, now refuses most foods. Doctor says it's 'normal' but parent is worried. Mealtimes involve throwing food, turning head away, or crying. Afraid of creating bad habits. Wondering if ARFID is possible at this age.",
    "search_behavior": "Searches: 'toddler picky eater normal', '18 month old won't eat anything', 'toddler food neophobia', 'how to get toddler to eat new foods', '2 year old picky eater tips'. Uses 'my child' framing rather than clinical terms.",
    "content_that_works": "Validation-first content that normalizes neophobia peak (ages 18 months to 3 years). Developmental context that explains the biological reason. Simple, low-pressure food introduction techniques. How to know when it's beyond normal.",
    "what_makes_it_useful": "A chart showing 'normal picky eating vs. signs of something more' at toddler age. Specific low-pressure exposure techniques designed for this developmental stage (repeated neutral exposure, play-based food interaction, 'food on the plate but no pressure to eat').",
    "subtopics": [
      "neophobia peak explanation for parents",
      "division of responsibility at toddler meals",
      "food play vs. food pressure",
      "when to see a feeding therapist vs. wait and see",
      "toddler serving sizes and acceptance",
      "growth chart vs. food variety in picky toddlers"
    ]
  }
}
```

---

```json
{
  "slug": "preschooler",
  "name": "Preschooler",
  "dimension": "age_group",
  "tier": 1,
  "context": {
    "audience": "Parents of 3-5 year olds where picky eating hasn't resolved from toddler phase OR has worsened. Now there's social context: preschool lunch, birthday parties, other kids eating different foods. Parent pressure often increasing as 'they should have grown out of this by now'.",
    "pain_points": "Other kids at preschool eat everything. Teachers report the child won't eat lunch. Birthday parties are stressful. Grandparents blame the parent. Doctor still saying 'they'll grow out of it' but it's not improving. Starting to restrict the pantry to only safe foods to avoid mealtime battles.",
    "search_behavior": "Searches: 'preschooler still picky eater', '4 year old picky eater getting worse', 'preschool lunch ideas for picky eaters', 'how to handle picky eater at birthday party', 'picky eating at 4 is it normal'. More desperate search phrasing than toddler parents.",
    "content_that_works": "Acknowledgment that preschool age is when picky eating patterns solidify. Evidence-based distinction between normal and clinical. Social eating strategies (how to handle parties, playdates). Feeding therapy referral guide with what to look for.",
    "what_makes_it_useful": "Checklist of 'when to refer to a feeding therapist' with specific behaviors, not vague thresholds. Scripts for grandparents and teachers. Age-specific food introduction strategies that don't involve forcing.",
    "subtopics": [
      "preschool lunch ideas for picky eaters",
      "handling birthday parties with selective eater",
      "talking to preschool teachers about picky eating",
      "when picky eating at preschool age is concerning",
      "feeding therapy for preschoolers — what to expect",
      "managing grandparent pressure around picky eating"
    ]
  }
}
```

---

```json
{
  "slug": "early-elementary",
  "name": "Early Elementary",
  "dimension": "age_group",
  "tier": 1,
  "context": {
    "audience": "Parents of 6-8 year olds with persistent selective eating. At this age, picky eating is clearly not being 'grown out of' and is now affecting social life (school cafeteria, sleepovers, sports team dinners). Parent is actively seeking intervention. Child is beginning to self-identify as 'picky'.",
    "pain_points": "Child cannot attend sleepovers because of food anxiety. School cafeteria is a stress point daily. Child is embarrassed by their food restrictions. Parent has tried everything. Sports team pizza parties are major stress. Child starting to advocate for own food restrictions (which can narrow diet further).",
    "search_behavior": "Searches: '7 year old picky eater what to do', 'picky eater elementary school cafeteria', 'food anxiety 8 year old', 'picky eating still at age 7', 'ARFID in elementary school'. Searches are more clinical, indicating parent has been researching for a while.",
    "content_that_works": "Age-appropriate strategies that involve the child as an active participant. How to talk to children this age about food without creating shame. School-specific accommodations. ARFID screening information at this age.",
    "what_makes_it_useful": "Scripts for talking to your 7-year-old about trying new foods without creating shame or power struggles. Cafeteria survival kit (what to pack, how to prepare child). ARFID evaluation guide with what to ask the pediatrician.",
    "subtopics": [
      "school cafeteria strategies for picky eaters",
      "sleepovers with picky eaters",
      "talking to children about their picky eating",
      "ARFID evaluation for school-age children",
      "peer pressure around food in elementary school",
      "504 plan for extreme selective eating"
    ]
  }
}
```

---

```json
{
  "slug": "tween",
  "name": "Tween",
  "dimension": "age_group",
  "tier": 1,
  "context": {
    "audience": "Parents of 9-12 year olds with established selective eating patterns. At this age, the child has more autonomy, social eating is complex (restaurants, school trips, friends' houses), and the parent may be simultaneously more worried (why hasn't this changed?) and more resigned. Feeding therapy history may exist.",
    "pain_points": "Child controls their own food now and refuses any new introduction attempts. Social events are avoided due to food anxiety. Middle school transition is especially hard. Parent worried about nutrition into adolescence. Child defensive about food restrictions, views it as part of identity.",
    "search_behavior": "Searches: 'ARFID in tweens', 'picky eating at 11 not improving', 'teenager refuses to try new foods', 'picky eater social anxiety around food', 'OT for food sensitivities in older children'. Very clinical, researched parent.",
    "content_that_works": "ARFID awareness, clinical referral pathways, middle school-specific strategies, tween-appropriate autonomy in food exploration. Recognizing the difference between picky eating and disordered eating at this age.",
    "what_makes_it_useful": "Clear distinction between typical picky eating vs. ARFID at tween age. Guide to finding an ARFID-trained feeding therapist. Age-appropriate autonomy strategies (letting tween choose which new food to try, not when). School trip accommodation guide.",
    "subtopics": [
      "ARFID in tweens and teens",
      "school trips and overnight experiences with selective eaters",
      "helping tweens take ownership of food expansion",
      "middle school cafeteria with ARFID or extreme picky eating",
      "therapy options for tweens with food anxiety",
      "ARFID vs. eating disorder distinction for parents"
    ]
  }
}
```

---

### DIMENSION 3: FEEDING CHALLENGE — Context Objects

---

```json
{
  "slug": "texture-sensitivity",
  "name": "Texture Sensitivity / Sensory Food Aversion",
  "dimension": "feeding_challenge",
  "tier": 1,
  "context": {
    "audience": "Parents of children who gag, retch, or refuse foods based on texture rather than taste. Child may accept the flavor of something but reject it due to mouthfeel. Often co-occurs with broader sensory processing differences but can exist independently. Highly specific and predictable refusal pattern.",
    "pain_points": "Child gags when unfamiliar texture is introduced, even without eating. Parent worried the gagging is voluntary. Mealtimes are genuinely distressing for the child, not just oppositional. No amount of pressure works. Sensory OT has been mentioned but parent doesn't know where to start.",
    "search_behavior": "Searches: 'texture sensitivity food kids', 'child gags on certain textures', 'sensory food aversion toddler', 'how to help texture sensitive picky eater', 'food textures kids refuse', 'sensory processing picky eating'. High overlap with OT-related searches.",
    "content_that_works": "Explanation of oral sensory processing in child-friendly language. Texture classification system (crunchy, smooth, slippery, grainy, mixed). Food chaining specifically by texture match rather than flavor match. OT referral guide.",
    "what_makes_it_useful": "A texture-based food classification chart that parents can use to identify which texture category their child accepts and chain from there. The insight that food chaining for texture-sensitive kids should match texture FIRST, then gradually adjust.",
    "subtopics": [
      "texture sensitivity vs. pickiness — how to tell",
      "texture-based food classification system",
      "gag reflex in texture-sensitive children",
      "occupational therapy for sensory food aversion",
      "SOS approach to feeding basics",
      "foods sorted by texture for picky eaters"
    ]
  }
}
```

---

```json
{
  "slug": "limited-repertoire",
  "name": "Limited Food Repertoire (Fewer Than 20 Foods)",
  "dimension": "feeding_challenge",
  "tier": 1,
  "context": {
    "audience": "Parents of children who eat fewer than 20 distinct foods total. This is the clearest clinical threshold distinguishing clinically significant selective eating from normal picky eating. Parent has usually already catalogued the child's foods and is alarmed by the number.",
    "pain_points": "The list of accepted foods is memorized by the parent and keeps shrinking. Fear of a safe food being rejected ('food jag') and losing it permanently. Inability to travel, visit family, eat at restaurants. Nutritional supplements being used because diet is so narrow. Pediatrician finally concerned.",
    "search_behavior": "Searches: 'child only eats 10 foods', 'picky eater repertoire too small', 'how many foods is normal for picky eater', 'ARFID food list under 20 foods', 'expanding food repertoire picky eater'. High conversion intent — this parent needs a solution.",
    "content_that_works": "Clinical validation that fewer than 20 foods is a meaningful threshold. EatPal pantry feature as tool to track and visualize the food list. Specific food chaining strategy designed for very limited repertoires (work from what's there, don't introduce randomly).",
    "what_makes_it_useful": "A specific expansion strategy for children with fewer than 20 foods: never remove a safe food from the rotation even if you're trying to expand; add one try-bite per week from an adjacent food in the chain; track attempts with outcome data. The EatPal pantry is directly built for this use case.",
    "subtopics": [
      "what counts as a 'food' in a child's repertoire",
      "food jag — when a safe food is lost",
      "tracking accepted foods in a pantry list",
      "ARFID vs. limited repertoire distinction",
      "safe food protection while expanding",
      "20-food threshold — what it means clinically"
    ]
  }
}
```

---

```json
{
  "slug": "food-neophobia",
  "name": "Food Neophobia (Fear of New Foods)",
  "dimension": "feeding_challenge",
  "tier": 1,
  "context": {
    "audience": "Parents whose child shows clear fear or avoidance of anything unfamiliar or new. Unlike texture sensitivity (which is specific), neophobia is a generalized fear of novelty in food. Child may express real anxiety ('I'm scared to try it') rather than just preference-based refusal.",
    "pain_points": "Child expresses genuine fear around new foods, not just dislike. Parent feels helpless against fear-based refusal — force doesn't work and feels cruel. Child won't try even foods they've shown interest in. Family meals are severely limited by fear.",
    "search_behavior": "Searches: 'food neophobia child', 'my child is scared to try new foods', 'food phobia toddler', 'how to help a child with food neophobia', 'anxiety around new foods children'. Often parents who've done reading and know the term.",
    "content_that_works": "Fear vs. preference distinction. Repeated neutral exposure science (why seeing a food without pressure matters). Playful food exposure techniques. When food neophobia crosses into food anxiety requiring therapy.",
    "what_makes_it_useful": "The '15-exposure rule' explanation (research shows children need 15+ neutral exposures before willingness to taste). Low-pressure exposure strategies that don't involve pressure to eat. Food play activities appropriate by age.",
    "subtopics": [
      "food neophobia vs. picky eating — the difference",
      "15-exposure rule for food introduction",
      "food play as low-pressure exposure",
      "when food neophobia becomes food anxiety",
      "gradual desensitization for food-fearful children",
      "CBT-based approaches to food neophobia in children"
    ]
  }
}
```

---

```json
{
  "slug": "mealtime-battles",
  "name": "Mealtime Battles & Anxiety",
  "dimension": "feeding_challenge",
  "tier": 1,
  "context": {
    "audience": "Parents for whom mealtimes have become major family stressors — characterized by crying, tantrums, negotiations, power struggles, or complete meal avoidance. The food content may be secondary to the behavioral/anxiety component. Parent has usually tried reward charts, sticker systems, or threats.",
    "pain_points": "Every meal is a battle. Parent's evening is ruined by the anticipation of mealtime. Siblings' meals are disrupted. Spouse disagrees on approach. Nothing works — rewards, punishments, ignoring, bribing. Parent's own relationship with food may be affected.",
    "search_behavior": "Searches: 'toddler mealtime tantrums', 'picky eater mealtime stress how to stop', 'child refuses dinner every night', 'family mealtime battles', 'anxiety around mealtime in children'. Emotionally loaded searches — this parent is exhausted.",
    "content_that_works": "Validation-first. Division of Responsibility (Ellyn Satter) framework. Practical strategies for reducing mealtime stress independent of food expansion. Scripts for responding to refusals without escalating. Family mealtime culture shift.",
    "what_makes_it_useful": "A mealtime protocol that separates 'mealtime anxiety reduction' from 'food expansion' — parents learn that both must be addressed and one must come first. Specific steps to create a low-pressure mealtime environment before attempting any food introduction.",
    "subtopics": [
      "Division of Responsibility — what it is and how to start",
      "Ellyn Satter feeding model for parents",
      "stopping mealtime battles without giving in",
      "scripts for responding to food refusal without escalating",
      "family mealtime culture and stress reduction",
      "when mealtime anxiety indicates feeding therapy need"
    ]
  }
}
```

---

```json
{
  "slug": "arfid",
  "name": "ARFID (Avoidant/Restrictive Food Intake Disorder)",
  "dimension": "feeding_challenge",
  "tier": 1,
  "context": {
    "audience": "Parents who have heard ARFID mentioned by a doctor, therapist, or through their own research, and are seeking to understand whether their child meets the criteria — or parents already navigating an ARFID diagnosis. This is the most clinically serious search intent in EatPal's audience.",
    "pain_points": "Child is nutritionally compromised — using supplements, below growth curve, or medically monitored. Parent has been told ARFID is a diagnosis but doesn't know what it means for daily life. Finding an ARFID-trained clinician is difficult. Insurance doesn't cover treatment. School accommodations are unclear.",
    "search_behavior": "Searches: 'ARFID what is it', 'ARFID diagnosis child', 'ARFID vs picky eating', 'how to help child with ARFID', 'ARFID therapist near me', 'ARFID school accommodations', 'ARFID treatment options'. Very research-oriented, high intent.",
    "content_that_works": "Clinically accurate ARFID explanation that parents can verify. ARFID vs. normal picky eating distinction. How food chaining is used specifically in ARFID treatment. Finding qualified clinicians. EatPal as a tool to use alongside therapy, not instead of it.",
    "what_makes_it_useful": "ARFID is one of EatPal's clearest professional use cases. Pages on this topic should funnel to: (1) the Professional tier for feeding therapists and (2) the parent tool for tracking food progression alongside clinical care. Honest about what an app can and cannot do for ARFID.",
    "subtopics": [
      "ARFID diagnostic criteria explained for parents",
      "ARFID vs. picky eating — 5 key differences",
      "food chaining in ARFID treatment",
      "finding an ARFID-trained feeding therapist",
      "school accommodations for ARFID (504 plans)",
      "ARFID and anxiety — the connection",
      "ARFID nutrition supplements while expanding diet",
      "telehealth feeding therapy for ARFID"
    ]
  }
}
```

---

```json
{
  "slug": "sensory-processing",
  "name": "Sensory Processing Differences",
  "dimension": "feeding_challenge",
  "tier": 1,
  "context": {
    "audience": "Parents of children with broader sensory processing differences (SPD, autism spectrum, sensory processing disorder) for whom food selectivity is one component of a larger sensory profile. These children may also have tactile, auditory, or visual sensitivities that affect eating context.",
    "pain_points": "Food sensitivity is just one part of the picture. OT is already involved for other sensory issues. Parent needs food strategies that are consistent with the child's broader sensory profile. The sensory dining environment (noise, lighting, plate type) matters as much as the food.",
    "search_behavior": "Searches: 'sensory processing disorder picky eating', 'autism picky eating food chaining', 'SPD food textures', 'OT feeding therapy sensory', 'picky eating autism sensory integration'. Uses clinical terminology — parent is educated on sensory issues.",
    "content_that_works": "Integration of sensory environment (eating setting) with food content strategies. Overlap between OT and feeding therapy. Food chaining adapted for children with autism or SPD. Sensory-friendly mealtime setup.",
    "what_makes_it_useful": "Checklist of sensory mealtime factors beyond food content: plate type, table setup, lighting, noise level, seating. Explanation of how food chaining adapts for autistic children. Guide to finding a feeding therapist who works with sensory children.",
    "subtopics": [
      "SPD and picky eating — the connection",
      "autistic children and food selectivity",
      "sensory-friendly mealtime setup checklist",
      "OT and feeding therapy — how they work together",
      "food chaining for autistic children",
      "plate and utensil preferences in sensory children"
    ]
  }
}
```

---

### DIMENSION 4: MEAL OCCASION — Context Objects

---

```json
{
  "slug": "weeknight-dinner",
  "name": "Weeknight Dinner",
  "dimension": "meal_occasion",
  "tier": 1,
  "context": {
    "audience": "Parents trying to cook dinner for the whole family in 30-45 minutes after work/school while also accommodating a picky eater. The primary constraint is time and the secondary constraint is not wanting to cook two separate meals.",
    "pain_points": "Cooking two meals every night is exhausting. Child refuses family dinner. Rest of family eats normally but child only gets their safe food. Parent feels like a short-order cook. Every night is a negotiation about what the child will eat.",
    "search_behavior": "Searches: 'picky eater dinner ideas weeknight', 'easy dinner for whole family with picky eater', '30 minute meals picky eater', 'family dinner picky eater', 'dinner recipes picky eater won't refuse'. High frequency, daily-use search.",
    "content_that_works": "The 'base + component' dinner model where the family meal includes one safe component the picky eater will definitely eat. Try-bite protocol built into dinner setup. 5-night meal plan that integrates picky eater's safe foods into family meals.",
    "what_makes_it_useful": "A weeknight dinner framework where every meal includes: (1) one safe food the picky eater definitely eats, (2) one try-bite food served separately, (3) no special separate meal required. Specific 5-dinner plans built on common safe foods.",
    "subtopics": [
      "base-plus-component dinner model",
      "meal planning around picky eater's safe foods",
      "30-minute family dinners that work for picky eaters",
      "setting table for picky eater without making them feel different",
      "how to introduce try-bites at dinner without pressure"
    ]
  }
}
```

---

```json
{
  "slug": "school-lunch",
  "name": "School / Daycare Lunch",
  "dimension": "meal_occasion",
  "tier": 1,
  "context": {
    "audience": "Parents packing a school lunch that the picky eater will actually eat, without heating capability, subject to nut-free policies, and needing to survive 4+ hours in a lunchbox. School lunch is often the highest-stakes meal — child won't eat anything in the cafeteria, comes home starving.",
    "pain_points": "Child brings lunch home uneaten. Teacher or school is concerned. Nut-free policy eliminates PB&J. No microwave available. Child won't eat anything 'weird looking' that peers might comment on. Parent running out of ideas for what to pack.",
    "search_behavior": "Searches: 'picky eater school lunch ideas', 'school lunch ideas that aren't PB&J', 'nut-free school lunch picky eater', 'what to pack picky eater who won't eat', 'picky eater lunch ideas no heating'. High volume especially in August-September.",
    "content_that_works": "52-week school lunch rotation built entirely from common safe foods. Lunchbox setup guide (division and separation for mixed-food refusers). Try-bite strategy for packed lunches. Nut-free alternatives guide.",
    "what_makes_it_useful": "A downloadable 4-week school lunch rotation that uses common picky eater safe foods. Specific list of foods that pack well, stay cold, and look normal in a cafeteria. The 'no-surprise lunch' principle — child must know exactly what's in their lunchbox.",
    "subtopics": [
      "nut-free school lunch ideas for picky eaters",
      "lunchbox setup for mixed-food refusers",
      "4-week school lunch rotation for picky eaters",
      "thermos lunch ideas for picky eaters",
      "snacks that double as lunch components",
      "talking to child about trying something new at lunch"
    ]
  }
}
```

---

```json
{
  "slug": "breakfast",
  "name": "Breakfast",
  "dimension": "meal_occasion",
  "tier": 1,
  "context": {
    "audience": "Parents dealing with morning time pressure + picky eater who refuses all breakfast options. Morning is often when both parent and child are most stressed, making food refusal especially disruptive. Child may have a very small breakfast window.",
    "pain_points": "Child refuses everything before school. Mornings are chaotic — no time to negotiate. Child going to school hungry. Won't eat the same breakfast two days in a row. Cereal is the only option but it's dry with no milk. Waffles only acceptable if frozen brand.",
    "search_behavior": "Searches: 'picky eater breakfast ideas', 'breakfast for kids who don't like breakfast foods', 'quick breakfast ideas picky toddler', 'my kid refuses breakfast', 'healthy breakfast picky eater'. Seasonal spike in August.",
    "content_that_works": "5-minute breakfast options using common picky eater safe foods. 'Non-breakfast breakfast' (eating last night's safe food is fine). Smoothie as hidden nutrition vehicle. Breakfast-specific food chaining.",
    "what_makes_it_useful": "Permission slip for parents to serve non-traditional breakfast foods. Specific 10-option breakfast menu for picky eaters with 5-minute prep time. Smoothie recipe formula that hides nutrition in acceptable texture.",
    "subtopics": [
      "quick breakfast ideas for picky eaters",
      "non-breakfast foods for breakfast (permission slip)",
      "smoothie recipes for picky eaters",
      "breakfast food chaining",
      "morning routine with picky eater (timing tips)"
    ]
  }
}
```

---

```json
{
  "slug": "snack",
  "name": "Snacks & Between-Meals",
  "dimension": "meal_occasion",
  "tier": 1,
  "context": {
    "audience": "Parents navigating snack time — often the most accepted part of a picky eater's day since snack foods are typically dry, crunchy, and familiar (crackers, chips, fruit pouches). Snack time is also the best opportunity to introduce try-bites in a low-pressure context.",
    "pain_points": "Snacks are fine but always the same 3 items. Child fills up on snacks and refuses dinner. Snack time is the only positive eating experience but there's no variety. Parent can't use snacks to introduce new foods without the child refusing all of snack.",
    "search_behavior": "Searches: 'snack ideas for picky eaters', 'healthy snacks picky toddler', 'picky eater snack rotation', 'after school snacks picky eater', 'snacks picky eater will actually eat'. More casual search intent than meals.",
    "content_that_works": "The snack plate as try-bite delivery vehicle. 30-snack rotation built on common safe snack foods. Using snack time (lower stress than meals) as the best introduction context. Snack timing to avoid appetite suppression before dinner.",
    "what_makes_it_useful": "Snack time is strategically the best time to introduce try-bites — EatPal's one-try-bite-per-day feature fits perfectly here. Specific snack plate setup that includes one familiar safe food + one try-bite served separately. 30-snack rotation to print and post on the fridge.",
    "subtopics": [
      "snack plate setup for try-bite introduction",
      "30-snack rotation for picky eaters",
      "snack timing to preserve dinner appetite",
      "after-school snack ideas for picky eaters",
      "dry crunchy snacks for texture-sensitive kids",
      "using snack time to introduce new foods"
    ]
  }
}
```

---

## PHASE 1C: PAGE TYPE DEFINITIONS

Based on the taxonomy above, EatPal's pSEO system produces four primary page types.

---

### Page Type 1: FOOD CHAINING GUIDE
**URL pattern:** `/food-chaining/[safe-food]`  
**Example:** `/food-chaining/chicken-nuggets`  
**Title pattern:** `Food Chaining from [Food]: Step-by-Step Expansion Guide for Picky Eaters`  
**Volume:** 52 pages (one per safe food)  
**Priority:** Highest — "food chaining" is the golden keyword

**Required sections:**
1. Why [food] is a good starting point (validate the parent's situation)
2. What food chaining is (brief, parent-friendly, not clinical)
3. The 3-step progression table (Step 1 bridges, Step 2 targets, Step 3 long-range)
4. What these foods have in common (shared properties explanation)
5. How to introduce each bridge food (timeline + technique)
6. What to do if the bridge food is refused
7. Progress tracking (links to EatPal pantry feature)
8. When to see a feeding therapist

---

### Page Type 2: FOOD CHAINING + AGE COMBO
**URL pattern:** `/food-chaining/[safe-food]/[age-group]`  
**Example:** `/food-chaining/mac-and-cheese/preschooler`  
**Title pattern:** `Food Chaining from [Food] for [Age Group]s: Age-Specific Tips`  
**Volume:** 22 × 4 = 88 pages (Tier 1 foods × all age groups)  
**Priority:** High — specific enough to rank for long-tail

**Additional sections vs. Page Type 1:**
- Age-specific introduction technique differences
- Developmental context for this age + food combination
- Age-appropriate try-bite activities (food play for toddlers, choice for tweens)
- School/social eating implications for this age

---

### Page Type 3: CHALLENGE + MEAL OCCASION GUIDE
**URL pattern:** `/[challenge]/[meal-occasion]`  
**Example:** `/texture-sensitivity/school-lunch`  
**Title pattern:** `School Lunch Ideas for Texture-Sensitive Kids: [N] Options That Work`  
**Volume:** 10 × 7 = 70 pages  
**Priority:** High — high specificity, intent-rich

**Required sections:**
1. Why [meal occasion] is particularly challenging for [challenge type]
2. Rules/principles for planning [meal occasion] with this challenge
3. [25-30 specific food ideas] formatted as visual grid
4. What to avoid and why (with explanation not judgment)
5. Introduction technique adapted for [challenge] + [occasion]
6. Real parent scenario with solution

---

### Page Type 4: AGE + MEAL OCCASION GUIDE
**URL pattern:** `/[age-group]/[meal-occasion]-ideas`  
**Example:** `/toddler/weeknight-dinner-ideas`  
**Title pattern:** `[N] Weeknight Dinner Ideas for Toddler Picky Eaters (That Actually Work)`  
**Volume:** 4 × 7 = 28 pages  
**Priority:** Medium-High — high search volume, competitive but targetable

**Required sections:**
1. Why [meal occasion] is hard at [age] specifically
2. The one principle that changes everything (e.g., Division of Responsibility for toddlers)
3. [30-40 specific meal ideas] in visual grid format
4. Sample [5-day/week] plan using these ideas
5. Shopping list generator link (EatPal feature CTA)
6. How to track what works (EatPal progress tracking CTA)

---

## PHASE 1D: COMBINATION PRIORITY MATRIX

Generation order for the 1,500 pages:

| Priority | Page Type | Count | Why First |
|----------|-----------|-------|-----------|
| **1** | Food Chaining Guide (Type 1) | 52 | Golden keyword, zero competition, highest conversion |
| **2** | Challenge × Meal Occasion (Type 3) | 70 | High specificity, intent-rich, unique angle |
| **3** | Food Chain + Age Combo (Type 2) | 88 | Long-tail, differentiated from Type 1 |
| **4** | Age × Meal Occasion (Type 4) | 28 | High volume, competitive but needed for authority |
| **5** | Safe Food × Feeding Challenge | 520 | High volume, 3-way combo pages |
| **6** | Safe Food × Dietary Restriction | 110 | Underserved niche doubling |
| **7** | Challenge landing pages | 10 | Hub pages for each challenge type |
| **8** | Age group landing pages | 4 | Hub pages linking all age-specific content |
| **9** | Meal occasion landing pages | 7 | Hub pages for each occasion |
| **TOTAL** | | **889** | Phase 1 of generation |

Remaining ~600 pages come from three-way combinations of Tier 2 values.

---

## QUICK-START: Top 10 Pages to Build First

These 10 pages represent highest expected traffic + highest conversion to EatPal signup:

1. `/food-chaining/chicken-nuggets` — most-searched safe food
2. `/food-chaining/mac-and-cheese` — most-searched safe food #2
3. `/arfid/what-is-it` — high intent, ARFID awareness hub
4. `/texture-sensitivity/school-lunch` — high specificity, daily-use content
5. `/food-chaining/french-fries` — vegetable angle drives unique traffic
6. `/preschooler/weeknight-dinner-ideas` — high volume, high conversion age
7. `/limited-repertoire/getting-started` — clearest match to EatPal's value prop
8. `/food-chaining/pb-and-j` — school context drives August traffic spike
9. `/mealtime-battles/weeknight-dinner` — emotional search, high conversion
10. `/food-chaining/plain-pasta` — extremely common, ultra-specific intent

---

*End of Phase 1. Phase 2 will build the JSON schemas for each page type, 
Phase 3 the generation prompt library, and Phase 4 the React component spec.*
