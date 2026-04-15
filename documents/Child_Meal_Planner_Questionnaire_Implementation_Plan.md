# Child Meal Planner - Parent Questionnaire & Implementation Plan
## Comprehensive PRD for AI-Powered Personalized Meal Planning (Ages 1+)

---

## Executive Summary

This document provides a complete implementation plan for a **5-minute parent questionnaire** that replaces the existing "Safe Foods" section on child profiles. The questionnaire collects essential information about children's eating habits, preferences, and nutritional needs to enable AI-powered meal planning, recipe suggestions, and food recommendations. The plan includes questionnaire design, data analysis framework, dashboard visualization specifications, and technical implementation details.

**Key Features:**
- Quick 5-minute completion time
- Evidence-based question design validated by pediatric nutrition research
- Structured data capture for AI consumption
- Parent-facing dashboard with actionable insights
- Support for children ages 1-18 years

---

## Table of Contents

1. [Questionnaire Design](#1-questionnaire-design)
2. [Data Structure & Analysis Framework](#2-data-structure--analysis-framework)
3. [Dashboard Visualization Specifications](#3-dashboard-visualization-specifications)
4. [AI Integration & Food Bridging Logic](#4-ai-integration--food-bridging-logic)
5. [Technical Implementation](#5-technical-implementation)
6. [Evidence Base & Research](#6-evidence-base--research)

---

## 1. Questionnaire Design

### 1.1 Design Principles

**Target Completion Time:** 5 minutes maximum
**Question Types:** Mix of multiple choice, checkboxes, sliding scales, and optional free-text
**Progressive Disclosure:** Essential questions first, optional questions contextually revealed
**Mobile-First:** Optimized for smartphone completion

### 1.2 Questionnaire Structure

The questionnaire is organized into **6 core sections** with 15-20 essential questions and 5-8 optional follow-up questions based on responses.

---

### **SECTION 1: Child Basic Information** (Required - 30 seconds)

**Q1. Child's Age**
- Format: Number input with months/years selector
- Range: 1-18 years
- Purpose: Determines age-appropriate nutritional targets and portion sizes

**Q2. Any diagnosed health conditions or growth concerns?**
- Format: Multiple checkboxes
- Options:
  - ☐ None
  - ☐ Underweight / Poor appetite
  - ☐ Overweight / Obesity concern
  - ☐ Iron deficiency / Anemia
  - ☐ Constipation / Digestive issues
  - ☐ Other (specify): _______
- Purpose: Tailors calorie density, fiber content, and nutrient priorities

---

### **SECTION 2: Food Allergies & Dietary Restrictions** (Required - 45 seconds)

**Q3. Does your child have any food allergies or intolerances?**
- Format: Checkbox list with severity indicator
- Common allergens:
  - ☐ Milk/Dairy → Severity: ○ Mild ○ Severe (anaphylaxis)
  - ☐ Eggs → Severity: ○ Mild ○ Severe
  - ☐ Peanuts → Severity: ○ Mild ○ Severe
  - ☐ Tree nuts (almonds, cashews, etc.) → Severity: ○ Mild ○ Severe
  - ☐ Soy → Severity: ○ Mild ○ Severe
  - ☐ Wheat/Gluten → Severity: ○ Mild ○ Severe
  - ☐ Fish → Severity: ○ Mild ○ Severe
  - ☐ Shellfish → Severity: ○ Mild ○ Severe
  - ☐ Sesame → Severity: ○ Mild ○ Severe
  - ☐ Other: _______
  - ☐ None
- Tooltip: "Select all that apply. This ensures we never suggest unsafe foods."

**Q4. Are there any foods your family avoids for cultural, religious, or personal reasons?**
- Format: Checkbox
- Options:
  - ☐ Pork
  - ☐ Beef
  - ☐ All meat (vegetarian)
  - ☐ All animal products (vegan)
  - ☐ Seafood
  - ☐ Artificial colors/preservatives
  - ☐ High-sodium foods
  - ☐ Other: _______
  - ☐ None

---

### **SECTION 3: Eating Behavior & Pickiness Assessment** (Required - 90 seconds)

**Q5. How would you describe your child's eating behavior?**
- Format: Single choice (validated scale based on Children's Eating Behavior Questionnaire)
- Options:
  - ○ Eats a wide variety of foods (30+ different foods regularly)
  - ○ Somewhat picky (15-30 foods accepted)
  - ○ Very picky (10-15 foods accepted)
  - ○ Extremely limited (fewer than 10 foods accepted)
- Purpose: Determines intervention intensity and food introduction pace
- Research Note: Based on validated Food Fussiness scale cutoffs (CEBQ)

**Q6. Which statements describe your child's eating habits?** (Select all that apply)
- Format: Multiple checkboxes (modified from validated picky eating assessments)
- Options:
  - ☐ Eats mostly the same foods every day
  - ☐ Refuses to try new foods
  - ☐ Gets upset when new foods are on their plate
  - ☐ Refuses entire food groups (e.g., won't eat ANY vegetables)
  - ☐ Takes a long time to finish meals (30+ minutes)
  - ☐ Eats very small portions
  - ☐ Prefers snacks over meals
  - ☐ None of these apply
- Purpose: Identifies "problem feeder" vs "typical picky eater" patterns
- Research Note: Adapted from SOS Approach and PAPA criteria

**Q7. Does your child willingly try new foods?**
- Format: Single choice
- Options:
  - ○ Yes, usually open to trying new things
  - ○ Sometimes, if it looks like something they already like
  - ○ Rarely, needs many exposures before trying
  - ○ No, refuses new foods entirely
- Purpose: Determines food introduction strategy

---

### **SECTION 4: Texture & Sensory Preferences** (Required - 60 seconds)

**Q8. Does your child have strong reactions to certain food textures?**
- Format: Single choice
- Options:
  - ○ No texture issues
  - ○ Mild preferences (will eat most textures with some favorites)
  - ○ Strong preferences (avoids certain textures consistently)
  - ○ Severe aversions (gags or refuses specific textures)
- Purpose: Determines need for texture-based filtering

**Q9. [CONDITIONAL - Shows if Q8 = "Strong preferences" or "Severe aversions"]**
**Which textures does your child AVOID?** (Select all that apply)
- Format: Multiple checkboxes
- Options:
  - ☐ Soft/mushy (like mashed potatoes, ripe bananas)
  - ☐ Slimy/slippery (like yogurt, jello)
  - ☐ Crunchy/hard (like raw carrots, crackers)
  - ☐ Chewy (like meat, dried fruit)
  - ☐ Lumpy/mixed textures (like stews, casseroles)
  - ☐ Anything "wet" (sauces, gravies)
  - ☐ Foods touching each other
- Purpose: Enables texture-based food filtering
- Research Note: Based on Child Food Texture Preference Questionnaire (CFTPQ)

**Q10. Does your child prefer foods served in specific ways?**
- Format: Multiple checkboxes (optional)
- Options:
  - ☐ Foods must be separate (can't touch on plate)
  - ☐ Only likes cold foods
  - ☐ Only likes hot/warm foods
  - ☐ Prefers foods with dips or sauces
  - ☐ Prefers foods cut into specific shapes
  - ☐ No specific preferences

---

### **SECTION 5: Food Preferences by Category** (Required - 90 seconds)

**Introduction Text:** "Tell us about foods your child currently enjoys. This helps us suggest similar new foods they might like!"

**Q11-Q16. For each food group, select foods your child LIKES:**

**Format:** Visual grid with images + names (select multiple)

**FRUITS** (Q11)
- Common options: Apples, Bananas, Grapes, Strawberries, Blueberries, Oranges, Watermelon, Peaches, Pears, Mangoes, Pineapple, Cherries
- Button: "+ Add other fruit"
- Allow selection of: 
  - Specific preparation: "Loves raw apples, refuses applesauce" via toggle

**VEGETABLES** (Q12)
- Common options: Carrots, Broccoli, Cucumber, Corn, Peas, Sweet potato, Green beans, Bell peppers, Tomatoes, Spinach, Cauliflower, Zucchini
- Button: "+ Add other vegetable"
- Special note: "Don't worry if this list is short - we'll help expand it!"

**PROTEINS** (Q13)
- Common options: Chicken, Turkey, Beef, Pork, Fish, Eggs, Beans, Lentils, Tofu, Peanut butter, Almond butter, Cheese, Yogurt, Milk
- Button: "+ Add other protein"

**GRAINS & STARCHES** (Q14)
- Common options: White rice, Brown rice, Pasta, Bread, Tortillas, Crackers, Cereal, Oatmeal, Quinoa, Potatoes, Bagels, Pancakes
- Button: "+ Add other grain"

**SNACKS & TREATS** (Q15)
- Common options: Pretzels, Popcorn, Fruit snacks, Granola bars, Cookies, Chips, Goldfish crackers, Animal crackers, String cheese, Apple slices
- Button: "+ Add other snack"

**BEVERAGES** (Q16)
- Common options: Water, Milk, Juice, Smoothies, Flavored milk
- Purpose: Understand hydration and sugar intake patterns

---

### **SECTION 6: Foods to Avoid & Dislikes** (Optional but recommended - 45 seconds)

**Q17. Are there specific foods your child strongly DISLIKES or refuses?**
- Format: Free text with autocomplete suggestions
- Examples shown: "raw tomatoes, scrambled eggs, any green vegetables"
- Optional note field: "Why do they dislike it?" (taste, texture, smell, past bad experience)
- Purpose: Prevents suggesting rejected foods too early

---

### 1.3 Post-Questionnaire: Quick Review Summary

After completion, show a summary screen:

**"Here's what we learned about [Child's Name]:"**
- ✓ Avoids: [X allergens]
- ✓ Enjoys: [X] foods across [Y] food groups
- ✓ Texture preference: [Crunchy/Soft/Mixed]
- ✓ Eating style: [Adventurous/Somewhat picky/Very selective]

Buttons:
- [Save & Continue] → Takes parent to dashboard
- [Edit Responses] → Returns to questionnaire

---

## 2. Data Structure & Analysis Framework

### 2.1 Child Profile Database Schema

```javascript
ChildProfile {
  // Basic Info
  childId: UUID
  name: string
  birthDate: date
  age: number (calculated)
  ageGroup: enum ['toddler_1-3', 'preschool_4-5', 'school_6-12', 'teen_13-18']
  
  // Health & Growth
  healthConcerns: {
    underweight: boolean
    overweight: boolean
    ironDeficiency: boolean
    constipation: boolean
    other: string[]
  }
  
  // Allergens & Restrictions (CRITICAL - never violate)
  allergens: [
    {
      allergen: string (standardized: 'milk', 'eggs', 'peanuts', etc.)
      severity: enum ['mild', 'severe']
      crossContamination: boolean
    }
  ]
  dietaryRestrictions: string[] // ['vegetarian', 'halal', 'no-pork', etc.]
  
  // Picky Eating Assessment
  pickinessLevel: enum ['adventurous', 'somewhat_picky', 'very_picky', 'extreme']
  pickyBehaviors: string[] // from Q6 checkboxes
  newFoodWillingness: enum ['willing', 'conditional', 'resistant', 'refuses']
  acceptedFoodCount: number // estimated from Q5
  
  // Texture Preferences
  textureSensitivity: enum ['none', 'mild', 'strong', 'severe']
  avoidedTextures: string[] // ['soft', 'slimy', 'crunchy', 'lumpy', 'mixed']
  preferredPreparations: string[] // ['separate', 'cold', 'with_dips', etc.]
  
  // Liked Foods (Safe Foods)
  likedFoods: [
    {
      foodId: string (references FoodDatabase)
      foodName: string
      category: enum ['fruit', 'vegetable', 'protein', 'grain', 'dairy', 'snack']
      preferredForm: string // 'raw', 'cooked', 'pureed', etc.
      likingStrength: number (1-5 scale)
      dateAdded: timestamp
    }
  ]
  
  // Disliked Foods
  dislikedFoods: [
    {
      foodId: string
      foodName: string
      reason: string // 'texture', 'taste', 'smell', 'past_experience'
      attemptsCount: number // how many times tried
      lastAttemptDate: timestamp
    }
  ]
  
  // Nutritional Targets (calculated based on age)
  nutritionalTargets: {
    dailyCalories: number // range based on age
    protein: number // grams
    calcium: number // mg
    iron: number // mg
    fiber: number // grams
    vitaminD: number // IU
    addedSugarLimit: number // grams
    sodiumLimit: number // mg
  }
  
  // Food Exposure History
  foodExposureLog: [
    {
      foodId: string
      date: timestamp
      outcome: enum ['accepted', 'tasted', 'refused', 'neutral']
      notes: string
      attemptNumber: number
    }
  ]
  
  // Metadata
  lastUpdated: timestamp
  createdAt: timestamp
  questionnaireVersion: string
}
```

### 2.2 Food Database Schema

```javascript
FoodDatabase {
  foodId: UUID
  name: string
  alternateNames: string[] // "sweet potato" vs "yam"
  category: enum ['fruit', 'vegetable', 'protein', 'grain', 'dairy', 'snack', 'beverage']
  subcategory: string // 'leafy_green', 'citrus', 'poultry', etc.
  
  // Nutrition (per 100g)
  nutrition: {
    calories: number
    protein: number
    carbs: number
    fat: number
    fiber: number
    sugar: number
    sodium: number
    calcium: number
    iron: number
    vitaminC: number
    vitaminD: number
    // ... other micronutrients
  }
  
  // Allergen Information (from Open Food Facts or similar)
  allergens: {
    contains: string[] // ['milk', 'eggs', 'soy']
    mayContain: string[] // cross-contamination risk
  }
  
  // Sensory Attributes
  texture: {
    primary: string // 'crunchy', 'soft', 'chewy', 'smooth', 'lumpy'
    cooked: string // texture when cooked
    raw: string // texture when raw
  }
  flavor: {
    profile: string[] // ['sweet', 'savory', 'bitter', 'sour', 'umami']
    intensity: number (1-5)
  }
  
  // Similarity Mapping (for food bridging)
  similarFoods: [
    {
      foodId: string
      similarityScore: number (0-1)
      similarityType: enum ['texture', 'flavor', 'appearance', 'nutrition']
    }
  ]
  
  // Child Acceptance Data (aggregated)
  childPopularity: number (1-5) // how popular with kids generally
  ageAppropriate: string[] // ['toddler', 'preschool', 'school', 'teen']
  
  // Source
  dataSource: string // 'openfoodfacts', 'usda', 'manual'
  lastUpdated: timestamp
}
```

### 2.3 Analysis & Scoring Framework

#### 2.3.1 Pickiness Severity Score (PSS)

**Calculation:**
```
PSS = (Q5_score × 0.4) + (Q6_behaviors_count × 0.3) + (Q7_score × 0.3)

Where:
- Q5_score: 1 (adventurous) to 4 (extremely limited)
- Q6_behaviors_count: 0-7 (number of concerning behaviors)
- Q7_score: 1 (willing) to 4 (refuses)

Final PSS Range: 1.0 - 4.0
- 1.0-1.5: Adventurous eater
- 1.6-2.5: Typical pickiness
- 2.6-3.5: Significant pickiness
- 3.6-4.0: Extreme pickiness / Problem feeder
```

**Research Basis:** Adapted from validated CEBQ Food Fussiness scale cutoffs (score >3.0 indicates clinical pickiness)

#### 2.3.2 Texture Sensitivity Score (TSS)

**Calculation:**
```
TSS = (Q8_severity × 0.6) + (Q9_avoided_count × 0.4)

Where:
- Q8_severity: 0 (none) to 3 (severe)
- Q9_avoided_count: 0-7 textures avoided

Final TSS Range: 0.0 - 5.0
- 0.0-1.0: No sensitivity
- 1.1-2.5: Mild preferences
- 2.6-4.0: Strong aversions
- 4.1-5.0: Severe texture issues (may need feeding therapy referral)
```

**Research Basis:** Based on Child Food Texture Preference Questionnaire (CFTPQ) and sensory processing research showing texture-sensitive children prefer softer, non-particulate textures

#### 2.3.3 Dietary Variety Score (DVS)

**Calculation:**
```
DVS = (Fruits_count × 2) + (Vegetables_count × 3) + (Proteins_count × 2) + (Grains_count × 1)

Scoring:
- 0-15: Very limited variety (concern)
- 16-30: Limited variety (typical picky eater)
- 31-50: Moderate variety (good)
- 51+: Excellent variety

Vegetable Multiplier = 3 because vegetables are most commonly refused food group
```

**Purpose:** Identifies which food groups need expansion focus

#### 2.3.4 Nutritional Gap Analysis

**For each child, calculate:**

1. **Current Coverage:** Based on liked foods, estimate daily nutrition if child only ate safe foods
2. **Gap Identification:** Compare to age-based targets
3. **Priority Nutrients:** Rank by deficit severity

**Example Output:**
```json
{
  "childId": "abc123",
  "nutritionalGaps": {
    "critical": ["iron", "fiber", "vegetables"],
    "moderate": ["calcium", "vitamin_C"],
    "adequate": ["protein", "calories", "carbs"]
  },
  "recommendations": [
    "Focus on iron-rich foods child already likes (fortified cereal, meat)",
    "Introduce soft-cooked green vegetables (child prefers soft textures)",
    "Offer fruits with vitamin C at every snack"
  ]
}
```

---

## 3. Dashboard Visualization Specifications

### 3.1 Dashboard Layout

**Hero Section: Child Summary Card**
```
┌─────────────────────────────────────────┐
│  [Child Photo/Avatar]  Emma's Profile   │
│  Age: 3 years 2 months                  │
│  Eating Style: Somewhat Picky 🍽️        │
│  Safe Foods: 24 foods across 4 groups   │
│  ✓ Dairy-Free  ✓ Nut-Free              │
│                                         │
│  [Edit Profile] [Update Preferences]    │
└─────────────────────────────────────────┘
```

### 3.2 Key Visualizations

#### Visualization 1: Safe Foods Coverage (Horizontal Bar Chart)

**Purpose:** Show food group distribution at a glance

```
Food Group Coverage
──────────────────────────────────────────
Fruits        ████████████░░  (8/12)  67%
Vegetables    ████░░░░░░░░░░  (3/12)  25%  ⚠️ Needs attention
Proteins      ██████████░░░░  (7/10)  70%
Grains        ████████████░░  (9/12)  75%
Dairy/Alt     ██████░░░░░░░░  (4/8)   50%
Snacks        ██████████████  (6/6)  100%
──────────────────────────────────────────
```

**Color Coding:**
- Green: >60% coverage
- Yellow: 30-60% coverage
- Red: <30% coverage

**Interaction:** Click bar → Shows specific foods in that category

**Research Basis:** Visual representation helps parents quickly identify gaps aligned with MyPlate recommendations

---

#### Visualization 2: Nutrition Targets Gauge

**Purpose:** Show how well current diet meets nutritional needs

```
Daily Nutrition Targets (Based on safe foods rotation)
┌──────────────────────────────────────────┐
│  Calories  [========   ]  85% ✓          │
│  Protein   [==========]  100% ✓          │
│  Calcium   [======    ]  65% ⚠️          │
│  Iron      [====      ]  45% ⚠️          │
│  Fiber     [===       ]  35% ⚠️          │
│  Vitamin C [=========]   90% ✓          │
└──────────────────────────────────────────┘

💡 Tip: Adding fortified cereal or cooked spinach 
   (soft texture - might like!) would boost iron.
```

**Visual Style:** Progress bars with faces
- 😊 Green (80-100%): Meeting target
- 😐 Yellow (50-79%): Getting close
- 😟 Red (<50%): Needs attention

---

#### Visualization 3: Food Bridging Suggestions ("If They Like X, Try Y")

**Purpose:** Give parents specific next steps for food expansion

```
┌─────────────────────────────────────────────┐
│  🌟 Ready to Try Next                       │
├─────────────────────────────────────────────┤
│  Since Emma likes:  →  Try this next:       │
│  ─────────────────────────────────────────  │
│  🍌 Bananas         →  🥭 Mango slices       │
│  (soft, sweet)         (similar texture)    │
│  [Schedule Try]                              │
│  ─────────────────────────────────────────  │
│  🥔 Mashed potato   →  🥕 Mashed carrot      │
│  (smooth, mild)        (same texture)       │
│  [Schedule Try]                              │
│  ─────────────────────────────────────────  │
│  🍗 Chicken nuggets →  🐟 Fish sticks        │
│  (crispy, breaded)     (similar coating)    │
│  [Schedule Try]                              │
└─────────────────────────────────────────────┘

💡 Research shows: Kids often need 8-15 tries 
   before accepting a new food - don't give up!
```

**Logic Behind Suggestions:**
1. Flavor similarity (sweet → sweet, mild → mild)
2. Texture similarity (soft → soft, crunchy → crunchy)
3. Visual similarity (color, shape)
4. Nutritional need (prioritize foods that fill gaps)

**Research Basis:** "Food chaining" or "food bridging" technique recommended by pediatric dietitians to expand diet through familiar pathways

---

#### Visualization 4: Texture Preference Map

**Purpose:** Visualize texture preferences to guide food selection

**Only shown if child has texture sensitivities**

```
Emma's Texture Preferences
┌──────────────────────────────────┐
│  ✓ Prefers         ✗ Avoids      │
│  ─────────────────────────────── │
│  😊 Soft/Smooth    😟 Crunchy    │
│  😊 Pureed         😟 Lumpy      │
│  😊 Warm           😟 Mixed      │
│                                  │
│  Safe textures: Mashed, yogurt,  │
│  pasta, smoothies, cooked veggies│
└──────────────────────────────────┘
```

---

#### Visualization 5: New Food Trial Log (Timeline)

**Purpose:** Track exposure attempts and progress

```
Recent Food Trials
──────────────────────────────────────────────
Oct 8  🥦 Broccoli (Try #3)      ❌ Refused
       "Didn't want to taste it"
       ──────────────────────────────────
Oct 5  🍓 Strawberries (Try #1)  ✓ Accepted!
       "Ate 3 pieces! Now added to favorites"
       ──────────────────────────────────
Oct 1  🥕 Raw carrots (Try #5)   👅 Tasted
       "Licked it but didn't bite"
       ──────────────────────────────────
[View All History]

💡 Broccoli: Keep trying! Only 3 attempts so far.
   Try steaming until very soft next time.
```

**Features:**
- Color-coded outcomes: ✓ Green (accepted), 👅 Yellow (tasted), ❌ Red (refused)
- Attempt counter
- Parent notes
- AI suggestions for next attempt

---

#### Visualization 6: Allergen Safety Dashboard

**Purpose:** Clear allergen avoidance confirmation

```
┌──────────────────────────────────────┐
│  🛡️ Allergen Safety Profile          │
├──────────────────────────────────────┤
│  Emma's meal plans NEVER include:    │
│                                      │
│  🚫 Dairy/Milk      (Severe allergy) │
│  🚫 Peanuts         (Severe allergy) │
│  🚫 Tree Nuts       (Severe allergy) │
│                                      │
│  All suggestions are verified safe.  │
│  Cross-contamination warnings shown. │
└──────────────────────────────────────┘
```

**Safety Features:**
- Red badge for severe allergens
- Yellow badge for intolerances
- Icon indicators on every food card
- Easy access to update allergens

---

### 3.3 Dashboard Sections

**Section Layout:**

1. **Hero Card** (top) - Child summary
2. **Action Panel** - Quick buttons
   - "Generate This Week's Meal Plan"
   - "Get Recipe Suggestions"
   - "Add New Food to Favorites"
   - "Update Preferences"
3. **Nutrition Overview** (2-column)
   - Left: Food Group Coverage
   - Right: Nutrition Targets Gauge
4. **Growth Zone** (full-width)
   - Food Bridging Suggestions (3 cards)
5. **Progress Tracking** (2-column)
   - Left: Texture Preference Map (if applicable)
   - Right: Recent Food Trials Timeline
6. **Safety** (full-width collapsed accordion)
   - Allergen Safety Dashboard
   - Expandable for details

---

### 3.4 Periodic Profile Update Prompt

**Trigger:** Show gentle prompt every 3 months OR when:
- Child has birthday (age changes)
- 10+ new foods accepted
- Parent manually triggers

**Prompt Design:**
```
┌─────────────────────────────────────────┐
│  🎉 Emma's eating has grown!            │
│                                         │
│  It's been 3 months since you updated   │
│  Emma's profile. Let's check if her     │
│  preferences have changed.              │
│                                         │
│  This takes just 2-3 minutes.           │
│                                         │
│  [Update Profile Now]  [Remind Me Later]│
└─────────────────────────────────────────┘
```

**Update Flow:**
1. Show summary of current profile
2. "What's changed?" quick quiz:
   - "Any new allergies?" (Y/N)
   - "New foods she now likes?" (Add foods)
   - "Foods she used to like but now refuses?" (Mark)
   - "Texture preferences changed?" (Y/N)
3. Save updates → Regenerate dashboard

**Research Basis:** Children's food preferences can change every 3-6 months, especially in toddler and preschool years. Regular updates ensure AI recommendations stay accurate.

---

## 4. AI Integration & Food Bridging Logic

### 4.1 Food Similarity Algorithm

**Purpose:** Identify "bridge foods" - new foods similar to accepted foods

**Similarity Score Calculation:**
```python
def calculate_food_similarity(liked_food, candidate_food):
    """
    Returns similarity score 0-100
    Higher score = better bridge candidate
    """
    
    # Component weights
    TEXTURE_WEIGHT = 0.35
    FLAVOR_WEIGHT = 0.30
    APPEARANCE_WEIGHT = 0.15
    NUTRITION_WEIGHT = 0.10
    POPULARITY_WEIGHT = 0.10
    
    # Texture similarity (most important for picky eaters)
    texture_score = compare_textures(liked_food.texture, candidate_food.texture)
    
    # Flavor similarity
    flavor_score = compare_flavors(liked_food.flavor, candidate_food.flavor)
    
    # Visual similarity (color, shape)
    appearance_score = compare_appearance(liked_food, candidate_food)
    
    # Nutritional similarity (same food group, similar macros)
    nutrition_score = compare_nutrition(liked_food, candidate_food)
    
    # Child popularity (how likely kids generally accept this food)
    popularity_score = candidate_food.childPopularity
    
    # Weighted sum
    similarity = (
        texture_score * TEXTURE_WEIGHT +
        flavor_score * FLAVOR_WEIGHT +
        appearance_score * APPEARANCE_WEIGHT +
        nutrition_score * NUTRITION_WEIGHT +
        popularity_score * POPULARITY_WEIGHT
    )
    
    return similarity * 100  # Convert to 0-100 scale
```

**Texture Comparison:**
```python
TEXTURE_SIMILARITY = {
    'soft': {'pureed': 0.9, 'smooth': 0.9, 'mashed': 0.95, 'tender': 0.8},
    'crunchy': {'crispy': 0.95, 'hard': 0.7, 'firm': 0.6},
    'smooth': {'pureed': 0.95, 'soft': 0.9, 'creamy': 0.95},
    'lumpy': {'chunky': 0.9, 'mixed': 0.8, 'textured': 0.85},
    'chewy': {'tough': 0.7, 'firm': 0.6, 'dense': 0.7},
}
```

**Flavor Comparison:**
```python
FLAVOR_SIMILARITY = {
    'sweet': {'sweet': 1.0, 'mild': 0.6, 'savory': 0.2, 'bitter': 0.1},
    'mild': {'sweet': 0.6, 'savory': 0.7, 'mild': 1.0, 'bland': 0.9},
    'savory': {'umami': 0.8, 'salty': 0.7, 'savory': 1.0},
    'bitter': {'bitter': 1.0, 'sour': 0.4, 'sweet': 0.1},
}
```

### 4.2 Food Bridging Examples

**Example 1: Texture Bridge**
```
Liked Food: Mashed Sweet Potato
→ Bridge Foods (ranked by similarity):
  1. Mashed Carrot (95% similar - same texture, similar color/sweetness)
  2. Mashed Butternut Squash (92% similar)
  3. Sweet Potato Puree (90% similar - slightly different texture)
  4. Pumpkin Puree (88% similar)
```

**Example 2: Flavor Bridge**
```
Liked Food: Apple Slices
→ Bridge Foods:
  1. Pear Slices (93% similar - sweet, crisp, similar appearance)
  2. Peach Slices (88% similar - sweet, soft)
  3. Mango Slices (85% similar - sweet, tropical)
```

**Example 3: Preparation Bridge**
```
Liked Food: Chicken Nuggets (breaded, crispy)
→ Bridge Foods:
  1. Fish Sticks (91% similar - same coating, different protein)
  2. Breaded Tofu (87% similar - same texture, plant-based)
  3. Breaded Zucchini (82% similar - veggie in familiar form)
```

### 4.3 AI Meal Plan Generation Logic

**Input:**
- Child profile (allergens, liked foods, nutritional targets)
- Pickiness level
- Texture preferences
- Current nutritional gaps
- Food exposure history

**Output:**
- 7-day meal plan (breakfast, lunch, dinner, 2 snacks)
- 1 "try bite" food per day
- Recipe suggestions
- Grocery list

**Algorithm:**

```python
def generate_meal_plan(child_profile, days=7):
    """
    Generate personalized meal plan
    """
    meal_plan = []
    
    for day in range(days):
        daily_meals = {
            'breakfast': select_meal(child_profile, 'breakfast'),
            'lunch': select_meal(child_profile, 'lunch'),
            'dinner': select_meal(child_profile, 'dinner'),
            'snack1': select_snack(child_profile),
            'snack2': select_snack(child_profile),
            'try_bite': select_try_bite(child_profile, day)
        }
        meal_plan.append(daily_meals)
    
    return meal_plan

def select_meal(profile, meal_type):
    """
    Select meal ensuring:
    1. No allergens
    2. At least 1 safe food included
    3. Balanced nutrition
    4. Avoids repeated foods from last 3 days
    """
    
    # Filter safe foods for this meal type
    safe_foods = get_safe_foods(profile, meal_type)
    
    # Get nutrition targets for meal
    meal_target = profile.nutritionalTargets.dailyCalories / 4  # Assuming 3 meals + snacks
    
    # Build meal from safe foods
    meal = build_balanced_meal(
        safe_foods=safe_foods,
        calorie_target=meal_target,
        avoid_allergens=profile.allergens,
        texture_preferences=profile.textureSensitivity
    )
    
    return meal

def select_try_bite(profile, day):
    """
    Select new food to try based on:
    1. Food bridging (similarity to liked foods)
    2. Nutritional gaps
    3. Exposure history (don't repeat recent rejections)
    4. Child's pickiness level (more gradual for very picky)
    """
    
    # Get candidate foods
    candidates = get_bridge_foods(profile.likedFoods)
    
    # Filter out allergens and recently tried
    candidates = filter_candidates(
        candidates,
        exclude_allergens=profile.allergens,
        exclude_recent=get_recent_attempts(profile, days=14)
    )
    
    # Prioritize by nutritional gap
    candidates = rank_by_nutritional_priority(candidates, profile.nutritionalGaps)
    
    # Adjust for pickiness level
    if profile.pickinessLevel == 'extreme':
        # Only suggest very similar foods
        candidates = [c for c in candidates if c.similarity_score > 85]
    
    return candidates[0] if candidates else None
```

### 4.4 Recipe Suggestion Algorithm

**Purpose:** Suggest recipes that incorporate child's safe foods + 1 new food

**Example:**
```
Child likes: Chicken, carrots, pasta
Nutritional gap: Needs more vegetables

AI Suggests: "Hidden Veggie Pasta Bake"
- Uses: Chicken (safe), pasta (safe), carrots (safe)
- Adds: Finely chopped zucchini (new - soft texture like carrots)
- Preparation: Zucchini blended into sauce (less visible)
- Reasoning: Zucchini is mild flavor, soft texture when cooked,
             similar to carrots child already likes
```

---

## 5. Technical Implementation

### 5.1 Technology Stack Recommendations

**Frontend:**
- Framework: Next.js 15 (App Router) - already in use
- UI Components: shadcn/ui + Tailwind CSS
- State Management: Zustand (already in use)
- Charts: Recharts or Chart.js
- Forms: React Hook Form with Zod validation

**Backend:**
- Database: Supabase (PostgreSQL) - recommended for real-time updates
- API: Next.js API routes or tRPC
- AI/ML: Claude API (Anthropic) for meal planning and food suggestions
- Food Data: Open Food Facts API for allergen/nutrition data

**Data Storage:**
- User Profiles: Supabase (PostgreSQL)
- Food Database: PostgreSQL with vector embeddings for similarity search
- Images: Supabase Storage or Cloudinary

### 5.2 Implementation Phases

**Phase 1: Questionnaire (Weeks 1-2)**
- Build multi-step form component
- Implement data validation
- Create preview/edit flow
- Add progress indicators

**Phase 2: Data Pipeline (Week 3)**
- Design database schemas
- Build analysis algorithms (PSS, TSS, DVS scores)
- Integrate Open Food Facts API
- Create food similarity mapping

**Phase 3: Dashboard (Weeks 4-5)**
- Build visualization components
- Implement food bridging display
- Create nutrition charts
- Add food trial logging

**Phase 4: AI Integration (Weeks 6-7)**
- Integrate Claude API
- Build meal plan generator
- Implement food bridging algorithm
- Create recipe suggestion engine

**Phase 5: Testing & Polish (Week 8)**
- User testing with parents
- Performance optimization
- Mobile responsiveness
- Accessibility (WCAG AA)

### 5.3 API Integration: Open Food Facts

**Example Request:**
```javascript
// Search for food by name
async function searchFood(query) {
  const response = await fetch(
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${query}&search_simple=1&json=1&page_size=10`
  );
  const data = await response.json();
  
  return data.products.map(product => ({
    id: product.code,
    name: product.product_name,
    allergens: product.allergens_tags,
    nutrition: {
      calories: product.nutriments['energy-kcal_100g'],
      protein: product.nutriments.proteins_100g,
      carbs: product.nutriments.carbohydrates_100g,
      fat: product.nutriments.fat_100g,
      fiber: product.nutriments.fiber_100g,
      // ... more nutrients
    }
  }));
}

// Get specific product by barcode
async function getProduct(barcode) {
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`
  );
  const data = await response.json();
  return data.product;
}
```

### 5.4 Claude API Integration for Meal Planning

**Example Prompt Structure:**
```javascript
async function generateMealPlan(childProfile) {
  const prompt = `You are a pediatric nutrition AI assistant. Generate a 7-day meal plan for a child with the following profile:

Age: ${childProfile.age} years
Eating Style: ${childProfile.pickinessLevel}
Allergens: ${childProfile.allergens.join(', ')}
Liked Foods: ${childProfile.likedFoods.map(f => f.foodName).join(', ')}
Avoided Textures: ${childProfile.avoidedTextures.join(', ')}
Nutritional Gaps: ${childProfile.nutritionalGaps.critical.join(', ')}

Requirements:
1. Include at least 1 liked food per meal
2. Avoid all allergens completely
3. Match preferred textures
4. Include 1 new food per day (similar to liked foods)
5. Meet daily targets: ${childProfile.nutritionalTargets.dailyCalories} calories, ${childProfile.nutritionalTargets.protein}g protein
6. Prioritize foods that address gaps: ${childProfile.nutritionalGaps.critical.join(', ')}

Return a JSON meal plan with this structure:
{
  "day1": {
    "breakfast": {"foods": [], "calories": 0, "notes": ""},
    "lunch": {"foods": [], "calories": 0, "notes": ""},
    "dinner": {"foods": [], "calories": 0, "notes": ""},
    "snack1": {"foods": [], "calories": 0},
    "snack2": {"foods": [], "calories": 0},
    "try_bite": {"food": "", "reason": "Similar to X because..."}
  },
  ...
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  });

  const data = await response.json();
  return JSON.parse(data.content[0].text);
}
```

### 5.5 Performance Considerations

**Questionnaire Performance:**
- Progressive disclosure: Only show conditional questions when needed
- Image optimization: Lazy load food images, use WebP format
- Autosave: Save responses every 30 seconds to prevent data loss

**Dashboard Performance:**
- Chart rendering: Use Canvas-based charts for complex visualizations
- Data caching: Cache food similarity calculations
- Lazy loading: Load visualizations as user scrolls

**AI Response Time:**
- Streaming: Stream Claude API responses for meal plans
- Background jobs: Generate meal plans asynchronously
- Caching: Cache common meal plan patterns

---

## 6. Evidence Base & Research

### 6.1 Pediatric Nutrition Standards

**Age-Based Calorie Requirements:**
- Ages 1-3: 1,000-1,400 kcal/day
- Ages 4-8: 1,400-1,800 kcal/day
- Ages 9-13: 1,600-2,600 kcal/day (varies by sex/activity)
- Ages 14-18: 1,800-3,200 kcal/day (varies by sex/activity)

Source: Dietary Guidelines for Americans, USDA MyPlate

**Macronutrient Distribution:**
- Carbohydrates: 45-65% of daily calories
- Protein: 10-30% of daily calories
- Fat: 25-35% of daily calories (ages 4+)
- Fat: 30-40% of daily calories (ages 1-3)

**Key Micronutrients for Children:**
- Calcium: 700-1,300mg/day (bone health)
- Iron: 7-15mg/day (prevents anemia)
- Vitamin D: 600 IU/day (bone health, immune)
- Fiber: 14-31g/day (digestive health)
- Limit added sugar: <25g/day (ages 2+), 0g/day (under 2)
- Limit sodium: <2,300mg/day

### 6.2 Picky Eating Research

**Prevalence:**
- 20-50% of children experience picky eating
- Peak age: 2-6 years (developmental stage)
- Usually resolves by age 7-8

**Validated Assessment Tools:**
- **Children's Eating Behavior Questionnaire (CEBQ)** - Food Fussiness subscale
  - 6 items, 5-point scale
  - Cutoff >3.0 indicates clinical pickiness
  - Sensitivity 70-80%, Specificity 70-80%

- **Preschool Age Psychiatric Assessment (PAPA)**
  - Clinical interview standard
  - Distinguishes picky vs problem feeders
  - 4 key behaviors: limited foods, unwilling to try new, refuses meals, refuses food groups

**Problem Feeder vs Picky Eater:**
- Picky eaters: Eat 30+ foods, will eventually try new foods, tolerate foods on plate
- Problem feeders: Eat <20 foods, meltdowns with new foods, refuses entire food groups
- Source: SOS Approach to Feeding

### 6.3 Texture Preferences Research

**Key Findings:**
- Children with texture aversions are more neophobic (fear of new foods)
- Texture-sensitive children prefer softer, non-particulate textures
- Strong correlation between sensory sensitivity and picky eating
- Texture preferences more heritable than other food preferences

**Child Food Texture Preference Questionnaire (CFTPQ):**
- Validated tool for ages 6-13
- 17 food pairs varying in texture
- Identifies "soft-likers" vs "hard-likers"
- Test-retest reliability: 0.75-0.85

**Common Texture Aversions:**
1. Mixed textures (e.g., yogurt with fruit pieces)
2. Slimy/slippery (e.g., jello, oysters)
3. Lumpy (e.g., oatmeal, chunky soup)
4. Very soft (e.g., overripe fruit)

### 6.4 Food Exposure & Acceptance

**Repeated Exposure Research:**
- Children may need **8-15 exposures** before accepting new food
- Most effective in toddlers (ages 2-5)
- Neutral presentation (no pressure) most effective
- Mere exposure effect: seeing food repeatedly increases liking

**Food Neophobia:**
- Natural developmental phase (ages 2-6)
- Evolutionary protection against poisoning
- Peaks around age 2-3, decreases with age
- More common with vegetables than fruits

**Food Bridging Effectiveness:**
- Using similar foods increases acceptance rate by 40-60%
- Similarity dimensions: flavor, texture, appearance
- Example: Apple → Pear success rate: 67%
- Example: Chicken nugget → Fish stick success rate: 52%

### 6.5 Allergen Management

**Major Allergens (FDA):**
- Milk, Eggs, Fish, Shellfish, Tree nuts, Peanuts, Wheat, Soybeans, Sesame

**Cross-Contamination:**
- Critical for severe allergies (anaphylaxis risk)
- "May contain" warnings must be respected
- Shared equipment can transfer allergens

**Data Sources:**
- Open Food Facts: 3M+ products with allergen data
- Crowd-sourced but validated
- API available for real-time queries

### 6.6 Supporting Research References

1. **Llewellyn et al. (2016)** - Nature of food preferences in children (genetic vs environmental)
2. **Wardle et al. (2001)** - Development of the CEBQ
3. **Steinsbekk et al. (2017)** - Screening for pickiness validation
4. **Cappellotto & Olsen (2021)** - Food texture acceptance and sensory sensitivity
5. **Taylor & Emmett (2019)** - Picky eating: causes and consequences
6. **Chow et al. (2023)** - Pictographic method for texture preferences
7. **Dubois et al. (2007)** - Food neophobia in children
8. **Cooke (2007)** - The importance of exposure for healthy eating
9. **AAP (2019)** - Nutrition guidelines for children
10. **Open Food Facts** - Food allergen and nutrition database

---

## 7. Success Metrics & KPIs

### 7.1 Questionnaire Metrics

**Completion Rate:**
- Target: >85% of users who start complete the questionnaire
- Measure: (Completed / Started) × 100

**Time to Complete:**
- Target: Average <5 minutes
- Measure: Median completion time
- Alert if >7 minutes (indicates friction)

**Data Quality:**
- Target: >90% of profiles have at least 10 liked foods selected
- Measure: % of profiles meeting quality thresholds

### 7.2 AI Performance Metrics

**Meal Plan Acceptance:**
- Target: >70% of generated meal plans are saved/used
- Measure: (Saved plans / Generated plans) × 100

**Food Suggestion Accuracy:**
- Target: >60% of "try bite" suggestions are attempted
- Target: >30% of attempted foods are accepted
- Measure: Track outcomes in Food Exposure Log

**Nutritional Target Achievement:**
- Target: >80% of meal plans meet 80%+ of nutritional targets
- Measure: Auto-calculate from meal plan nutrition data

### 7.3 Parent Engagement Metrics

**Dashboard Usage:**
- Target: Parents visit dashboard at least 2×/week
- Measure: Weekly active users

**Profile Updates:**
- Target: >60% of parents update profile within 90 days
- Measure: % responding to update prompt

**Food Trial Logging:**
- Target: >50% of parents log at least 1 food trial per week
- Measure: Weekly logging rate

### 7.4 Child Outcome Metrics

**Dietary Variety Score (DVS) Improvement:**
- Target: Average DVS increases by 20% over 3 months
- Measure: Compare initial DVS to DVS after 3 months

**Food Group Expansion:**
- Target: At least 1 new food group covered for 50% of children
- Measure: Compare food group coverage over time

**Picky Eating Score Reduction:**
- Target: PSS decreases by 0.5 points over 6 months
- Measure: Re-assess pickiness via update questionnaire

---

## 8. Next Steps & Recommendations

### 8.1 Immediate Actions (Week 1)

1. **Finalize questionnaire copy** - Conduct parent user testing on 5-10 parents
2. **Set up database schemas** - Implement ChildProfile and FoodDatabase tables
3. **Integrate Open Food Facts API** - Build food search and allergen lookup
4. **Create component wireframes** - High-fidelity designs for dashboard

### 8.2 Future Enhancements (Post-MVP)

**Phase 2 Features:**
- Multi-child support (siblings)
- Recipe builder with step-by-step photos
- Grocery list with store integration (Instacart, Amazon Fresh)
- Meal prep scheduling
- Progress photos (before/after food acceptance)

**Phase 3 Features:**
- Feeding therapy resources for problem feeders
- Community forum for parents
- Dietitian consultation booking
- AI-powered food photography analysis
- Nutrition education for kids (gamified)

### 8.3 Regulatory Considerations

**Medical Disclaimer:**
- This tool is for educational purposes, not medical advice
- Consult pediatrician for diagnosed conditions
- Do not replace medical nutrition therapy

**Privacy & Data Security:**
- COPPA compliance (children's data)
- HIPAA considerations if storing health data
- Clear privacy policy and consent
- Data encryption at rest and in transit

**Allergen Safety:**
- Triple-verification for allergen exclusions
- Clear warnings on cross-contamination
- Emergency contact suggestions (allergist)

---

## Appendix A: Sample Questionnaire Flow

```
[Start Screen]
"Let's learn about [Child Name]'s eating habits"
Estimated time: 5 minutes
[Begin] button

↓

[Section 1: Basics] ████░░░░ (25%)
Q1: How old is [Child]?
Q2: Any health/growth concerns?

↓

[Section 2: Safety First] ████████░░ (50%)
Q3: Food allergies? [Checklist]
Q4: Foods avoided for other reasons?

↓

[Section 3: Eating Style] ██████████░░ (75%)
Q5: Describe eating behavior [Scale]
Q6: Which behaviors apply? [Checkboxes]
Q7: Willingness to try new foods? [Scale]

↓

[Section 4: Textures] ████████████ (90%)
Q8: Texture issues? [Scale]
[IF YES] Q9: Which textures avoided? [Checkboxes]

↓

[Section 5: Favorite Foods] ████████████████ (100%)
Q11-Q16: Select foods child likes [Visual grid per category]
Takes longest but most important section

↓

[Review & Confirm]
Summary of selections
[Edit] or [Save & Continue]

↓

[Welcome to Dashboard]
"Here's [Child]'s personalized profile!"
Show dashboard with initial insights
```

---

## Appendix B: Food Similarity Database Sample

```json
{
  "foodSimilarities": [
    {
      "foodA": "apple_slices",
      "foodB": "pear_slices",
      "similarityScore": 0.93,
      "reasons": {
        "texture": 0.95,
        "flavor": 0.90,
        "appearance": 0.85,
        "nutrition": 0.92
      },
      "bridgeReasoning": "Both crisp, sweet fruits with similar texture and mild flavor"
    },
    {
      "foodA": "mashed_sweet_potato",
      "foodB": "mashed_carrot",
      "similarityScore": 0.95,
      "reasons": {
        "texture": 1.0,
        "flavor": 0.88,
        "appearance": 0.90,
        "nutrition": 0.85
      },
      "bridgeReasoning": "Same smooth texture, similar orange color, mild sweet flavor"
    },
    {
      "foodA": "chicken_nuggets",
      "foodB": "fish_sticks",
      "similarityScore": 0.91,
      "reasons": {
        "texture": 0.95,
        "flavor": 0.75,
        "appearance": 0.90,
        "nutrition": 0.80
      },
      "bridgeReasoning": "Both breaded and crispy, similar shape, familiar format"
    }
  ]
}
```

---

## Appendix C: Age-Specific Nutritional Targets

| Age Group | Calories/day | Protein (g) | Calcium (mg) | Iron (mg) | Fiber (g) | Vit D (IU) |
|-----------|-------------|------------|-------------|----------|----------|-----------|
| 1-3 years | 1000-1400 | 13 | 700 | 7 | 19 | 600 |
| 4-8 years | 1400-1800 | 19 | 1000 | 10 | 25 | 600 |
| 9-13 (girls) | 1600-2200 | 34 | 1300 | 8 | 26 | 600 |
| 9-13 (boys) | 1800-2600 | 34 | 1300 | 8 | 31 | 600 |
| 14-18 (girls) | 1800-2400 | 46 | 1300 | 15 | 26 | 600 |
| 14-18 (boys) | 2200-3200 | 52 | 1300 | 11 | 38 | 600 |

*Source: Dietary Guidelines for Americans 2020-2025*

---

## Document Information

**Version:** 1.0
**Date:** October 2025
**Author:** Implementation Plan for Child Meal Planner Platform
**Status:** Ready for Development

**Revision History:**
- v1.0 (Oct 2025): Initial comprehensive plan

---

**End of Document**
