-- Kid Meal Voting Feature
-- Allows children to vote on upcoming meals with emoji reactions
-- Parents see vote results to inform meal planning

-- Individual meal votes from kids
CREATE TABLE IF NOT EXISTS meal_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kid_id UUID REFERENCES kids(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,

  -- What they're voting on
  plan_entry_id UUID REFERENCES plan_entries(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  meal_date DATE NOT NULL,
  meal_slot TEXT NOT NULL,

  -- Vote value
  vote TEXT NOT NULL CHECK (vote IN ('love_it', 'okay', 'no_way')),
  vote_emoji TEXT, -- '😍', '🙂', '😭'

  -- Optional feedback
  reason TEXT,

  -- Voting session
  voting_session_id UUID,

  -- Timestamps
  voted_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Prevent duplicate votes (one vote per kid per meal)
  UNIQUE (kid_id, plan_entry_id),
  UNIQUE (kid_id, recipe_id, meal_date, meal_slot)
);

-- Voting sessions (when parents open voting)
CREATE TABLE IF NOT EXISTS voting_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Session details
  session_name TEXT NOT NULL,
  description TEXT,

  -- What meals are included
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  meal_slots TEXT[], -- ['breakfast', 'lunch', 'dinner']

  -- Status
  status TEXT DEFAULT 'open' CHECK (status IN ('draft', 'open', 'closed', 'archived')),

  -- Voting options
  allow_suggestions BOOLEAN DEFAULT false, -- Kids can suggest alternatives
  require_reason BOOLEAN DEFAULT false, -- Require reason for "no_way" votes

  -- Stats
  total_meals INTEGER DEFAULT 0,
  total_votes INTEGER DEFAULT 0,
  participation_rate DECIMAL(5,2), -- % of kids who voted

  -- Timestamps
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Vote summary by meal (materialized view for performance)
CREATE TABLE IF NOT EXISTS meal_vote_summary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_entry_id UUID REFERENCES plan_entries(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,

  meal_date DATE NOT NULL,
  meal_slot TEXT NOT NULL,

  -- Vote counts
  love_it_count INTEGER DEFAULT 0,
  okay_count INTEGER DEFAULT 0,
  no_way_count INTEGER DEFAULT 0,
  total_votes INTEGER DEFAULT 0,

  -- Calculated score (0-100)
  approval_score DECIMAL(5,2),

  -- Last updated
  last_vote_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (plan_entry_id),
  UNIQUE (recipe_id, household_id, meal_date, meal_slot)
);

-- Kid meal suggestions (when they vote "no_way" and suggest alternative)
CREATE TABLE IF NOT EXISTS kid_meal_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kid_id UUID REFERENCES kids(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,

  -- What they're suggesting for
  original_plan_entry_id UUID REFERENCES plan_entries(id) ON DELETE SET NULL,
  meal_date DATE NOT NULL,
  meal_slot TEXT NOT NULL,

  -- Their suggestion
  suggested_recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  suggested_food_name TEXT,
  suggestion_reason TEXT,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'alternative_chosen')),
  parent_response TEXT,

  -- If accepted, link to new plan entry
  accepted_plan_entry_id UUID REFERENCES plan_entries(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Voting rewards/achievements
CREATE TABLE IF NOT EXISTS voting_achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kid_id UUID REFERENCES kids(id) ON DELETE CASCADE,

  achievement_type TEXT NOT NULL CHECK (achievement_type IN (
    'first_vote',
    'voted_5_times',
    'voted_10_times',
    'voted_full_week',
    'suggestion_accepted',
    'helpful_voter', -- Consistent voting
    'adventurous_voter' -- Says "love_it" to new foods
  )),

  achievement_name TEXT NOT NULL,
  achievement_description TEXT,
  icon_name TEXT,
  points_earned INTEGER DEFAULT 0,

  unlocked_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_meal_votes_kid ON meal_votes(kid_id);
CREATE INDEX IF NOT EXISTS idx_meal_votes_household ON meal_votes(household_id);
CREATE INDEX IF NOT EXISTS idx_meal_votes_plan_entry ON meal_votes(plan_entry_id);
CREATE INDEX IF NOT EXISTS idx_meal_votes_recipe ON meal_votes(recipe_id);
CREATE INDEX IF NOT EXISTS idx_meal_votes_date ON meal_votes(meal_date);
CREATE INDEX IF NOT EXISTS idx_meal_votes_session ON meal_votes(voting_session_id);

CREATE INDEX IF NOT EXISTS idx_voting_sessions_household ON voting_sessions(household_id);
CREATE INDEX IF NOT EXISTS idx_voting_sessions_status ON voting_sessions(status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_voting_sessions_dates ON voting_sessions(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_meal_vote_summary_plan_entry ON meal_vote_summary(plan_entry_id);
CREATE INDEX IF NOT EXISTS idx_meal_vote_summary_recipe ON meal_vote_summary(recipe_id);
CREATE INDEX IF NOT EXISTS idx_meal_vote_summary_date ON meal_vote_summary(meal_date);

CREATE INDEX IF NOT EXISTS idx_kid_meal_suggestions_kid ON kid_meal_suggestions(kid_id);
CREATE INDEX IF NOT EXISTS idx_kid_meal_suggestions_status ON kid_meal_suggestions(status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_voting_achievements_kid ON voting_achievements(kid_id);

-- Row Level Security
ALTER TABLE meal_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE voting_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_vote_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE kid_meal_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE voting_achievements ENABLE ROW LEVEL SECURITY;

-- meal_votes policies
CREATE POLICY "Users can view household votes"
  ON meal_votes FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create votes for household kids"
  ON meal_votes FOR INSERT
  WITH CHECK (
    kid_id IN (
      SELECT k.id FROM kids k
      JOIN household_members hm ON hm.household_id = k.household_id
      WHERE hm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update votes for household kids"
  ON meal_votes FOR UPDATE
  USING (
    kid_id IN (
      SELECT k.id FROM kids k
      JOIN household_members hm ON hm.household_id = k.household_id
      WHERE hm.user_id = auth.uid()
    )
  );

-- voting_sessions policies
CREATE POLICY "Users can view household sessions"
  ON voting_sessions FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create sessions"
  ON voting_sessions FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update household sessions"
  ON voting_sessions FOR UPDATE
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- meal_vote_summary policies (read-only for users)
CREATE POLICY "Users can view household vote summaries"
  ON meal_vote_summary FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- kid_meal_suggestions policies
CREATE POLICY "Users can view household suggestions"
  ON kid_meal_suggestions FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create suggestions for household kids"
  ON kid_meal_suggestions FOR INSERT
  WITH CHECK (
    kid_id IN (
      SELECT k.id FROM kids k
      JOIN household_members hm ON hm.household_id = k.household_id
      WHERE hm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update household suggestions"
  ON kid_meal_suggestions FOR UPDATE
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- voting_achievements policies
CREATE POLICY "Users can view household achievements"
  ON voting_achievements FOR SELECT
  USING (
    kid_id IN (
      SELECT k.id FROM kids k
      JOIN household_members hm ON hm.household_id = k.household_id
      WHERE hm.user_id = auth.uid()
    )
  );

-- Admins have full access
CREATE POLICY "Admins can manage all voting data"
  ON meal_votes FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all sessions"
  ON voting_sessions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Triggers for updated_at
CREATE TRIGGER update_meal_votes_updated_at
  BEFORE UPDATE ON meal_votes
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_voting_sessions_updated_at
  BEFORE UPDATE ON voting_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_meal_vote_summary_updated_at
  BEFORE UPDATE ON meal_vote_summary
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_kid_meal_suggestions_updated_at
  BEFORE UPDATE ON kid_meal_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

-- Function to update vote summary when vote is cast
CREATE OR REPLACE FUNCTION update_meal_vote_summary()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert or update summary
  INSERT INTO meal_vote_summary (
    plan_entry_id,
    recipe_id,
    household_id,
    meal_date,
    meal_slot,
    love_it_count,
    okay_count,
    no_way_count,
    total_votes,
    approval_score,
    last_vote_at
  )
  SELECT
    COALESCE(NEW.plan_entry_id, OLD.plan_entry_id),
    COALESCE(NEW.recipe_id, OLD.recipe_id),
    COALESCE(NEW.household_id, OLD.household_id),
    COALESCE(NEW.meal_date, OLD.meal_date),
    COALESCE(NEW.meal_slot, OLD.meal_slot),
    COUNT(*) FILTER (WHERE vote = 'love_it'),
    COUNT(*) FILTER (WHERE vote = 'okay'),
    COUNT(*) FILTER (WHERE vote = 'no_way'),
    COUNT(*),
    -- Approval score: love_it=100, okay=50, no_way=0
    ROUND(
      (COUNT(*) FILTER (WHERE vote = 'love_it') * 100.0 +
       COUNT(*) FILTER (WHERE vote = 'okay') * 50.0) /
      NULLIF(COUNT(*), 0),
      2
    ),
    MAX(voted_at)
  FROM meal_votes
  WHERE (
    (NEW.plan_entry_id IS NOT NULL AND plan_entry_id = NEW.plan_entry_id)
    OR
    (NEW.recipe_id IS NOT NULL AND recipe_id = NEW.recipe_id AND meal_date = NEW.meal_date AND meal_slot = NEW.meal_slot)
  )
  GROUP BY plan_entry_id, recipe_id, household_id, meal_date, meal_slot
  ON CONFLICT (plan_entry_id)
  DO UPDATE SET
    love_it_count = EXCLUDED.love_it_count,
    okay_count = EXCLUDED.okay_count,
    no_way_count = EXCLUDED.no_way_count,
    total_votes = EXCLUDED.total_votes,
    approval_score = EXCLUDED.approval_score,
    last_vote_at = EXCLUDED.last_vote_at,
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update summary on vote insert/update/delete
CREATE TRIGGER update_vote_summary_on_vote
  AFTER INSERT OR UPDATE OR DELETE ON meal_votes
  FOR EACH ROW
  EXECUTE FUNCTION update_meal_vote_summary();

-- Function to check and award voting achievements
CREATE OR REPLACE FUNCTION check_voting_achievements(p_kid_id UUID)
RETURNS VOID AS $$
DECLARE
  vote_count INTEGER;
  full_week_count INTEGER;
  suggestion_count INTEGER;
BEGIN
  -- Count total votes
  SELECT COUNT(*) INTO vote_count
  FROM meal_votes
  WHERE kid_id = p_kid_id;

  -- First vote achievement
  IF vote_count = 1 THEN
    INSERT INTO voting_achievements (kid_id, achievement_type, achievement_name, achievement_description, icon_name, points_earned)
    VALUES (p_kid_id, 'first_vote', 'First Vote!', 'Cast your first meal vote', 'vote', 10)
    ON CONFLICT DO NOTHING;
  END IF;

  -- 5 votes achievement
  IF vote_count = 5 THEN
    INSERT INTO voting_achievements (kid_id, achievement_type, achievement_name, achievement_description, icon_name, points_earned)
    VALUES (p_kid_id, 'voted_5_times', 'Active Voter', 'Voted on 5 meals', 'star', 25)
    ON CONFLICT DO NOTHING;
  END IF;

  -- 10 votes achievement
  IF vote_count = 10 THEN
    INSERT INTO voting_achievements (kid_id, achievement_type, achievement_name, achievement_description, icon_name, points_earned)
    VALUES (p_kid_id, 'voted_10_times', 'Super Voter', 'Voted on 10 meals', 'trophy', 50)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Check for full week voting (7 consecutive days)
  SELECT COUNT(DISTINCT meal_date) INTO full_week_count
  FROM meal_votes
  WHERE kid_id = p_kid_id
    AND meal_date >= CURRENT_DATE - INTERVAL '7 days'
    AND meal_date <= CURRENT_DATE;

  IF full_week_count >= 7 THEN
    INSERT INTO voting_achievements (kid_id, achievement_type, achievement_name, achievement_description, icon_name, points_earned)
    VALUES (p_kid_id, 'voted_full_week', 'Week Warrior', 'Voted on meals for a full week', 'calendar', 100)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Check for accepted suggestions
  SELECT COUNT(*) INTO suggestion_count
  FROM kid_meal_suggestions
  WHERE kid_id = p_kid_id
    AND status = 'accepted';

  IF suggestion_count > 0 THEN
    INSERT INTO voting_achievements (kid_id, achievement_type, achievement_name, achievement_description, icon_name, points_earned)
    VALUES (p_kid_id, 'suggestion_accepted', 'Meal Planner', 'Your meal suggestion was accepted!', 'lightbulb', 75)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to check achievements after vote
CREATE OR REPLACE FUNCTION check_achievements_after_vote()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM check_voting_achievements(NEW.kid_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_achievements_on_vote
  AFTER INSERT ON meal_votes
  FOR EACH ROW
  EXECUTE FUNCTION check_achievements_after_vote();

COMMENT ON TABLE meal_votes IS 'Individual votes from kids on upcoming meals';
COMMENT ON TABLE voting_sessions IS 'Voting periods opened by parents for kids to vote on meals';
COMMENT ON TABLE meal_vote_summary IS 'Aggregated vote counts and approval scores per meal';
COMMENT ON TABLE kid_meal_suggestions IS 'Alternative meals suggested by kids when they vote no';
COMMENT ON TABLE voting_achievements IS 'Achievements earned by kids for participating in voting';
COMMENT ON FUNCTION update_meal_vote_summary IS 'Automatically updates vote summary when votes change';
COMMENT ON FUNCTION check_voting_achievements IS 'Checks and awards achievements based on voting activity';
