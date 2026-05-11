-- Seed blog post drafts: Week 5 of the EatPal SEO content calendar.
--
-- Both posts are NEW (no existing slug to preserve). Inserted with
-- status='draft' so they do NOT auto-publish. Edit, attach featured images,
-- and publish from the blog admin UI when ready.
--
-- Idempotent: ON CONFLICT (slug) DO NOTHING means re-running is safe.

-- ============================================================================
-- Insert blog post drafts
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Week 5 / Post 1 — Sensory-Friendly Meal Planning
-- ----------------------------------------------------------------------------
INSERT INTO public.blog_posts (
  title, slug, excerpt, content, status,
  meta_title, meta_description, reading_time_minutes,
  category_id, ai_generated
) VALUES (
  'Sensory-Friendly Meal Planning: For Kids with ARFID, Autism, and Extreme Picky Eating',
  'sensory-friendly-meal-planning-arfid-autism',
  $ep_excerpt$Sensory-driven food rejection isn't picky — it's neurological. Here's the 5-dimension model, the "sensory budget" concept that explains why Tuesday's win fails Thursday, and three sample plans for the most common sensory profiles.$ep_excerpt$,
  $ep_md$When a kid rejects a food, most adults reach for the same explanation: "they're being picky." For neurodivergent kids and kids with ARFID, that's almost always wrong. The rejection isn't preference — it's the nervous system doing exactly what it's built to do: registering a sensory input that exceeds its tolerance and triggering a protective response.

Sensory-driven eating isn't fixable through bribery, encouragement, or "just one bite." It's manageable through a meal plan that respects the kid's actual sensory profile — and slowly expands it within the limits of what the system can handle.

This post walks through the five sensory dimensions of food, how to build your kid's sensory profile, the "sensory budget" concept that explains why some meals fail and others succeed, and three sample plans for the most common sensory profiles.

> If your child is autistic, has SPD, or is being evaluated for ARFID, this post is a starting framework — not a substitute for an occupational therapist or feeding therapist trained in sensory work. The plans below work best alongside professional sensory support.

## The 5 sensory dimensions of food

Every bite of food hits the nervous system on five dimensions simultaneously. Most kids tolerate variation across most of them. Sensory-sensitive kids tolerate variation on some and not others.

**1. Taste.** Sweet, salty, sour, bitter, umami. Concentration matters too — strong flavors register differently from mild.

**2. Texture.** Crunchy, soft, chewy, mushy, lumpy, smooth, mixed-texture. *Mixed* is the killer for many kids — the food that's mostly soft but has a crunchy bit (yogurt with granola, ice cream with chunks).

**3. Smell.** Hot food smells more than cold food. Cooked meat smells more than cheese. The smell hits before the kid even sees the food, so a strong-smelling dinner can shut down the meal before the plate arrives.

**4. Temperature.** Hot, warm, room-temp, cool, cold. Some kids are temperature-rigid: every food must be in one of two temperature bands or it's rejected.

**5. Visual.** Color, plating, contact between foods, "what it looks like." Foods that touch on the plate are different foods to many sensory-sensitive kids — even if separated they'd both be acceptable.

A meal that fails one dimension fails the whole meal. You can do everything else right and still lose to a smell.

## Build your kid's sensory profile

Spend a week noticing — not changing — what your kid does and doesn't accept across each dimension. Don't try to fix anything yet. Just observe.

For each dimension, write three lists:

- **Tolerated** — what the kid will eat consistently
- **Triggers** — what causes immediate rejection or distress
- **Edge cases** — accepted in some contexts, rejected in others

Example sensory profile for one autistic 7-year-old:

| Dimension | Tolerated | Triggers | Edge cases |
| --- | --- | --- | --- |
| Taste | Mild, slightly sweet, salty | Bitter, sour, spicy | Tomato (sweet at home, sour at restaurants) |
| Texture | Crunchy, smooth | Mixed-texture, lumpy, slimy | Yogurt (smooth = yes, with chunks = no) |
| Smell | Cheese, bread, peanut butter | Cooked fish, cooked broccoli, eggs cooking | Pasta (plain = yes, with sauce being cooked = no) |
| Temperature | Cold, room temp | Steaming hot, lukewarm | Pizza (hot = no, cold = yes) |
| Visual | Foods separated, beige/yellow palette | Mixed plates, green or red foods | Apples (peeled = yes, with skin = no) |

This profile is the actual planning input. Not "safe foods" — *the rules that determine whether any food is safe today.*

## The "sensory budget" concept

Sensory kids have a finite amount of sensory tolerance per meal. Once it's spent, additional input — even input that's normally fine — gets rejected.

Things that *spend* the sensory budget:

- A new food on the plate
- A loud or busy environment (cafeterias, restaurants)
- A transition right before the meal (coming in from school, changing activities)
- An emotional event earlier in the day
- Being slightly overtired or overhungry

Things that *replenish* the sensory budget:

- A predictable, repeated environment
- A familiar plate, cup, utensils
- Adequate rest and regulation pre-meal
- Foods firmly in the "tolerated" column

If the budget is depleted, even a normally-accepted food can get rejected. The kid isn't being inconsistent — the budget just ran out.

This is why a meal that worked Tuesday can fail Thursday with the exact same food. Don't troubleshoot the food. Troubleshoot the budget.

## Three sample sensory profiles + plans

### Profile A: The texture-avoider

**Triggers:** mixed textures, lumpy textures, anything "wet on top of dry"
**Tolerated:** uniform crunchy or uniform smooth

Sample anchor list: plain crackers, plain pasta, smooth peanut butter, applesauce pouches, smooth yogurt, plain rice, plain chicken (cut into uniform shapes).

Plan rule: every food on the plate is either fully crunchy or fully smooth. Never both. Sauces are served separately, never on top.

### Profile B: The smell-sensitive kid

**Triggers:** strong-smelling cooking (fish, broccoli, eggs cooking), restaurant smells, hot foods generally
**Tolerated:** cold or room-temperature foods, mild-smelling cooking

Sample anchor list: cold cuts (deli turkey, ham), cheese, bread, fruit, granola bars, cold pasta, room-temp pizza.

Plan rule: cooking happens *before* the kid is in the kitchen. Strong-smelling foods are cooked when the kid is in another room. Hot meals are served lukewarm — or the kid eats their portion cold.

### Profile C: The temperature-rigid kid

**Triggers:** lukewarm food, food that's "wrong temperature"
**Tolerated:** crisply cold or piping hot — nothing in between

Sample anchor list: refrigerated items eaten cold, freshly made hot items eaten immediately. Reheated leftovers are usually rejected.

Plan rule: portion food directly from cold/hot to plate. Don't let it sit. For school lunches, use a pre-warmed thermos for hot food and double ice packs for cold.

## Exposure rules for sensory kids

Standard exposure protocols (chaining, "many exposures" rules, repeated low-pressure presentation) work for sensory kids — but slower. Here's what changes:

**1. Stretches go on a separate plate, never on the main plate.**
A stretch food touching a safe food contaminates the safe food. Use a side dish, not the main plate.

**2. New foods are introduced when the sensory budget is *full*, not when it's depleted.**
Saturday morning at home is a great stretch slot. Wednesday after school is not.

**3. Smell is part of the exposure — even before taste.**
Letting your kid smell a food across the room without seeing it is a valid first exposure. Cooking the food in the next room over while they're playing is an exposure. They don't have to see it for the nervous system to register it.

**4. Visual exposure counts.**
A picture of a food, a plastic version of it, a friend eating it on the playground — all of these are exposures. Sometimes the visual exposures are the only thing happening for weeks before the kid will accept a real one.

**5. Chains are longer, with smaller increments.**
What's a 4–6 link chain for a typical picky eater is often an 8–10 link chain for a sensory-sensitive kid. See [Food Chaining for Picky Eaters](/blog/food-chaining-for-picky-eaters-step-by-step-examples) for the chain framework — just plan to subdivide each link.

## How EatPal handles sensory profiles

EatPal's planner lets you tag every food in your kid's safe-food list across all five sensory dimensions. When you generate a plan, the AI weights *the dimensions you mark as triggers* most heavily — so a texture-avoider's plan won't propose mixed-texture meals, and a smell-sensitive kid's plan won't combine strong-smelling cooked foods.

You can also share the sensory profile with an OT or feeding therapist as a read-only link. They often have additional dimension-specific guidance once they see the actual profile, rather than guessing from a parent's verbal description.

If you haven't built your sensory profile yet, the [picky eater quiz](/picky-eater-quiz) walks through each dimension in feeding-therapy order and produces a starter profile.

## FAQ

**My kid is autistic but eats a wide variety of foods. Do I still need this?**
Maybe not. Sensory-driven restriction is common in autism but not universal. If your kid eats 15+ foods comfortably and meals aren't a battle, you don't need a sensory plan — you need a regular meal plan with awareness of which foods are sensory-tolerated.

**Sensory food rejection or ARFID — what's the difference?**
ARFID is a clinical diagnosis with criteria around weight, nutrition, and impairment. Sensory rejection is a *mechanism* that often shows up in ARFID, but also in autism, SPD, and typically-developing picky eaters. The framework above applies to all of them; a feeding-therapy evaluation tells you whether the clinical label applies.

**My kid only eats beige foods. Should I worry?**
Probably less than you think. The "beige diet" is common, often nutritionally adequate, and usually expands over time with low-pressure exposure. Run the math on actual intake before panicking about color.

**Can I do sensory meal planning without an OT?**
Yes — but having one helps a lot. OTs trained in feeding can spot dimensions you'd miss (vestibular, proprioceptive, oral-motor) and design a desensitization plan that goes faster than DIY exposure.

**My kid's sensory profile changed dramatically. Why?**
Common after illness, transitions (new school, moves), big emotional events, growth spurts, or developmental shifts. The profile isn't fixed — re-audit every few months.

## Build a sensory plan tonight

[Generate a free 7-day sensory-aware plan](/meal-plan) — answer five questions about your kid's sensory profile and the planner will output a week of meals that respects your kid's actual triggers, not generic family-meal advice. No card required.
$ep_md$,
  'draft',
  'Sensory-Friendly Meal Planning for ARFID, Autism & Picky Eating | EatPal',
  'A 5-dimension sensory model for meal planning, the "sensory budget" concept, and three sample plans for texture-avoiders, smell-sensitive kids, and temperature-rigid kids.',
  8,
  (SELECT id FROM public.blog_categories WHERE slug = 'arfid-feeding-challenges'),
  false
)
ON CONFLICT (slug) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Week 5 / Post 2 — Safe Food Lists into a Real Meal Plan
-- ----------------------------------------------------------------------------
INSERT INTO public.blog_posts (
  title, slug, excerpt, content, status,
  meta_title, meta_description, reading_time_minutes,
  category_id, ai_generated
) VALUES (
  'Safe Food Lists: How to Turn Your Child''s 10 Safe Foods into a Real Meal Plan',
  'safe-food-list-to-meal-plan',
  $ep_excerpt$Most parents have their kid's safe-food list memorized. Writing it down — and categorizing it — converts a worry-loop into a planning input. Here's the 30-day audit, the three buckets, and the math for turning 10 safe foods into 21 meals a week.$ep_excerpt$,
  $ep_md$Most parents of picky eaters could rattle off their kid's safe foods from memory: chicken nuggets, plain pasta, apples, cheese sticks, Cheerios. It lives in your head, and it's been the subject of a thousand mental rehearsals. But the moment you write it down — really write it, on paper, with categories — something useful happens. The list stops being a worry-loop and becomes a planning input.

This post is about that conversion. How to build the real list (it's longer than you think). How to categorize it (not all "safe" is equal). How to turn 10 foods into 21 meals a week without anyone losing their mind. And when to schedule the careful, low-stakes "challenge slots" that slowly expand the list over time.

> If your child is in feeding therapy, ask their therapist if they want to see your safe-food list before you start using it for planning. Some therapists have format preferences that integrate cleanly with their session notes.

## What actually counts as a "safe food"

A safe food is one your kid eats reliably, without distress, in the contexts that matter to your week. That's stricter than it sounds.

A food that's eaten "sometimes" is not a safe food. A food that's eaten only at grandma's house is not a safe food (in the home context). A food that's tolerated when nothing else is available is not a safe food.

Use these three filters:

1. **Reliably eaten** — accepted at least 4 of the last 5 times offered
2. **Without distress** — no negotiation, no pressure, no gagging
3. **In the relevant context** — at home, at school, at restaurants, on travel, depending on what you're planning for

Most parents over-count the list because they're including "tolerated" foods. Strip those out. The list is shorter, but it's *real*.

## The 30-day audit method

Build the actual list this way:

**For 30 days, write down what your kid actually ate at each meal.** Not what was served — what was eaten. A small notebook on the kitchen counter, a notes app, whatever you'll actually use.

At day 30, sort the entries:

- **Every-week foods (10–25 items typical):** appeared at least 3 times in 30 days. These are your real safe foods.
- **Occasional foods (5–15 items):** appeared 1–2 times. These are *probably* safe but unverified — flag for testing.
- **One-time foods:** appeared once. Treat as unknown until repeated.
- **Refused-when-served:** track separately. These are your *known triggers*, also planning input.

The 30-day audit usually surprises parents in two directions: the list is longer than they thought (kids forget about foods, parents forget when memories of meltdowns dominate), AND the list is more brand-specific than they thought ("yogurt" in their head turns out to be one specific brand and flavor in the audit).

## Categorize the list

Once you have a real list, sort it into three buckets:

### Bucket 1: Anchors

Foods your kid eats anytime, anywhere, without context dependence. These are the load-bearing foods. Most kids have 5–10 anchors.

For a typical school-aged kid: plain pasta, chicken nuggets (specific brand), white toast with butter, apple slices (peeled), cheese sticks, Cheerios with milk, and a few snack foods (goldfish, pretzels).

These appear in every meal of every day if the plan permits.

### Bucket 2: Occasional safes

Foods eaten reliably *in the right context*. Pizza on Friday but not Tuesday. Hot dogs at the ballpark but not at home. Yogurt drink in the morning but not after school.

These are real planning input — you just have to slot them correctly. Don't treat them as anchors (they'll fail when context-shifted), and don't treat them as bridges (they're not new foods).

Most kids have 5–15 of these.

### Bucket 3: Context-dependent extras

Foods eaten only with grandma, only at restaurants, only on travel. These are *not* part of your home plan — they're your travel/social plan.

Don't try to bring these into your weekly home rotation. The context is doing work the kid can't replicate at home; pulling the food out of context usually fails.

## Turn 10 anchors into 21 meals a week

The math: 7 days × 3 meals = 21 meals. If your kid has 10 anchors plus 5 occasional safes, that's *more than enough* to cover the week without repetition fatigue.

The trick is recognizing that meals are *combinations* of anchors, not individual anchors. With 10 anchors, you can build:

- **Breakfast templates (5):** anchor A (carb) + anchor B (protein/dairy) + anchor C (fruit). Cheerios + milk + apple, toast + butter + banana, pancakes + yogurt + berries, etc.
- **Lunch templates (5):** anchor combos that travel. Cheese stick + crackers + grapes, deli turkey + tortilla + apple, etc.
- **Dinner templates (5):** anchor + anchor + side. Pasta + plain chicken + apple, nuggets + pasta + carrots, pizza + cheese stick + grapes.

Three templates per meal slot, on a rotation, gives you 21 meals from one solid list.

## A worked example: 10 safe foods → real weekly plan

Here's what 10 safe foods turn into.

**Anchor list (10 foods):** plain pasta, chicken nuggets, white toast with butter, peeled apple slices, Cheerios with milk, cheese sticks, plain rice, deli turkey, plain bagel, scrambled eggs.

**Occasional safes (5):** boxed mac and cheese, yogurt pouches, frozen pancakes, plain pizza, peanut butter on bread.

### Sample 7-day plan

| Day | Breakfast | Lunch | Dinner |
| --- | --- | --- | --- |
| Mon | Cheerios + milk, apple | Turkey wrap (turkey + bagel half), apple | Pasta + nuggets + apple |
| Tue | Toast + butter, banana | Cheese stick + crackers + grapes | Mac and cheese + nuggets + apple |
| Wed | Scrambled eggs + toast | PB&J on bread, apple | Plain rice + nuggets + apple |
| Thu | Frozen pancakes + apple | Yogurt pouch + crackers + grapes | Pasta + cheese stick + apple |
| Fri | Cheerios + milk, banana | Turkey wrap, apple | Plain pizza + cheese stick + grapes |
| Sat | Toast + butter, apple | Mac and cheese, apple | Nuggets + pasta + apple |
| Sun | Scrambled eggs + bagel | Cheese stick + crackers + grapes | Plain chicken + rice + apple |

Yes, it's repetitive. That's the point. Every meal hits 3 of the 10 anchors. The kid never sees the same dinner two nights in a row but never sees a meal outside the safe list either. The plan covers the week and the grocery list is short.

## When to schedule challenge slots

A "challenge slot" is a deliberate, low-stakes exposure to a non-safe food. Don't run more than 2 per week. Schedule them when:

- The kid is regulated and rested (Saturday morning, not Wednesday after school)
- The meal is otherwise low-stakes (snack, not dinner)
- You can stay calm regardless of the response

The food gets *served*, not negotiated. See [ARFID Meal Plans](/blog/arfid-meal-plans-build-week-safe-stress-free-meals) for the stretch-food framework, and [Food Chaining for Picky Eaters](/blog/food-chaining-for-picky-eaters-step-by-step-examples) for the chain logic.

## Maintaining the list as it evolves

Re-audit every 3–4 months. The list moves in both directions:

- **Foods get added:** when a stretch becomes a chain link becomes a bridge becomes an anchor. Often gradual — the kid eats the food 3 times before you notice it could be promoted.
- **Foods drop off:** kids fall out of foods, especially around growth spurts, illness, or stress periods. Don't fight a dropped anchor — drop it for two weeks, retry once, accept its retirement if it doesn't return.

Net change for most kids: 1–3 foods added per quarter, 0–2 dropped. Slow, real growth.

## How EatPal handles your safe-food list

EatPal's pantry/foods system lets you mark each food as anchor, occasional, context-dependent, or bridge — and the planner uses those tags directly. When you generate a weekly plan, the AI builds 21 meals from your tagged anchors plus a small percentage of bridges and stretches based on your settings. You can also share the safe-food list with a feeding therapist as a read-only link.

If you don't have your list built yet, the [picky eater quiz](/picky-eater-quiz) is a 3-minute starter that produces a candidate list you can refine over your 30-day audit.

## FAQ

**My kid only has 5 safe foods. Is that enough for a real plan?**
Yes, but tighter. Five anchors gives you ~15 meal combinations across the week, which is enough if you accept some repetition. Building chains to expand the list (see Food Chaining post) is the path forward.

**Should I include "junk food" anchors?**
Yes. The list is what the kid eats, not what you wish they ate. Goldfish, fruit snacks, chicken nuggets — they're anchors if they're eaten reliably. Nutritionally optimizing the list is a separate problem; build the list honestly first.

**My kid's safe-food list shrinks every few months. Help.**
Common, especially during growth spurts and big transitions. Audit pre-meal regulation (sleep, screen time, environment) before troubleshooting the food. Most "shrinking lists" recover within 4–6 weeks once regulation returns. If yours doesn't, talk to a feeding therapist.

**Should the list be "balanced" across food groups?**
Eventually, yes. Right now? Not necessarily. A list heavy on dairy and carbs is nutritionally adequate for most kids in the short term — confirm with a dietitian rather than assuming a deficit.

**What about kids who eat completely different food at school vs. home?**
Build *two* lists. School and home are different sensory environments and need their own anchors. See [Lunchbox Wins: ARFID-Friendly School Lunch Ideas](/blog/lunchbox-wins-10-easy-meals-kids-actually-eat) for the school-side framework.

## Turn your list into a plan

[Generate a free 7-day plan from your safe-food list](/meal-plan) — answer five questions about your kid's anchors and the planner will produce 21 meals from those foods, with a single grocery list. No card required.
$ep_md$,
  'draft',
  'Safe Food Lists: 10 Foods Into 21 Meals a Week | EatPal',
  'How to build your child''s real safe-food list with a 30-day audit, categorize it into anchors / occasional / context-dependent, and turn 10 foods into a full weekly plan.',
  7,
  (SELECT id FROM public.blog_categories WHERE slug = 'arfid-feeding-challenges'),
  false
)
ON CONFLICT (slug) DO NOTHING;
