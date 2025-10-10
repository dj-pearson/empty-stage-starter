# Child Food Preference & Nutrition Assessment System
## Product Requirements Document (PRD)

**Version:** 1.0  
**Date:** October 10, 2025  
**Purpose:** Comprehensive implementation guide for a one-time child food preference questionnaire, data analysis system, and parent-facing dashboard

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Questionnaire Design](#questionnaire-design)
3. [Data Analysis & Scoring System](#data-analysis--scoring-system)
4. [Parent Dashboard & Visualizations](#parent-dashboard--visualizations)
5. [Food Recommendation Engine](#food-recommendation-engine)
6. [Technical Implementation](#technical-implementation)
7. [Implementation Roadmap](#implementation-roadmap)

---

## 1. Executive Summary

### 1.1 Problem Statement
Parents need a quick, effective way to communicate their child's food preferences, allergies, sensory sensitivities, and nutritional concerns to enable personalized meal planning. Current meal planning systems lack the nuanced understanding of individual child eating patterns necessary for successful food introduction.

### 1.2 Solution Overview
A comprehensive assessment system consisting of:
- **5-10 minute parent questionnaire** capturing food preferences, allergies, sensory patterns, and parental concerns
- **Intelligent analysis engine** that categorizes eating profiles and identifies patterns
- **Parent-facing dashboard** with visual insights, food recommendations, and progress tracking
- **AI-powered meal planner** that respects safe foods while strategically introducing new items

### 1.3 Key Success Metrics
- Questionnaire completion rate: >85%
- Average completion time: <10 minutes
- Parent satisfaction with recommendations: >80%
- Meal plan acceptance rate: >70%
- Food variety expansion: Measurable increase over 4 weeks

---

## 2. Questionnaire Design

### 2.1 Design Principles

Based on validated pediatric nutrition assessment tools (Children's Eating Behavior Questionnaire, Picky Eating Questionnaire, Food Texture Preference Questionnaire), our questionnaire follows these principles:

1. **Brevity**: ≤50 items, completable in 5-10 minutes
2. **Evidence-based**: Questions derived from validated scales
3. **Progressive disclosure**: Complex questions only when relevant
4. **Parent-friendly language**: Clear, non-judgmental terminology
5. **Mobile-optimized**: Touch-friendly, save-and-resume capability

### 2.2 Questionnaire Structure

#### **SECTION 1: Basic Information (2 minutes)**

**Purpose:** Establish foundational context for personalization

**Questions:**

1. **Child's Information**
   - Name
   - Age (in months for <36mo, years for ≥3y)
   - Gender (optional)
   
2. **Household Context**
   - Number of children in household
   - Primary meal preparer
   - Typical meal structure (family meals, separate prep, etc.)

**UI Component:** Simple form with large input fields, progress indicator showing "Step 1 of 6"

---

#### **SECTION 2: Medical & Allergy Information (2 minutes)**

**Purpose:** Critical safety information for meal planning

**Questions:**

3. **Diagnosed Food Allergies** (Multi-select with severity)
   - Common allergens: Peanuts, Tree nuts, Milk, Eggs, Soy, Wheat, Fish, Shellfish
   - Severity rating: Mild reaction / Moderate / Severe (anaphylaxis risk)
   - Additional allergens (free text)

4. **Food Intolerances/Sensitivities**
   - Lactose intolerance
   - Gluten sensitivity (non-celiac)
   - FODMAP sensitivity
   - Other (free text)

5. **Medical Conditions Affecting Diet**
   - Celiac disease
   - Diabetes
   - Eosinophilic esophagitis
   - Reflux/GERD
   - Constipation (chronic)
   - None
   - Other (free text)

6. **Medication/Supplement Use**
   - Currently taking vitamins/supplements? (Yes/No)
   - If yes: List types (Multivitamin, Iron, Vitamin D, etc.)

**UI Component:** Searchable multi-select with clear allergen icons, severity toggles, collapsible "Additional info" sections

---

#### **SECTION 3: Current Eating Patterns (2-3 minutes)**

**Purpose:** Understand baseline diet and variety

**Questions:**

7. **Current Safe Foods** (Modified Food Frequency Questionnaire approach)
   
   Present foods by category with simple Yes/Sometimes/No buttons:
   
   - **Proteins:** Chicken, beef, pork, fish, eggs, beans, tofu, peanut butter, cheese
   - **Carbs:** White bread, wheat bread, pasta, rice, potatoes, cereal, crackers, tortillas
   - **Fruits:** Apples, bananas, berries, grapes, oranges, melon, dried fruit
   - **Vegetables:** Carrots, broccoli, peas, corn, tomatoes, cucumber, lettuce, sweet potato
   - **Dairy:** Milk, yogurt, cheese, ice cream
   - **Snacks:** Chips, cookies, pretzels, popcorn, granola bars

8. **Meal Patterns**
   - How many meals per day? (3 meals + snacks / Grazing / Varies)
   - Eats with family? (Always / Sometimes / Rarely)
   - Eating location? (Table / TV / Varies)

9. **Current Diet Variety** (Auto-calculated from Q7, but ask perception)
   - How would you describe your child's diet?
     * Very limited (fewer than 15 foods)
     * Somewhat limited (15-30 foods)
     * Moderate variety (30-50 foods)
     * Good variety (50+ foods)

**UI Component:** Visual grid with food images and toggle buttons, running tally of selected items

---

#### **SECTION 4: Sensory & Texture Preferences (2-3 minutes)**

**Purpose:** Identify sensory patterns that predict food acceptance (based on Child Food Texture Preference Questionnaire and Short Sensory Profile)

**Questions:**

10. **Texture Preferences** (Paired comparison format)
    
    Show 8 key food pairs and ask: "Which would your child more likely eat?"
    
    - Smooth yogurt vs. Yogurt with fruit pieces
    - Soft banana vs. Crunchy apple
    - Creamy soup vs. Soup with vegetables
    - Soft bread vs. Toasted bread
    - Mashed potatoes vs. French fries
    - Smooth peanut butter vs. Crunchy peanut butter
    - Chicken nuggets vs. Grilled chicken breast
    - Ice cream vs. Frozen fruit pop
    
    Options: Food A / Food B / Either / Neither

11. **Sensory Sensitivities** (5-point Likert scale: Never / Rarely / Sometimes / Often / Always)
    
    "How often does your child..."
    
    - Refuse foods based on smell
    - Refuse foods based on how they look
    - Avoid foods that are mixed together
    - Gag or have strong reactions to certain textures
    - Refuse to try new foods
    - Complain that foods are "too hot" or "too cold" when others find them fine
    - Get upset if foods touch on the plate
    - Prefer foods to be served the same way every time

12. **Food Neophobia** (Shortened scale from Food Neophobia Scale)
    
    5-point scale (Strongly Disagree to Strongly Agree):
    
    - "My child is willing to try new foods"
    - "My child distrusts new foods"
    - "My child is afraid to try unfamiliar foods"
    - "My child enjoys trying foods from different cultures"

**UI Component:** Visual paired comparisons with food photos, clear Likert scale sliders with emoji indicators

---

#### **SECTION 5: Parental Concerns & Goals (1-2 minutes)**

**Purpose:** Understand parent priorities to guide recommendations

**Questions:**

13. **Primary Concerns** (Multi-select, max 3)
    - Limited food variety
    - Inadequate vegetable intake
    - Inadequate fruit intake
    - Inadequate protein intake
    - Weight concerns (underweight)
    - Weight concerns (overweight)
    - Nutritional deficiency risk
    - Mealtime battles/stress
    - Social eating difficulties
    - None

14. **Priority Goals** (Rank top 3)
    - Increase vegetable acceptance
    - Increase fruit acceptance
    - Improve protein variety
    - Expand texture acceptance
    - Reduce mealtime stress
    - Support healthy weight
    - Improve social eating
    - Build independence

15. **Current Challenges** (Free text, optional)
    "What's the biggest challenge at mealtimes?"

**UI Component:** Tag-based selection with drag-to-rank interface

---

#### **SECTION 6: Eating Behavior Assessment (1 minute)**

**Purpose:** Screen for clinical feeding concerns (based on Pediatric Eating Assessment Tool)

**Questions:**

16. **Behavioral Red Flags** (Yes/No)
    - Meals typically last longer than 30 minutes
    - Child has lost weight or not gained as expected
    - Child eats fewer than 20 different foods
    - Child has had choking incidents (not including typical toddler gagging)
    - Mealtimes are consistently stressful for the family
    - Child has refused entire food groups for >2 years

17. **If YES to any above:**
    - Display message: "We noticed some feeding concerns. While our meal planner can help, you may benefit from consulting with a pediatric feeding specialist or registered dietitian. Would you like resources?"
    - Proceed with questionnaire but flag profile for limited recommendations

**UI Component:** Clear yes/no toggles, gentle informational message with resource links

---

### 2.3 Questionnaire Flow & UX

#### **Visual Design**
- **Progress Bar:** Clear 6-step progress indicator
- **Section Icons:** Food, medical cross, texture icons, goal target, etc.
- **Color Coding:** Green for completed sections, blue for current, gray for pending
- **Save & Resume:** Auto-save after each section with unique link
- **Estimated Time:** Show "2 minutes" for each section

#### **Accessibility**
- WCAG 2.1 AA compliant
- Screen reader friendly
- Keyboard navigation
- High contrast mode option
- Font size adjustment

#### **Mobile Optimization**
- Touch-friendly (min 44x44px tap targets)
- Single column layout
- Minimal scrolling per question
- Native form elements where possible

---

## 3. Data Analysis & Scoring System

### 3.1 Eating Profile Classification

Based on questionnaire responses, classify each child into one or more profiles:

#### **Primary Eating Profiles**

**A. The Selective Eater (Low Variety)**
- **Criteria:** 
  - Eats <30 foods (Q9)
  - High food neophobia score (Q12 average >3.5)
  - Reports limited variety concern (Q13)
- **Characteristics:** Sticks to familiar safe foods, resistant to new items
- **Strategy:** Food chaining with tiny variations, heavy use of safe food bridges

**B. The Texture-Sensitive Child**
- **Criteria:**
  - Prefers soft/smooth textures (Q10: 6+ selections toward soft)
  - High texture-related sensory scores (Q11: gag/texture items >3)
- **Characteristics:** Rejects based on mouthfeel, prefers consistent textures
- **Strategy:** Gradual texture progression, smooth-to-chunky continuum

**C. The Visual/Olfactory Avoider**
- **Criteria:**
  - High scores on smell/appearance refusal (Q11)
  - Avoids mixed foods (Q11)
- **Characteristics:** Food appearance matters greatly, dislikes "messy" foods
- **Strategy:** Deconstructed meals, aesthetically pleasing presentations, separate foods

**D. The Sensory Seeker (Less Common)**
- **Criteria:**
  - Prefers crunchy/hard textures (Q10)
  - Lower neophobia scores
  - May prefer strong flavors
- **Characteristics:** Seeks sensory input from food
- **Strategy:** Crunchy vegetables, textured proteins, bold seasonings

**E. The Routine-Dependent Eater**
- **Criteria:**
  - Requires foods served same way (Q11 high)
  - Foods can't touch (Q11)
  - Limited meal patterns (Q8)
- **Characteristics:** Rigidity around food presentation and timing
- **Strategy:** Structured meal times, consistent presentations, gradual routine expansion

**F. The Typically Developing Eater**
- **Criteria:**
  - >50 foods accepted
  - Low neophobia
  - Few sensory concerns
- **Characteristics:** Generally willing to try new things
- **Strategy:** Exposure-based variety building, cultural food exploration

#### **Severity Scoring**

For each profile, assign severity level:

- **Mild:** Some characteristics present, minimal impact on nutrition/social eating
- **Moderate:** Clear pattern present, some nutritional/social impact
- **Severe:** Extreme pattern, significant nutritional/social impact, clinical referral may be warranted

### 3.2 Nutritional Adequacy Assessment

#### **Risk Scoring System**

Calculate nutritional risk score (0-100) based on:

1. **Food Group Coverage (40 points)**
   - Protein sources: 10 pts (0-2 sources: 0pts, 3-4: 5pts, 5+: 10pts)
   - Grains/carbs: 8 pts
   - Fruits: 8 pts
   - Vegetables: 10 pts (weighted higher)
   - Dairy/alternatives: 4 pts

2. **Variety Within Groups (20 points)**
   - Color variety in fruits/veg: 10 pts
   - Protein type variety: 5 pts
   - Grain variety: 5 pts

3. **Texture Variety (15 points)**
   - Smooth only: 0 pts
   - Smooth + one other: 8 pts
   - Multiple textures accepted: 15 pts

4. **Sensory Flexibility (15 points)**
   - Based on sensory sensitivity scores from Q11
   - High rigidity: 0 pts
   - Moderate: 8 pts
   - Flexible: 15 pts

5. **Meal Pattern Structure (10 points)**
   - Regular meals with family: 10 pts
   - Irregular or grazing: 5 pts

**Risk Categories:**
- **Low Risk (70-100 pts):** Adequate variety and nutrition
- **Moderate Risk (40-69 pts):** Some gaps, monitoring recommended
- **High Risk (<40 pts):** Significant nutritional concern, consider professional referral

#### **Specific Nutrient Risk Flags**

Flag potential deficiencies based on food avoidance:

- **Iron Risk:** Few/no red meats, beans, fortified cereals
- **Calcium Risk:** No dairy and no alternatives (fortified plant milk, leafy greens)
- **Vitamin D Risk:** No fortified milk/alternatives + limited fish/eggs
- **Fiber Risk:** Minimal fruits, vegetables, whole grains
- **Protein Risk:** <2 protein sources regularly consumed
- **Omega-3 Risk:** No fish, nuts, or enriched foods

### 3.3 Allergen Cross-Contamination Risk Assessment

Based on declared allergies (Q3):

#### **Risk Matrix**

For each allergen, assess exposure risk in meal planning:

**High Risk Allergens (Require Strict Avoidance):**
- Peanuts (cross-contamination in facilities)
- Tree nuts (multiple types, facility concerns)
- Shellfish (trace amounts can cause reactions)

**Moderate Risk (Careful Sourcing Required):**
- Eggs (hidden in baked goods)
- Milk (hidden in prepared foods)
- Soy (hidden in processed foods)

**Lower Risk (Usually Clear in Labeling):**
- Wheat/Gluten
- Fish

#### **Cross-Contamination Warnings**

When generating meal plans:
- **Severe Allergies:** Exclude all foods with "may contain" warnings for that allergen
- **Moderate Allergies:** Warn about cross-contamination risk
- **Facility Warnings:** Alert parents to check labels for "processed in facility with..."

#### **Safe Food Alternatives Database**

Maintain allergen-free alternatives:
- Dairy → Oat milk, coconut yogurt, etc.
- Eggs → Flax eggs in baking, Just Egg
- Wheat → Rice, quinoa, gluten-free options
- Nuts → Sunflower seed butter, WowButter

---

## 4. Parent Dashboard & Visualizations

### 4.1 Dashboard Overview Page

**Layout:** Single-scroll page with card-based sections

#### **Section 1: Child Profile Summary Card**

**Visual Elements:**
- Child name and age
- Profile type badge (e.g., "Selective Eater - Moderate")
- Quick stats bar:
  - Current safe foods: X foods
  - Food groups covered: X/5
  - Nutritional adequacy: XX/100 (with color-coded gauge)

**Content:**
```
🍎 [Child Name]'s Eating Profile

Profile Type: Texture-Sensitive Eater (Moderate)
Safe Foods: 23 foods | Food Groups: 4/5 covered
Nutritional Risk Score: 52/100 (Moderate - Monitor)

[View Detailed Profile] button
```

---

#### **Section 2: Understanding Your Child's Eating Pattern**

**Visual:** Illustrated infographic with child-friendly graphics

**Content:**
```
What We Learned About [Child Name]:

✨ Eating Style
[Child Name] is a texture-sensitive eater who prefers smooth, 
predictable foods. This is common and can be successfully 
expanded with patience.

🎯 Key Patterns
• Prefers soft, smooth textures
• Shows hesitation with mixed textures
• More comfortable with familiar presentations
• Lower comfort with new foods

💪 Strengths to Build On
• Eats 3/5 food groups regularly
• Accepts variety within carbohydrates
• Willing to eat with family

🎨 Recommendations Tailored For:
• Gradual texture progression
• Consistent food presentation
• Using safe foods as bridges to new ones
```

**UI Components:**
- Expandable sections for each pattern
- Tooltip definitions for terms like "food neophobia"
- Encouraging, non-judgmental tone throughout

---

#### **Section 3: Nutritional Snapshot**

**Visual:** Clean, modern charts and graphs

#### **A. Food Group Coverage (Donut Chart)**

```
    Proteins  ████████ 80%
       Grains  ██████████ 100%
       Fruits  ████ 40%
   Vegetables  ██ 20%
        Dairy  ████████ 80%

Overall Balance: 64% - Keep improving!
```

**Interaction:** Click each segment to see:
- Which foods from this group child currently eats
- Recommended additions from this group
- Fun facts about this food group

#### **B. Variety Rainbow (Horizontal Bar Chart)**

Shows color variety in fruits/vegetables:

```
🟥 Red      ████ (Tomatoes, strawberries)
🟧 Orange   ██ (Carrots)
🟨 Yellow   ── (None yet - opportunity!)
🟩 Green    ██ (Peas, cucumber)
🟦 Blue     ── (None yet)
🟪 Purple   ── (None yet)
⚪ White    ████ (Potatoes, cauliflower)

Eating the rainbow score: 4/7 colors
```

**Message:** "Great start! Let's explore yellow and purple foods together."

#### **C. Texture Acceptance Spectrum (Visual Scale)**

```
Smooth ←―――●――――――――→ Crunchy
        ↑
     Current
     comfort
     zone

[Child Name] is most comfortable here. We'll gradually 
introduce slightly more textured foods.
```

#### **D. Nutrient Risk Flags (Icon-Based Alerts)**

```
⚠️ Nutrient Watch List:
• Iron - Limited red meat and beans
  💡 Try: Fortified cereal, chicken, lentil soup
  
• Fiber - Few vegetables and fruits
  💡 Try: Smoothies, sweet potato fries

✅ Doing Well:
• Calcium - Good dairy intake
• Protein - Variety of sources
```

**UI:** Green checks and yellow warning triangles, not alarming red

---

#### **Section 4: "If They Like This, Try That" Recommendations**

**Visual:** Interactive card carousel or grid

**Purpose:** Provide evidence-based food bridging suggestions based on current safe foods

**Logic:** Food chaining algorithm that finds:
1. Minimal sensory distance (similar texture, flavor, appearance)
2. Slightly increased nutrition or variety
3. Age-appropriate and culturally relevant

**Example Cards:**

```
┌─────────────────────────────────────┐
│  They Like        →    Try Next     │
│  ─────────────────────────────────  │
│  🥔 Mashed        →  🥔 Roasted     │
│   Potatoes             Potatoes     │
│                                      │
│  Why: Similar flavor, slight        │
│  texture upgrade                    │
│  Strategy: Serve alongside mashed   │
│  to compare                          │
│                                      │
│  [Add to Meal Plan]                 │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  They Like        →    Try Next     │
│  ─────────────────────────────────  │
│  🧀 String        →  🧀 Mild        │
│   Cheese              Cheddar       │
│                      Cubes           │
│                                      │
│  Why: Same food, different form     │
│  Strategy: Let them see both are    │
│  cheese                              │
│                                      │
│  [Add to Meal Plan]                 │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  They Like        →    Try Next     │
│  ─────────────────────────────────  │
│  🍞 White         →  🍞 White       │
│   Bread               Pita          │
│                                      │
│  Why: Same base, fun new shape      │
│  Strategy: Make "pita pizzas"       │
│  together                            │
│                                      │
│  [Add to Meal Plan]                 │
└─────────────────────────────────────┘
```

**Categories of Recommendations:**
1. **Same Food, New Form** (lowest risk)
2. **Same Category, Similar Taste**
3. **Same Texture, New Flavor**
4. **Cultural Bridges** (familiar to child's background)
5. **Family Favorites Modified**

**Display:** 6-8 recommendations initially, with "Show More" option

---

#### **Section 5: Progress Tracking (Post-Implementation)**

**Visual:** Line and bar charts showing change over time

**Metrics to Track:**
1. **Food Acceptance Rate**
   - Weekly "try bite" attempts
   - Foods moved from "refused" to "tasted" to "accepted"
   
2. **Safe Foods Growth**
   - Line chart showing increase in safe food count
   - Goal: +1-2 foods per week

3. **Nutritional Score Trend**
   - Nutritional adequacy score over time
   - Aim for steady upward trend

4. **Meal Outcome Logging**
   - Visual calendar showing ate/tasted/refused for each meal
   - Patterns analysis

**Example Chart:**

```
Safe Foods Over Time

30 │                               ●
   │                           ●
25 │                       ●
   │                   ●
20 │               ●
   │           ●
15 │       ●
   │   ●
10 │●
   └────────────────────────────────
     Week 1    4    8   12   16
     
Started with 15 foods → Now eating 28 foods!
That's 13 new foods in 16 weeks. Amazing! 🎉
```

---

#### **Section 6: Action Items & Next Steps**

**Visual:** Checklist-style cards with clear CTAs

```
📋 Your Action Plan

□ Build This Week's Meal Plan
  Use our AI planner to create 7 days of meals
  [Start Planning] →

□ Try This Week's "Try Bite" Foods
  We've selected 7 low-risk new foods
  [View Recommendations] →

□ Log Meal Outcomes
  Track what [Child Name] tries each day
  [Quick Log] →

□ Review Progress (Available Week 2+)
  See how you're doing!
  [View Progress] →
```

---

### 4.2 Detailed Profile View (Expandable Page)

**Access:** Click "View Detailed Profile" from dashboard

**Contents:**

#### **Complete Eating Profile Report**

```
═══════════════════════════════════════════════
[Child Name]'s Comprehensive Eating Profile
Generated: [Date]
═══════════════════════════════════════════════

PROFILE CLASSIFICATION
─────────────────────────────────────────────

Primary Profile: Texture-Sensitive Eater
Severity: Moderate
Secondary Patterns: Routine-dependent eating

DETAILED ASSESSMENT
─────────────────────────────────────────────

Food Variety:
• Total Safe Foods: 23
• Proteins: 4 types (chicken, cheese, eggs, yogurt)
• Grains: 6 types (white bread, pasta, rice, cereal, crackers, tortillas)
• Fruits: 3 types (bananas, applesauce, grapes)
• Vegetables: 2 types (carrots, corn)
• Dairy: 3 types (milk, cheese, yogurt)

Sensory Profile:
• Texture Preference: Strongly prefers soft/smooth
• Visual Sensitivity: Moderate
• Olfactory Sensitivity: Low
• Food Neophobia Score: 3.8/5 (Moderate)

Nutritional Risk Assessment:
• Overall Risk Score: 52/100 (Moderate)
• Nutrient Concerns:
  - Fiber intake: Limited (only 2 vegetables)
  - Iron: Adequate from fortified cereal and chicken
  - Vitamin C: Limited (fruit variety low)
  - Vitamin A: Limited (few orange/yellow foods)

Allergen Information:
• Tree nuts (Severe - anaphylaxis risk)
• Eggs (Moderate - hives)

RECOMMENDATIONS
─────────────────────────────────────────────

Immediate Goals (Weeks 1-4):
1. Increase vegetable exposure to 4-5 types
   Focus: Sweet potato (soft, orange, similar to carrots)
2. Expand fruit variety to 5-6 types
   Focus: Peaches, pears (soft like bananas)
3. Introduce mixed textures gradually
   Start: Yogurt with soft fruit pieces

Medium-Term Goals (Weeks 5-12):
1. Progress texture tolerance
2. Build confidence with new foods
3. Reduce mealtime rigidity

Strategies Tailored for [Child Name]:
• Use food chaining from safe foods
• Maintain consistent presentations initially
• Avoid forcing; use repeated exposures (8-15x)
• Celebrate tasting, not just eating
• Involve in food prep when possible

Resources:
• Evidence-Based Article: "Expanding Diet in Texture-Sensitive Children"
• Professional Referral: Consider occupational therapy for sensory concerns
• Support Group: [Link to picky eater parent community]
```

**Format:** PDF-exportable, printable, shareable with healthcare providers

---

### 4.3 Interactive Elements & Features

#### **Food Recommendation Interactive Tools**

**A. Food Explorer**
- Browse food database filtered by child's profile
- See "match score" for each food (how likely to accept)
- Filter by: Food group, texture, preparation method, allergen-free
- Click food → See: Nutrition info, try-bite strategies, similar foods

**B. Texture Ladder Visualization**

Interactive slider showing progression path:

```
Smooth → Slightly Lumpy → Chunky → Mixed → Crunchy

Current: Smooth
Next Step: Slightly Lumpy (e.g., mashed banana with tiny pieces)
Goal (12 weeks): Mixed textures
```

**C. Meal Plan Preview**

Before generating full week:
- Show 3 sample daily menus
- Highlight "try bite" foods with green badges
- Allow parent to adjust preferences
- One-click regenerate

#### **Progress Celebration Features**

**A. Achievements/Badges**
- "First New Food!" 
- "5 Foods Explored"
- "Vegetable Victory"
- "Rainbow Complete" (ate all colors)
- "Weekly Champion" (logged 7 days)

**B. Milestone Animations**
- Confetti when child accepts new food
- Progress bar fills with encouraging messages
- Weekly summary email: "You tried 5 new foods this week!"

**C. Social Sharing (Optional)**
- "Share success with other parents"
- Anonymous community feed of wins
- Tips exchange forum

---

### 4.4 Mobile App Dashboard Specifications

**Design System:**
- **Color Palette:**
  - Primary: Warm, friendly orange (#FF8C42)
  - Secondary: Calm blue (#4A90E2)
  - Success: Encouraging green (#7ED321)
  - Warning: Gentle yellow (#F5A623)
  - Background: Soft cream (#FAFAF8)

- **Typography:**
  - Headers: Rounded sans-serif (e.g., Nunito Bold)
  - Body: Clean sans-serif (e.g., Inter Regular)
  - Size: Minimum 16px for body text

- **Illustrations:**
  - Friendly, diverse child characters
  - Colorful food illustrations (not photographs for simplicity)
  - Playful icons for achievements

**Navigation:**
```
┌─────────────────────────────────────┐
│  ☰  [Child Name]           🔔  ⚙️  │ ← Header
├─────────────────────────────────────┤
│                                     │
│         Dashboard Content           │
│         (Scroll view)               │
│                                     │
├─────────────────────────────────────┤
│  🏠  📊  🍽️  📅  👤                │ ← Bottom Nav
│ Home Stats Plan Log Profile        │
└─────────────────────────────────────┘
```

**Tab Navigation:**
- **Home:** Dashboard overview (this document's content)
- **Stats:** Detailed charts and progress
- **Plan:** Weekly meal planner
- **Log:** Quick meal outcome logging
- **Profile:** Child settings, re-assessment

---

## 5. Food Recommendation Engine

### 5.1 Food Chaining Algorithm

**Concept:** Based on research showing food chaining effectively expands picky eater diets by building from accepted foods through small, strategic changes.

#### **Similarity Scoring Matrix**

For every food in database, calculate similarity scores across dimensions:

**Dimensions (Weighted):**

1. **Taste Profile (25%)**
   - Sweet (1-5 scale)
   - Salty (1-5)
   - Savory (1-5)
   - Bitter (1-5)
   - Sour (1-5)

2. **Texture (30%)** - Highest weight for texture-sensitive kids
   - Hardness (1=puree to 5=hard/crunchy)
   - Particle size (1=smooth to 5=chunky)
   - Moisture (1=dry to 5=wet)
   - Chewability (1=melts to 5=requires chewing)

3. **Appearance (20%)**
   - Color family (red, orange, yellow, green, blue/purple, white/brown)
   - Visual complexity (1=uniform to 5=varied/mixed)
   - Familiarity (common shape vs. unusual)

4. **Preparation Method (15%)**
   - Raw, steamed, boiled, baked, fried, grilled
   - Temperature served

5. **Food Family (10%)**
   - Botanical/culinary grouping
   - Cultural cuisine association

#### **Distance Calculation**

For each pair of foods (safe food A, candidate food B):

```
Similarity Score = 100 - Weighted Sum of |Differences|

Example:
Safe Food: Mashed Potatoes
  - Taste: Sweet(2), Salty(2), Savory(3), Bitter(0), Sour(0)
  - Texture: Hardness(1), Particle(1), Moisture(4), Chew(1)
  - Appearance: Color(white/brown), Complexity(1)
  - Prep: Boiled, Hot
  - Family: Starchy vegetable

Candidate: Sweet Potato Fries
  - Taste: Sweet(4), Salty(2), Savory(2), Bitter(0), Sour(0)
  - Texture: Hardness(3), Particle(2), Moisture(2), Chew(3)
  - Appearance: Color(orange), Complexity(2)
  - Prep: Baked, Hot
  - Family: Starchy vegetable

Distance = 0.25*|Taste differences| + 0.30*|Texture differences| + ...
         = 0.25*2 + 0.30*8 + 0.20*3 + 0.15*1 + 0.10*0
         = 0.5 + 2.4 + 0.6 + 0.15 + 0
         = 3.65

Similarity Score = 100 - (3.65 * 10) = 63.5/100
```

#### **Recommendation Rules**

1. **High Similarity (Score 80-100):** "Next Step"
   - Minimal change from safe food
   - Present alongside safe food for comparison
   - Example: String cheese → cheese cubes

2. **Medium Similarity (Score 60-79):** "Ready to Try"
   - Moderate change, but bridgeable
   - May need 2-3 steps to reach
   - Example: Applesauce → soft cooked apple pieces

3. **Low Similarity (Score 40-59):** "Future Goal"
   - Significant differences
   - Will require multiple intermediate steps
   - Example: Chicken nuggets → baked salmon

4. **Very Low (<40):** Don't Recommend Yet
   - Too big a leap
   - Risk of rejection and discouragement

#### **Profile-Specific Weighting Adjustments**

Adjust dimension weights based on eating profile:

**Texture-Sensitive Child:**
- Texture weight: 40% (↑ from 30%)
- Taste weight: 20% (↓ from 25%)

**Visual/Olfactory Avoider:**
- Appearance weight: 35% (↑ from 20%)
- Taste weight: 15% (↓ from 25%)

**Routine-Dependent:**
- Preparation method weight: 25% (↑ from 15%)
- Food family weight: 15% (↑ from 10%)

### 5.2 Try-Bite Selection Algorithm

**Weekly Try-Bite Selection (7 foods per week):**

Process:
1. Pool all "High Similarity" and "Medium Similarity" foods not yet tried
2. Filter out allergens and dietary restrictions
3. Apply diversity rules:
   - Max 2 from same food group per week
   - Aim for different food families
   - Balance textures (not all same progression step)
4. Prioritize by:
   - Nutritional gaps (if low in vegetables, prioritize vegetable options)
   - Parental goals (if "increase vegetables" selected, weight vegetable options higher)
   - Seasonal availability (prefer in-season foods)
5. Rank by composite score:
   ```
   Score = (Similarity * 0.4) + (Nutritional Value * 0.3) + 
           (Goal Alignment * 0.2) + (Seasonal Bonus * 0.1)
   ```
6. Select top 7 unique foods

**Fallback Strategy:**
If <7 candidates available (very limited safe foods):
- Include repeated exposures to previously refused foods (research shows 8-15 exposures needed)
- Add ultra-safe bridges (same food, trivial change like shape)
- Recommend professional consultation

### 5.3 Safe Food Bridges Database

**Pre-computed Food Chains:**

Based on evidence from successful food chaining interventions, maintain progression paths:

**Example Chain: Applesauce → Fresh Apple**

```
Step 1: Applesauce (smooth, sweet, soft) ← Starting point
  ↓ (Add tiny soft pieces)
Step 2: Applesauce with soft cooked apple pieces
  ↓ (Increase piece size)
Step 3: Mostly cooked apple pieces with little sauce
  ↓ (Reduce cooking time)
Step 4: Lightly cooked soft apple slices
  ↓ (Introduce raw texture)
Step 5: Thin raw apple slices (peeled, slightly soft variety)
  ↓ (Progress to typical form)
Step 6: Raw apple slices with peel
  ↓ (Full texture)
Step 7: Whole apple (bite and chew)
```

**Chain Types:**
- **Texture progressions** (smooth → crunchy)
- **Temperature progressions** (cold → room temp → warm)
- **Size progressions** (puree → minced → chopped → whole)
- **Preparation progressions** (well-cooked → lightly cooked → raw)
- **Flavor intensity progressions** (mild → flavorful)

### 5.4 Cultural & Dietary Accommodation

**Cultural Food Preferences:**

Detect from household context or ask explicitly:
- Cuisine preferences (Italian, Mexican, Asian, Mediterranean, etc.)
- Religious dietary laws (Kosher, Halal, Hindu vegetarian)
- Family food traditions

**Adapt Recommendations:**
- Hispanic family with texture-sensitive child:
  - Bridge from refried beans → black beans → whole pinto beans
  - From quesadilla → soft taco → harder taco shell
- Asian family:
  - From white rice → fried rice → rice with vegetables
  - From tofu → edamame → other soy products

**Dietary Patterns:**
- Vegetarian/Vegan families: Emphasize plant proteins, ensure B12/Iron recommendations
- Gluten-free: Provide GF alternatives in all chains
- Dairy-free: Focus on calcium-rich alternatives

---

## 6. Technical Implementation

### 6.1 Data Model

#### **Core Entities**

**Child Profile**
```typescript
interface ChildProfile {
  id: string;
  name: string;
  age_months: number;
  household_size: number;
  created_at: timestamp;
  updated_at: timestamp;
  
  // Questionnaire responses
  responses: QuestionnaireResponses;
  
  // Computed fields
  eating_profile: EatingProfile;
  nutritional_risk_score: number;
  safe_foods: string[]; // Food IDs
  allergens: Allergen[];
}

interface EatingProfile {
  primary_type: 'selective' | 'texture_sensitive' | 'visual_avoider' | 
                'sensory_seeker' | 'routine_dependent' | 'typical';
  severity: 'mild' | 'moderate' | 'severe';
  secondary_patterns: string[];
  sensory_scores: {
    texture_sensitivity: number;
    visual_sensitivity: number;
    olfactory_sensitivity: number;
    neophobia_score: number;
  };
}

interface Allergen {
  food_id: string;
  severity: 'mild' | 'moderate' | 'severe';
  notes?: string;
}
```

**Food Database**
```typescript
interface Food {
  id: string;
  name: string;
  category: 'protein' | 'grain' | 'fruit' | 'vegetable' | 'dairy' | 'snack';
  
  // Sensory properties
  taste_profile: {
    sweet: number;      // 1-5
    salty: number;
    savory: number;
    bitter: number;
    sour: number;
  };
  
  texture_properties: {
    hardness: number;        // 1-5
    particle_size: number;   // 1-5
    moisture: number;        // 1-5
    chewability: number;     // 1-5
  };
  
  appearance: {
    color_family: string[];
    visual_complexity: number; // 1-5
  };
  
  preparation: {
    method: string;
    temperature: 'cold' | 'room_temp' | 'warm' | 'hot';
  };
  
  // Nutrition (per serving)
  nutrition: {
    calories: number;
    protein_g: number;
    fiber_g: number;
    iron_mg: number;
    calcium_mg: number;
    vitamin_a_mcg: number;
    vitamin_c_mg: number;
  };
  
  // Safety
  common_allergens: string[];
  age_appropriate_months: number; // Minimum age
  
  // Metadata
  cultural_tags: string[];
  seasonal: string[]; // Months
}
```

**Food Recommendation**
```typescript
interface FoodRecommendation {
  id: string;
  child_profile_id: string;
  from_food_id: string | null; // null for first foods
  to_food_id: string;
  similarity_score: number;
  recommendation_tier: 'next_step' | 'ready_to_try' | 'future_goal';
  reasoning: string;
  strategy_tips: string[];
  created_at: timestamp;
}
```

**Meal Plan Entry**
```typescript
interface MealPlanEntry {
  id: string;
  child_profile_id: string;
  date: date;
  meal_slot: 'breakfast' | 'lunch' | 'dinner' | 'snack1' | 'snack2' | 'try_bite';
  food_id: string;
  
  // Outcome tracking
  outcome: 'ate' | 'tasted' | 'refused' | 'not_offered' | null;
  notes: string;
  logged_at: timestamp | null;
}
```

**Progress Tracking**
```typescript
interface ProgressSnapshot {
  id: string;
  child_profile_id: string;
  snapshot_date: date;
  
  metrics: {
    total_safe_foods: number;
    food_groups_covered: number;
    nutritional_risk_score: number;
    new_foods_tried_this_week: number;
    new_foods_accepted_this_week: number;
    texture_progress_level: number;
  };
}
```

### 6.2 Algorithm Implementations

#### **Similarity Score Calculator**

```python
def calculate_food_similarity(
    food_a: Food, 
    food_b: Food, 
    profile: EatingProfile
) -> float:
    """
    Calculate similarity score between two foods based on 
    sensory properties and child's eating profile.
    Returns score 0-100 (higher = more similar).
    """
    
    # Adjust weights based on profile
    weights = get_profile_weights(profile)
    
    # Calculate component differences
    taste_diff = calculate_taste_difference(food_a.taste_profile, food_b.taste_profile)
    texture_diff = calculate_texture_difference(food_a.texture_properties, food_b.texture_properties)
    appearance_diff = calculate_appearance_difference(food_a.appearance, food_b.appearance)
    prep_diff = calculate_preparation_difference(food_a.preparation, food_b.preparation)
    family_diff = 0 if foods_same_family(food_a, food_b) else 10
    
    # Weighted sum
    total_difference = (
        weights['taste'] * taste_diff +
        weights['texture'] * texture_diff +
        weights['appearance'] * appearance_diff +
        weights['preparation'] * prep_diff +
        weights['family'] * family_diff
    )
    
    # Convert to similarity (inverse of distance)
    similarity = 100 - total_difference
    
    return max(0, min(100, similarity))

def get_profile_weights(profile: EatingProfile) -> dict:
    """Return dimension weights based on eating profile."""
    base_weights = {
        'taste': 0.25,
        'texture': 0.30,
        'appearance': 0.20,
        'preparation': 0.15,
        'family': 0.10
    }
    
    if profile.primary_type == 'texture_sensitive':
        base_weights['texture'] = 0.40
        base_weights['taste'] = 0.20
    elif profile.primary_type == 'visual_avoider':
        base_weights['appearance'] = 0.35
        base_weights['taste'] = 0.15
    elif profile.primary_type == 'routine_dependent':
        base_weights['preparation'] = 0.25
        base_weights['family'] = 0.15
    
    return base_weights
```

#### **Try-Bite Selector**

```python
def select_weekly_try_bites(
    profile: ChildProfile,
    already_tried: List[str],
    nutritional_goals: List[str]
) -> List[FoodRecommendation]:
    """
    Select 7 try-bite foods for the week based on child profile,
    food chaining principles, and nutritional goals.
    """
    
    # Get all candidate foods
    candidates = get_candidate_foods(
        profile.safe_foods,
        profile.allergens,
        profile.eating_profile
    )
    
    # Filter out already tried
    candidates = [c for c in candidates if c.to_food_id not in already_tried]
    
    # Score each candidate
    scored_candidates = []
    for candidate in candidates:
        score = calculate_try_bite_score(
            candidate,
            profile,
            nutritional_goals
        )
        scored_candidates.append((candidate, score))
    
    # Sort by score
    scored_candidates.sort(key=lambda x: x[1], reverse=True)
    
    # Apply diversity rules and select top 7
    selected = apply_diversity_selection(scored_candidates, max_count=7)
    
    return selected

def calculate_try_bite_score(
    recommendation: FoodRecommendation,
    profile: ChildProfile,
    nutritional_goals: List[str]
) -> float:
    """Calculate composite score for try-bite selection."""
    
    # Base similarity score
    score = recommendation.similarity_score * 0.4
    
    # Nutritional value bonus
    food = get_food_by_id(recommendation.to_food_id)
    nutrition_score = calculate_nutritional_value(food, profile)
    score += nutrition_score * 0.3
    
    # Goal alignment bonus
    goal_score = calculate_goal_alignment(food, nutritional_goals)
    score += goal_score * 0.2
    
    # Seasonal bonus
    if is_seasonal(food):
        score += 10 * 0.1
    
    return score
```

#### **Nutritional Risk Scorer**

```python
def calculate_nutritional_risk(profile: ChildProfile) -> dict:
    """
    Calculate comprehensive nutritional risk score and identify
    specific nutrient concerns.
    Returns score 0-100 and list of flagged nutrients.
    """
    
    safe_foods = [get_food_by_id(fid) for fid in profile.safe_foods]
    
    # Food group coverage (40 points max)
    group_score = calculate_food_group_score(safe_foods)
    
    # Variety within groups (20 points max)
    variety_score = calculate_variety_score(safe_foods)
    
    # Texture variety (15 points max)
    texture_score = calculate_texture_variety_score(
        safe_foods, 
        profile.eating_profile.sensory_scores
    )
    
    # Sensory flexibility (15 points max)
    sensory_score = calculate_sensory_flexibility_score(
        profile.eating_profile.sensory_scores
    )
    
    # Meal structure (10 points max)
    structure_score = calculate_meal_structure_score(profile.responses)
    
    total_score = (
        group_score + 
        variety_score + 
        texture_score + 
        sensory_score + 
        structure_score
    )
    
    # Identify specific nutrient risks
    nutrient_flags = identify_nutrient_risks(safe_foods)
    
    return {
        'total_score': total_score,
        'risk_level': categorize_risk(total_score),
        'component_scores': {
            'food_groups': group_score,
            'variety': variety_score,
            'texture': texture_score,
            'sensory_flexibility': sensory_score,
            'meal_structure': structure_score
        },
        'nutrient_flags': nutrient_flags
    }

def identify_nutrient_risks(foods: List[Food]) -> List[dict]:
    """Identify potential nutrient deficiency risks."""
    
    flags = []
    
    # Calculate aggregated nutrition from safe foods
    total_nutrition = aggregate_nutrition(foods)
    
    # Check thresholds for key nutrients
    # (Thresholds vary by age - implement age-specific logic)
    
    if total_nutrition['iron_mg'] < IRON_THRESHOLD:
        flags.append({
            'nutrient': 'iron',
            'severity': 'moderate',
            'recommendation': 'Add fortified cereals, lean meats, or beans'
        })
    
    if total_nutrition['calcium_mg'] < CALCIUM_THRESHOLD:
        flags.append({
            'nutrient': 'calcium',
            'severity': 'moderate',
            'recommendation': 'Ensure adequate dairy or fortified alternatives'
        })
    
    # ... check other nutrients
    
    return flags
```

### 6.3 API Endpoints

**RESTful API Design**

```
POST   /api/profiles
       Create new child profile
       Body: { name, age_months, ... }
       Returns: { profile_id, ... }

GET    /api/profiles/:id
       Retrieve profile and computed metrics
       Returns: Full ChildProfile with eating_profile, risk scores

PATCH  /api/profiles/:id
       Update profile (e.g., after re-assessment)

POST   /api/questionnaires/:profile_id/responses
       Submit questionnaire responses
       Body: { responses: {...} }
       Triggers: Profile analysis, recommendation generation

GET    /api/profiles/:id/dashboard
       Get all dashboard data in single call
       Returns: {
         profile_summary,
         eating_pattern_insights,
         nutritional_snapshot,
         recommendations,
         progress_data
       }

GET    /api/profiles/:id/recommendations
       Get food recommendations
       Query: ?limit=10&tier=next_step
       Returns: List of FoodRecommendation

POST   /api/profiles/:id/meal-plans
       Generate weekly meal plan
       Body: { start_date, preferences }
       Returns: 7 days of meal entries

GET    /api/profiles/:id/meal-plans/current
       Get current week's meal plan
       
PATCH  /api/meal-entries/:id
       Log meal outcome
       Body: { outcome: 'ate|tasted|refused', notes }

GET    /api/profiles/:id/progress
       Get progress metrics over time
       Query: ?weeks=12
       Returns: Array of ProgressSnapshot

GET    /api/foods
       Search/browse food database
       Query: ?category=vegetable&allergen_free=peanuts&texture_max=3
       Returns: Paginated food list

GET    /api/foods/:id/similar
       Get similar foods for chaining
       Query: ?profile_id=xxx
       Returns: Ranked list with similarity scores
```

### 6.4 Frontend Components

**Key React Components:**

```typescript
// Dashboard page
<DashboardPage>
  <ProfileSummaryCard profile={childProfile} />
  <EatingPatternInsight profile={childProfile} />
  <NutritionalSnapshot data={nutritionData} />
  <FoodRecommendationCarousel recommendations={recommendations} />
  <ProgressCharts data={progressData} />
  <ActionItemsChecklist profile={childProfile} />
</DashboardPage>

// Questionnaire flow
<QuestionnaireFlow>
  <ProgressIndicator currentStep={step} totalSteps={6} />
  <QuestionSection 
    section={currentSection} 
    onComplete={handleSectionComplete}
  />
  <NavigationButtons 
    onBack={handleBack} 
    onNext={handleNext} 
  />
</QuestionnaireFlow>

// Visualization components
<DonutChart 
  data={foodGroupCoverage} 
  interactive={true}
  onSegmentClick={handleGroupClick}
/>

<RainbowChart 
  colors={colorVariety}
  maxValue={7}
/>

<TextureSpectrum 
  currentPosition={profile.texture_preference}
  targetPosition={profile.texture_goal}
/>

// Recommendation cards
<FoodRecommendationCard
  fromFood={safeFood}
  toFood={newFood}
  strategy={recommendation.strategy}
  onAddToMealPlan={handleAdd}
/>
```

### 6.5 Data Storage & Performance

**Database Schema (PostgreSQL):**

```sql
-- Core tables
CREATE TABLE child_profiles (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  name VARCHAR(100),
  age_months INTEGER,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  questionnaire_responses JSONB,
  eating_profile JSONB,
  nutritional_risk_score INTEGER,
  allergens JSONB
);

CREATE TABLE foods (
  id UUID PRIMARY KEY,
  name VARCHAR(200),
  category VARCHAR(50),
  taste_profile JSONB,
  texture_properties JSONB,
  appearance JSONB,
  preparation JSONB,
  nutrition JSONB,
  common_allergens TEXT[],
  age_appropriate_months INTEGER,
  cultural_tags TEXT[],
  seasonal TEXT[]
);

CREATE TABLE child_safe_foods (
  child_profile_id UUID REFERENCES child_profiles(id),
  food_id UUID REFERENCES foods(id),
  added_at TIMESTAMP,
  PRIMARY KEY (child_profile_id, food_id)
);

CREATE TABLE food_recommendations (
  id UUID PRIMARY KEY,
  child_profile_id UUID REFERENCES child_profiles(id),
  from_food_id UUID REFERENCES foods(id),
  to_food_id UUID REFERENCES foods(id),
  similarity_score FLOAT,
  recommendation_tier VARCHAR(20),
  reasoning TEXT,
  strategy_tips TEXT[],
  created_at TIMESTAMP
);

CREATE TABLE meal_plan_entries (
  id UUID PRIMARY KEY,
  child_profile_id UUID REFERENCES child_profiles(id),
  date DATE,
  meal_slot VARCHAR(20),
  food_id UUID REFERENCES foods(id),
  outcome VARCHAR(20),
  notes TEXT,
  logged_at TIMESTAMP
);

CREATE TABLE progress_snapshots (
  id UUID PRIMARY KEY,
  child_profile_id UUID REFERENCES child_profiles(id),
  snapshot_date DATE,
  metrics JSONB,
  created_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_recommendations_profile ON food_recommendations(child_profile_id);
CREATE INDEX idx_meal_entries_profile_date ON meal_plan_entries(child_profile_id, date);
CREATE INDEX idx_foods_category ON foods(category);
CREATE INDEX idx_foods_allergens ON foods USING GIN(common_allergens);
```

**Caching Strategy:**

1. **Pre-computed Recommendations:**
   - Calculate food recommendations after questionnaire completion
   - Cache for 1 week (recommendations don't change frequently)
   - Invalidate when profile updated or new foods marked safe

2. **Dashboard Data:**
   - Cache dashboard API response for 1 hour
   - Invalidate on meal logging or profile updates

3. **Food Similarity Scores:**
   - Pre-compute similarity matrix for all food pairs
   - Store in Redis for fast lookups
   - Recompute nightly (low priority background job)

**Performance Targets:**

- Questionnaire page load: <2s
- Dashboard initial load: <3s
- Recommendation generation: <5s
- Meal plan generation: <10s
- Real-time meal logging: <1s

---

## 7. Implementation Roadmap

### 7.1 Phase 1: Foundation (Weeks 1-3)

**Deliverables:**
- ✅ Database schema implementation
- ✅ Food database populated (200+ foods with full sensory/nutrition data)
- ✅ Basic questionnaire UI (all 6 sections functional)
- ✅ Profile storage and retrieval APIs
- ✅ Simple dashboard showing profile summary

**Team:**
- 1 Backend Engineer
- 1 Frontend Engineer  
- 1 Nutrition Consultant (part-time, food database)

**Success Criteria:**
- User can complete questionnaire
- Profile is stored with computed eating type
- Basic dashboard displays

---

### 7.2 Phase 2: Analysis & Recommendations (Weeks 4-6)

**Deliverables:**
- ✅ Eating profile classification algorithm
- ✅ Nutritional risk scoring system
- ✅ Food similarity calculator
- ✅ Recommendation generation (top 20 foods)
- ✅ Dashboard visualizations (donut chart, rainbow, texture spectrum)

**Team:**
- 1 Backend Engineer
- 1 Data Scientist / Algorithm Engineer
- 1 Frontend Engineer (visualizations)
- 1 Nutrition Consultant (validation)

**Success Criteria:**
- Profiles accurately classified (manual validation on 50 test cases)
- Risk scores align with nutrition consultant review
- Recommendations make sense (nutrition consultant review)
- Dashboard is visually appealing and informative

---

### 7.3 Phase 3: Meal Planning Integration (Weeks 7-9)

**Deliverables:**
- ✅ Try-bite selection algorithm
- ✅ Weekly meal plan generator
- ✅ Integration with existing meal planner
- ✅ "If they like, try" recommendation cards
- ✅ Meal plan preview and customization

**Team:**
- 1 Backend Engineer
- 1 Frontend Engineer
- 1 Integration Engineer (connecting to existing meal planner)

**Success Criteria:**
- Meal plans include appropriate try-bite foods
- Try-bites are well-matched to profile (validation testing)
- Users can accept/modify/regenerate plans
- Seamless experience from questionnaire → dashboard → meal plan

---

### 7.4 Phase 4: Progress Tracking & Iteration (Weeks 10-12)

**Deliverables:**
- ✅ Meal outcome logging (ate/tasted/refused)
- ✅ Progress metrics calculation
- ✅ Progress visualizations (line charts, calendars)
- ✅ Safe foods list auto-updates based on outcomes
- ✅ Achievement/milestone system
- ✅ Re-assessment trigger (after 8-12 weeks)

**Team:**
- 1 Backend Engineer
- 1 Frontend Engineer
- 1 UX Designer (progress celebration features)

**Success Criteria:**
- Users can easily log meal outcomes
- Progress is visible and motivating
- Safe foods list grows as child accepts foods
- System prompts re-assessment when appropriate

---

### 7.5 Phase 5: Polish & Launch (Weeks 13-16)

**Deliverables:**
- ✅ Mobile app optimization (responsive design)
- ✅ Onboarding flow refinement
- ✅ Help documentation and tips
- ✅ Email notifications (weekly summary, milestones)
- ✅ Performance optimization
- ✅ Beta testing with 50 families
- ✅ Bug fixes and refinements

**Team:**
- Full team
- 1 QA Engineer
- 1 Technical Writer (documentation)
- Beta testers (parents)

**Success Criteria:**
- <2% bug rate in beta
- >80% beta tester satisfaction
- <10 min average questionnaire completion
- >70% of beta families continue using after 4 weeks
- Performance targets met

---

### 7.6 Post-Launch: Iteration & Enhancement

**Ongoing:**
- Monitor user engagement and completion rates
- Analyze which recommendations are most successful
- Expand food database (seasonal, cultural foods)
- Add community features (success sharing, tips)
- Integrate with other health tracking (growth charts)
- Professional collaboration features (share with RD/OT)

**Future Enhancements:**
- AI-powered chatbot for mealtime questions
- Computer vision for food logging (photo = auto-log)
- Grocery list optimization and delivery integration
- Multi-child household support
- Caregiver collaboration (grandparents, daycare)
- Integration with recipe apps

---

## Appendix A: Research Sources & Evidence Base

This PRD is grounded in peer-reviewed research:

### Validated Assessment Tools Referenced:
1. **Children's Eating Behavior Questionnaire (CEBQ)** - Food Fussiness subscale
2. **Picky Eating Questionnaire (PEQ)** - Maternal perception of pickiness
3. **Child Food Texture Preference Questionnaire (CFTPQ)** - Texture preferences
4. **Food Neophobia Scale (FNS)** - Willingness to try new foods
5. **Short Sensory Profile (SSP)** - Sensory processing patterns
6. **Pediatric Eating Assessment Tool (Pedi-EAT)** - Feeding problems screening

### Evidence-Based Strategies:
- **Repeated Exposure**: 8-15 exposures needed for food acceptance (Research: Cooke et al., Wardle et al.)
- **Food Chaining**: Effective for expanding diet in selective eaters (Research: Fraker et al.)
- **Texture Progression**: Gradual advancement supports acceptance (Research: Child Food Texture Preference studies)
- **Sensory-Based Intervention**: Effective for sensory-sensitive children (Research: Occupational therapy feeding literature)

### Key Research Papers:
- Wardle et al. (2001) - Development of CEBQ
- Fildes et al. (2014) - Food Preference Questionnaire
- Jani et al. (2020, 2022) - PEQ and C-FPQ validation
- Coulthard & Sealy (2017) - Sensory play interventions
- Taylor et al. (2015) - Picky eating definitions and assessment review

---

## Appendix B: Sample Questionnaire Output

**Example Completed Assessment:**

```
═══════════════════════════════════════════════
CHILD EATING PROFILE REPORT
═══════════════════════════════════════════════

Child: Emma
Age: 3 years 2 months
Assessment Date: October 10, 2025

─────────────────────────────────────────────
EATING PROFILE
─────────────────────────────────────────────

Primary Type: Texture-Sensitive Eater
Severity: Moderate
Secondary Patterns: Visual sensitivity (mild)

─────────────────────────────────────────────
CURRENT SAFE FOODS (21 total)
─────────────────────────────────────────────

Proteins (3): Chicken nuggets, cheese sticks, yogurt
Grains (7): White bread, pasta, rice, crackers, cereal, 
           tortillas, pancakes
Fruits (3): Bananas, applesauce, grapes
Vegetables (2): Carrots (cooked), corn
Dairy (3): Milk, cheese, yogurt
Snacks (3): Goldfish crackers, animal crackers, pretzels

─────────────────────────────────────────────
NUTRITIONAL ASSESSMENT
─────────────────────────────────────────────

Risk Score: 58/100 (Moderate Risk)

Component Scores:
• Food Group Coverage: 28/40 (Good - all groups present)
• Variety Within Groups: 10/20 (Limited color/type variety)
• Texture Variety: 6/15 (Mostly soft/smooth textures)
• Sensory Flexibility: 8/15 (Moderate rigidity)
• Meal Structure: 8/10 (Regular family meals)

Nutrient Concerns:
⚠️  Fiber: Low (limited fruits/vegetables)
⚠️  Vitamin A: Low (few orange/yellow foods)
⚠️  Vitamin C: Moderate (some fruit, limited variety)
✅  Calcium: Adequate (good dairy intake)
✅  Protein: Adequate (multiple sources)
✅  Iron: Adequate (fortified cereal + chicken)

─────────────────────────────────────────────
SENSORY PROFILE
─────────────────────────────────────────────

Texture Preference: Strong preference for soft, smooth
  Current comfort: Level 1-2 (smooth to slightly lumpy)
  Goal (12 weeks): Level 3 (mixed textures)

Food Neophobia Score: 3.6/5 (Moderate)
  • Hesitant to try new foods
  • Distrusts unfamiliar items
  • Willing with encouragement

Sensory Sensitivities:
  • Texture: HIGH (gags on lumpy foods)
  • Visual: MODERATE (dislikes mixed/messy foods)
  • Olfactory: LOW (smell doesn't bother)
  • Temperature: LOW (flexible)

─────────────────────────────────────────────
ALLERGENS & RESTRICTIONS
─────────────────────────────────────────────

❌ Tree Nuts (Severe - anaphylaxis risk)
   Action: Strict avoidance, check all labels

─────────────────────────────────────────────
PARENTAL GOALS & CONCERNS
─────────────────────────────────────────────

Top Concerns:
1. Limited vegetable intake
2. Limited food variety
3. Mealtime stress

Priority Goals:
1. Increase vegetable acceptance
2. Expand texture acceptance
3. Reduce mealtime battles

─────────────────────────────────────────────
RECOMMENDATIONS
─────────────────────────────────────────────

Immediate Focus (Weeks 1-4):
1. Expand safe vegetable list to 4-5 items
   → Sweet potato (soft, orange, similar to carrots)
   → Peas (small, mild, easy texture)
   
2. Introduce soft fruit variety
   → Peaches (soft like bananas)
   → Melon (mild, soft)

3. Begin texture progression
   → Yogurt with tiny soft fruit pieces
   → Slightly thicker applesauce

Strategies for Emma:
• Use food chaining from current safe foods
• Serve new foods alongside familiar ones
• No pressure - aim for 8-15 exposures per food
• Involve in food prep (sensory exploration)
• Celebrate tasting, not just eating
• Maintain consistent meal routines

Resources:
📖 "Food Chaining for Texture-Sensitive Children"
👥 Picky Eater Parent Support Group
🏥 Consider OT consultation if no progress in 8 weeks

─────────────────────────────────────────────
NEXT STEPS
─────────────────────────────────────────────

1. Review your personalized food recommendations
2. Generate your first weekly meal plan
3. Begin tracking meal outcomes
4. Celebrate small wins!

Re-assessment recommended: December 10, 2025 (8 weeks)

═══════════════════════════════════════════════
```

---

## Appendix C: Visualization Specifications

### Donut Chart (Food Group Coverage)

**Libraries:** Chart.js or Recharts

**Specifications:**
- 5 segments (Proteins, Grains, Fruits, Vegetables, Dairy)
- Colors: 
  - Proteins: #E74C3C (red)
  - Grains: #F39C12 (orange)
  - Fruits: #E67E22 (bright orange)
  - Vegetables: #27AE60 (green)
  - Dairy: #3498DB (blue)
- Center text: Overall percentage (e.g., "64%")
- Hover: Show specific foods and percentage
- Click: Expand to show details

**Accessibility:**
- Include text alternative
- Color-blind friendly palette
- Screen reader labels

---

### Rainbow Chart (Color Variety)

**Specifications:**
- Horizontal bars for each color
- Max width = 100% (complete variety)
- Show specific foods as tooltips
- Emoji icons for each color
- Encouraging message when colors missing

---

### Texture Spectrum (Slider Visualization)

**Specifications:**
- Horizontal line from "Smooth" to "Crunchy"
- Current position marked with filled circle
- Target position (if different) with outline circle
- Labels at key points:
  - Smooth
  - Slightly Lumpy
  - Chunky
  - Mixed
  - Crunchy

---

### Progress Charts (Line Graphs)

**Specifications:**
- X-axis: Time (weeks)
- Y-axis: Metric value
- Multiple metrics available:
  - Total safe foods (count)
  - Nutritional risk score (0-100)
  - New foods tried (weekly count)
- Smooth curves with data point markers
- Annotations for milestones
- Comparison to typical growth curve (optional)

---

## Appendix D: Content & Messaging Guidelines

### Tone & Voice

**Principles:**
1. **Encouraging, not judgmental:** Avoid blame or shame
2. **Evidence-based but accessible:** Reference research without jargon
3. **Empowering parents:** Frame as partnership, not prescription
4. **Celebrating progress:** Even small wins matter
5. **Realistic expectations:** Change takes time, setbacks are normal

**Example Good vs. Bad Phrasing:**

❌ **Bad:** "Your child is an extremely picky eater with severe nutritional deficiencies."

✅ **Good:** "Your child is a selective eater—something many children experience. We'll work together to gradually expand their food comfort zone."

❌ **Bad:** "You need to fix your child's diet immediately or they'll have health problems."

✅ **Good:** "Let's focus on adding one new food per week. Small, consistent steps lead to lasting change."

❌ **Bad:** "Your child refused this food. Try again."

✅ **Good:** "No problem! Research shows kids need 8-15 exposures to a new food before accepting it. Let's keep trying!"

### Educational Content

**Micro-Learning Moments:**

Throughout the app, include bite-sized educational content:

- **Tooltips:** Hover over terms for definitions
- **Info Bubbles:** "Why This Matters" sections
- **Research Callouts:** "Studies show..." with citations
- **Strategy Tips:** "Pro Tip" boxes with actionable advice

**Example Research Callout:**
```
📚 Research Insight
A study in the Journal of Pediatrics found that children 
needed an average of 8-15 exposures to a new food before 
accepting it. Many parents give up after just 3-5 tries. 
Patience pays off!
```

---

## Conclusion

This comprehensive PRD provides a complete roadmap for implementing a child food preference assessment system that:

1. **Quickly captures** essential information via a research-backed questionnaire
2. **Intelligently analyzes** eating patterns and nutritional risks
3. **Visualizes insights** in an engaging, parent-friendly dashboard
4. **Recommends strategically** using food chaining and sensory science
5. **Tracks progress** to celebrate wins and adjust strategies

The system is designed to be **evidence-based, user-friendly, and actionable**, empowering parents to expand their picky eaters' diets with confidence.

**Key Success Factors:**
- Grounded in validated assessment tools
- Leverages food chaining research
- Respects child development and sensory needs
- Balances automation with personalization
- Celebrates progress without pressure

By following this PRD, you'll create a powerful tool that makes personalized meal planning accessible to families struggling with picky eating—turning stress into success, one new food at a time.

---

**Document End**
