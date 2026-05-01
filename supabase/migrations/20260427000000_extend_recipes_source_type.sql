-- Extend recipes.source_type CHECK to cover the values both the web and
-- iOS apps actually emit. The original migration `20251014000000` set it
-- to ('website', 'photo', 'manual', 'imported'); follow-up migrations
-- (_fixed/_final/_complete) tried to switch it to
-- ('manual', 'imported', 'ai_generated', 'url') but were no-ops because
-- of `ADD COLUMN IF NOT EXISTS`. Result: iOS URL paste sent 'url' and
-- hit `recipes_source_type_check` violations in production.
--
-- Consolidate to the union so every flow (web URL, web photo, manual,
-- AI-generated, iOS URL paste, iOS share extension) inserts cleanly.

ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_source_type_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_source_type_check
  CHECK (source_type IN ('website', 'photo', 'manual', 'imported', 'ai_generated', 'url'));
