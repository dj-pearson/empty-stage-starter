# Child Questionnaire Implementation Plan
## Based on Research Document: Child_Meal_Planner_Questionnaire_Implementation_Plan.md

---

## Overview

This document outlines the step-by-step implementation plan for transforming our child intake questionnaire system based on comprehensive pediatric nutrition research. The new system replaces basic profile data with a **5-minute evidence-based questionnaire** that enables AI-powered personalized meal planning.

**Key Goals:**
- ✅ Evidence-based question design validated by pediatric nutrition research
- ✅ 5-minute completion time
- ✅ Comprehensive data capture for AI personalization
- ✅ Parent-facing dashboard with actionable insights
- ✅ Support for ages 1-18 years

---

## Implementation Phases

### **PHASE 1: Database Schema Updates** ✅ PARTIALLY COMPLETE

**Status:** Some fields already exist, need to add missing ones

**Current `kids` table has:**
- ✅ Basic info: name, age, date_of_birth, gender
- ✅ Allergens: allergens[], allergen_severity (jsonb), cross_contamination_sensitive
- ✅ Dietary restrictions: dietary_restrictions[]
- ✅ Health & nutrition: health_goals[], nutrition_concerns[]
- ✅ Eating behavior: eating_behavior, new_food_willingness
- ✅ Preferences: texture_preferences[], texture_dislikes[], flavor_preferences[]
- ✅ Foods: favorite_foods[], always_eats_foods[], disliked_foods[]
- ✅ Profile tracking: profile_completed, profile_last_reviewed

**Need to add:**
- ⬜ height_cm (numeric) - for growth tracking
- ⬜ weight_kg (numeric) - for growth tracking  
- ⬜ helpful_strategies (text[]) - strategies that work for this child
- ⬜ behavioral_notes (text) - free-form notes about eating behaviors
- ⬜ pickiness_level (text) - calculated: 'adventurous', 'somewhat_picky', 'very_picky', 'extreme'
- ⬜ texture_sensitivity_level (text) - calculated: 'none', 'mild', 'strong', 'severe'
- ⬜ dietary_variety_score (integer) - calculated DVS metric
- ⬜ preferred_preparations (text[]) - how foods should be served

**Action Items:**
1. Create migration to add missing columns
2. Add indexes for performance
3. Update RLS policies if needed

---

### **PHASE 2: Questionnaire Component Rebuild**

**Status:** ⬜ NOT STARTED - Current `ChildIntakeQuestionnaire.tsx` needs major updates

**New Structure - 6 Sections:**

#### Section 1: Child Basic Information (30 seconds)
- Q1: Age (already captured in basic profile)
- Q2: Health conditions/growth concerns
  - Checkboxes: Underweight, Overweight, Iron deficiency, Constipation, Other
  - Maps to: `health_goals[]`, `nutrition_concerns[]`

#### Section 2: Food Allergies & Dietary Restrictions (45 seconds)
- Q3: Food allergies with severity
  - Multi-select with severity radio buttons
  - Maps to: `allergens[]`, `allergen_severity{}`, `cross_contamination_sensitive`
- Q4: Cultural/religious/personal restrictions
  - Maps to: `dietary_restrictions[]`

#### Section 3: Eating Behavior & Pickiness Assessment (90 seconds)
- Q5: Eating behavior description
  - Radio: Wide variety (30+ foods) → Extremely limited (<10 foods)
  - Maps to: `eating_behavior`, `pickiness_level`
- Q6: Eating habit statements (multi-select)
  - "Eats same foods daily", "Refuses new foods", "Gets upset with new foods"
  - Maps to: `behavioral_notes`
- Q7: Willingness to try new foods
  - Radio: Willing → Refuses entirely
  - Maps to: `new_food_willingness`

#### Section 4: Texture & Sensory Preferences (60 seconds)
- Q8: Texture sensitivity level
  - Radio: None → Severe aversions
  - Maps to: `texture_sensitivity_level`
- Q9: CONDITIONAL - Avoided textures (if Q8 = strong/severe)
  - Multi-select: Soft/mushy, Slimy, Crunchy, Chewy, Lumpy, Wet, Touching
  - Maps to: `texture_dislikes[]`
- Q10: Preferred preparations
  - Multi-select: Separate foods, Cold only, Hot only, With dips, Specific shapes
  - Maps to: `preferred_preparations[]`

#### Section 5: Food Preferences by Category (90 seconds)
- Q11-16: Visual grid selectors for each food group
  - Fruits, Vegetables, Proteins, Grains, Snacks, Beverages
  - Maps to: `favorite_foods[]`, `always_eats_foods[]`
  - Special notes for textures/preferences

#### Section 6: Foods to Avoid & Dislikes (45 seconds - Optional)
- Q17: Strongly disliked foods
  - Free text with autocomplete
  - Optional: Why disliked (taste, texture, smell, experience)
  - Maps to: `disliked_foods[]`

**Action Items:**
1. Redesign `ChildIntakeQuestionnaire.tsx` with 6 sections
2. Add conditional logic (Q9 shows based on Q8)
3. Create visual food grid component
4. Add progress indicator
5. Create summary review screen
6. Calculate scores (PSS, TSS, DVS) on save

---

### **PHASE 3: Child Profile Card Enhancement**

**Status:** ✅ PARTIALLY COMPLETE - Need to add new visualizations

**Current `ChildProfileCard.tsx` shows:**
- ✅ Basic info, allergens, dietary restrictions, health goals
- ✅ Eating behavior, texture/flavor preferences
- ✅ Meal progress

**Need to add (based on research):**
1. **Food Group Coverage Bar Chart**
   - Show fruits/vegetables/proteins/grains distribution
   - Color-coded: Green >60%, Yellow 30-60%, Red <30%

2. **Nutrition Targets Gauge**
   - Progress bars for calories, protein, calcium, iron, fiber
   - Based on age-appropriate targets
   - Emoji indicators (😊 ✓, 😐 ⚠️, 😟 ❌)

3. **Pickiness Score Badge**
   - Visual indicator: Adventurous / Somewhat Picky / Very Picky / Extreme
   - Color-coded badge

4. **Texture Preference Map** (if applicable)
   - Visual grid of ✓ Prefers / ✗ Avoids textures

**Action Items:**
1. Create `FoodGroupCoverageChart.tsx` component
2. Create `NutritionTargetsGauge.tsx` component
3. Add pickiness level badge to profile card
4. Add texture preference visualization
5. Update `ChildProfileCard.tsx` layout

---

### **PHASE 4: Food Bridging & AI Suggestions**

**Status:** ⬜ NOT STARTED - Need new edge function

**Requirements:**
- AI suggests "bridge foods" based on liked foods
- Similarity algorithm considers:
  - Texture (35% weight)
  - Flavor (30% weight)
  - Appearance (15% weight)
  - Nutrition (10% weight)
  - Child popularity (10% weight)

**Implementation:**
1. Create new edge function: `suggest-bridge-foods`
   - Input: child_id, liked_foods[], nutritional_gaps[]
   - Output: ranked list of bridge food suggestions
   - Uses OpenAI with structured prompts

2. Update existing `suggest-foods` edge function
   - Integrate texture/flavor similarity logic
   - Factor in pickiness level and texture sensitivity
   - Avoid allergens and disliked foods

3. Create UI component: `FoodBridgingSuggestions.tsx`
   - Shows "Since [Child] likes X, try Y next"
   - Displays similarity reason (texture, flavor, etc.)
   - "Schedule Try" button

**Action Items:**
1. Create `suggest-bridge-foods` edge function
2. Update `suggest-foods` edge function with new logic
3. Create `FoodBridgingSuggestions.tsx` component
4. Add to dashboard/Kids page

---

### **PHASE 5: Food Trial Tracking System**

**Status:** ⬜ NOT STARTED - New feature

**Requirements:**
- Track exposure attempts for new foods
- Record outcomes: Accepted / Tasted / Refused
- Parent notes
- Attempt counter (research shows 8-15 tries needed)

**Database:**
- Table `food_attempts` already exists with:
  - kid_id, food_id, attempted_at, outcome, bites_taken, notes
  - Need to add: `attempt_number` (integer)

**UI Components:**
1. `FoodTrialLog.tsx` - Timeline view of recent trials
   - Color-coded outcomes
   - Attempt counter
   - AI suggestions for next attempt

2. `RecordFoodTrial.tsx` - Quick entry dialog
   - Food selector
   - Outcome buttons
   - Optional notes

**Action Items:**
1. Add `attempt_number` to `food_attempts` table
2. Create `FoodTrialLog.tsx` component
3. Create `RecordFoodTrial.tsx` dialog
4. Add to Kids page and Dashboard

---

### **PHASE 6: Nutritional Analysis Dashboard**

**Status:** ⬜ NOT STARTED - New feature

**Requirements:**
- Calculate nutritional targets based on age
- Analyze current diet coverage from liked foods
- Identify nutritional gaps (critical/moderate/adequate)
- Provide actionable recommendations

**Calculation Logic:**
```
Age-based targets (from research):
- 1-3 years: 1000-1400 calories, 13g protein, 700mg calcium, 7mg iron, 19g fiber
- 4-8 years: 1200-2000 calories, 19g protein, 1000mg calcium, 10mg iron, 25g fiber
- 9-13 years: 1400-2600 calories, 34g protein, 1300mg calcium, 8mg iron, 31g fiber
- 14-18 years: 1800-3200 calories, 52g protein, 1300mg calcium, 11-15mg iron, 38g fiber
```

**Components:**
1. `NutritionalAnalysis.tsx` - Main dashboard section
   - Displays targets vs current coverage
   - Shows critical gaps
   - AI recommendations

**Action Items:**
1. Create nutritional targets calculation function
2. Create coverage analysis from liked foods
3. Create `NutritionalAnalysis.tsx` component
4. Add to Kids page

---

### **PHASE 7: Allergen Safety Dashboard**

**Status:** ✅ PARTIALLY COMPLETE - Enhance display

**Current:** Shows allergens with severity in profile card

**Enhancements needed:**
1. Visual allergen safety badge/banner
2. Clear "NEVER includes" list with icons
3. Cross-contamination warnings
4. Easy access to update allergens

**Action Items:**
1. Create `AllergenSafetyDashboard.tsx` component
2. Add prominent safety badges
3. Add to Kids page and meal planning views

---

### **PHASE 8: Periodic Profile Update System**

**Status:** ⬜ NOT STARTED - New feature

**Requirements:**
- Prompt every 3 months OR on birthday OR after 10+ new foods
- Quick "What's changed?" mini-questionnaire
- Update profile without full re-entry

**Implementation:**
1. Add `next_review_date` to kids table
2. Create reminder system (check on page load)
3. Create `ProfileUpdatePrompt.tsx` dialog
4. Create quick update questionnaire

**Action Items:**
1. Add `next_review_date` column to kids table
2. Create reminder check logic
3. Create `ProfileUpdatePrompt.tsx` component
4. Create quick update flow

---

## Priority Order for Implementation

### Sprint 1 (Week 1-2): Foundation
1. ✅ Database schema completion (Phase 1)
2. ✅ Questionnaire component rebuild (Phase 2)
3. ✅ Basic profile card enhancements (Phase 3)

### Sprint 2 (Week 3-4): Visualizations
4. ⬜ Food Group Coverage Chart
5. ⬜ Nutrition Targets Gauge
6. ⬜ Enhanced profile card layout

### Sprint 3 (Week 5-6): AI Integration
7. ⬜ Food bridging logic (Phase 4)
8. ⬜ Updated suggest-foods edge function
9. ⬜ Food bridging suggestions UI

### Sprint 4 (Week 7-8): Tracking & Analysis
10. ⬜ Food trial tracking system (Phase 5)
11. ⬜ Nutritional analysis dashboard (Phase 6)
12. ⬜ Allergen safety enhancements (Phase 7)

### Sprint 5 (Week 9-10): Polish & Automation
13. ⬜ Periodic profile updates (Phase 8)
14. ⬜ Testing & refinement
15. ⬜ Documentation & user guides

---

## Technical Considerations

### Data Validation
- All questionnaire responses validated client-side and server-side
- Allergen data marked as CRITICAL - cannot be overridden by AI
- Texture preferences optional but recommended

### AI Prompt Engineering
- Food suggestions must NEVER include allergens
- Respect texture sensitivity in suggestions
- Factor in pickiness level for pacing recommendations
- Include explanations for why foods are suggested

### Performance
- Index kid_id, user_id, household_id for fast queries
- Cache nutritional calculations
- Lazy load dashboard visualizations
- Optimize food grid images

### Mobile Optimization
- Touch-friendly multi-select grids
- Progress save between sections
- Minimal scrolling per question
- Fast completion time (<5 min target)

---

## Success Metrics

1. **Questionnaire Completion Rate:** Target >80% of users complete
2. **Completion Time:** Target <5 minutes average
3. **Profile Update Frequency:** Users update every 3-6 months
4. **Food Acceptance Rate:** Increase in new foods tried per week
5. **Nutritional Gap Reduction:** Improvement in coverage over time

---

## Research References

- Children's Eating Behavior Questionnaire (CEBQ) for pickiness scoring
- Child Food Texture Preference Questionnaire (CFTPQ) for texture assessment
- MyPlate guidelines for food group targets
- AAP/AND nutritional recommendations by age
- Food chaining/bridging research from pediatric feeding therapy

---

## Next Steps

**Immediate Actions:**
1. Review this implementation plan
2. Prioritize phases based on business value
3. Start with Phase 1 (database) and Phase 2 (questionnaire)
4. Create detailed task breakdown for Sprint 1

**Questions to Address:**
- Which phases are MVP vs nice-to-have?
- Do we have nutritional data for food bridging calculations?
- Should we integrate with existing food/nutrition databases?
- What's the priority: questionnaire quality or dashboard visualizations?
