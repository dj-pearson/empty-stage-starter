# EatPal: Child Meal Planner and Preference Intelligence System – Product Requirements Document (PRD)

## 1. Overview
EatPal is an AI-driven child meal planning platform designed to help parents manage picky eating, track allergies, and improve dietary balance for their children. The platform blends structured parental input, nutritional databases, and adaptive learning to generate personalized, rotating meal plans that balance nutrition, safety, and behavioral insights.

This PRD outlines the **questionnaire design**, **data model**, **AI recommendation system**, **dashboard visualization**, and **research-based logic** behind EatPal’s child food preference and meal planning system.

---

## 2. Goals and Objectives

### 2.1 Primary Goals
- Create an engaging, low-friction **parent questionnaire** that captures child preferences, allergies, and goals.
- Build an adaptive **AI planner** that creates balanced meal plans while introducing new foods.
- Provide **visual insights** through a parent dashboard — showing nutrition balance, allergen safety, and progress.
- Integrate with open nutrition sources (e.g., **Open Food Facts**) to enrich data accuracy.

### 2.2 Success Metrics
- 90% parent questionnaire completion rate under 5 minutes.
- 80% accuracy in allergen and safe food filtering.
- Measured improvement in child food diversity within 6–8 weeks of use.
- 75% parent satisfaction rating on dashboard clarity.

---

## 3. Parent Questionnaire Design

The questionnaire is the intake mechanism for each child’s profile. It must be short (approx. 15–20 questions), mobile-friendly, and available for re-entry when preferences or health changes occur.

### 3.1 Core Sections

#### 3.1.1 Child Information
- Child Name / Nickname
- Age / Date of Birth
- Gender (optional)
- Height / Weight (optional for nutrition baseline)

#### 3.1.2 Allergies and Dietary Restrictions
- Check known allergies: [ ] Peanuts [ ] Tree Nuts [ ] Dairy [ ] Soy [ ] Wheat [ ] Gluten [ ] Eggs [ ] Fish [ ] Shellfish [ ] Other (text field)
- Severity rating (Mild / Moderate / Severe)
- Cross-contamination sensitivity (Yes/No)
- Other restrictions: [ ] Vegetarian [ ] Vegan [ ] Halal [ ] Kosher [ ] Other (text field)

#### 3.1.3 Safe Foods and Preferences
- Favorite foods by category (multi-select): Fruits, Vegetables, Proteins, Grains, Dairy, Snacks.
- Disliked foods (multi-select with text field).
- Texture likes/dislikes: [ ] Crunchy [ ] Soft [ ] Smooth [ ] Mixed [ ] Slippery [ ] Warm [ ] Cold.
- Flavor preferences: [ ] Sweet [ ] Salty [ ] Mild [ ] Savory [ ] Tangy [ ] Spicy.
- “Are there foods your child will always eat regardless of situation?” (text field)

#### 3.1.4 Health and Nutrition Goals
- Current concerns: [ ] Underweight [ ] Overweight [ ] Low appetite [ ] Sugar intake [ ] Protein intake [ ] Constipation [ ] Iron deficiency.
- Parent goal (multi-choice):
  - Maintain healthy balance
  - Gain weight
  - Try new foods
  - Reduce sugar
  - Improve variety

#### 3.1.5 Mealtime Behavior
- How would you describe your child’s eating habits?
  - Very picky (under 10 foods)
  - Somewhat selective
  - Eats most foods
- How often do they try new foods?
  - Rarely / Only when forced / Sometimes / Willing to explore
- What helps them try new foods? (e.g., same plate as others, small portions, dipping sauces, familiar shapes)
- Any behavioral notes (text field)

#### 3.1.6 Parental Notes
- Open-ended section for additional information (medical conditions, cultural dietary rules, feeding therapist notes, etc.)

---

## 4. Data Model and Storage

### 4.1 Core Entities
- **Child Profile**
  - child_id (UUID)
  - name, age, gender, height, weight
  - health goals
  - parental notes

- **Allergen Table**
  - allergen_id
  - child_id (FK)
  - allergen_type (e.g., dairy)
  - severity_level
  - cross_contamination (boolean)

- **Preference Table**
  - child_id (FK)
  - food_id (FK)
  - rating (liked = 1, disliked = -1, neutral = 0)
  - reason (taste / texture / other)

- **Texture & Sensory Tags**
  - child_id (FK)
  - preferred_textures [array]
  - avoided_textures [array]

- **Nutrition Targets**
  - child_id (FK)
  - daily_calorie_target
  - macros (protein, fat, carb ratios)
  - micronutrient_goals (iron, calcium, fiber, etc.)

- **Meal History Table**
  - log_id
  - child_id (FK)
  - food_id (FK)
  - date_tried
  - outcome (accepted / rejected / partial)
  - notes

- **Food Database Integration** (via Open Food Facts)
  - food_id
  - food_name
  - category (fruit, vegetable, etc.)
  - allergens [list]
  - nutrition_facts (kcal, protein, sugar, etc.)
  - texture_tags (smooth, crunchy, etc.)
  - flavor_profile (sweet, savory, etc.)

---

## 5. AI Recommendation Engine

### 5.1 Core Logic
The EatPal AI uses a **rule-based + adaptive learning** model.

#### 5.1.1 Inputs
- Child profile data (safe foods, allergies, goals)
- Nutrition requirements (based on age/weight)
- Parent-defined concerns and targets
- Food metadata (Open Food Facts / local DB)

#### 5.1.2 Outputs
- Daily/Weekly meal plan including:
  - Safe foods in rotation
  - Nutritional balance validation
  - “Try bite” food recommendations

#### 5.1.3 Rules and Algorithms
- Always include ≥1 *safe food* per meal.
- Avoid all allergens and restricted categories.
- Meet or exceed 90% of daily nutritional targets.
- Introduce 1 new food every 2–3 days based on **food similarity mapping**:
  - Similar flavor profile (sweet → similar sweet fruit)
  - Similar texture (crunchy → crunchy alternative)
  - Same color group for visual comfort
- Evaluate child response from feedback log.
- Reintroduce rejected foods after a minimum 14-day gap.
- Mark food as *safe* after 3 successful exposures.

#### 5.1.4 Adaptive Learning
- System scores each new food on success rate.
- Successful introductions expand the *food similarity graph*.
- AI reprioritizes new suggestions using similarity scores and category gaps.

#### 5.1.5 Behavior-Based Personalization
- High sensory sensitivity → narrow introduction range.
- Broader eaters → faster introduction cycle.
- AI mimics “food chaining” (bridge from accepted → similar new food).

---

## 6. Dashboard Design & Visualization

### 6.1 Parent Dashboard Modules

#### 6.1.1 Overview Card
- Child name, age, avatar
- Summary: # safe foods, # try bites pending, nutritional coverage

#### 6.1.2 Safe Food Coverage Chart
- Bar or donut chart by category (Fruits, Veggies, Protein, Grains, Dairy)
- Highlight low coverage categories in red/yellow.

#### 6.1.3 Nutrient Balance Panel
- Daily/weekly macro and micronutrient progress (protein, fiber, iron, calcium)
- Use color indicators (green = within range, yellow = slightly low, red = below 50%)

#### 6.1.4 Allergen Assurance Strip
- Icons with strike-throughs for avoided allergens
- Tooltip: “No meals include these ingredients.”

#### 6.1.5 "If They Like X, Try Y" Suggestion Board
- AI-generated pairings with rationale text:
  - Example: “Since Alex likes apples, try pears next — similar crunch and sweetness.”

#### 6.1.6 Progress Timeline
- List of new foods tried with dates and results.
- Filter: Accepted / Rejected / Pending retry.

#### 6.1.7 Recheck Reminder
- Auto-prompt every 3–6 months or at parent discretion.
- Message: “It’s been 90 days since last profile update — review now?”

#### 6.1.8 Educational Insights
- Rotating panel of pediatric feeding facts and parent tips.
  - “Children often need 8–15 exposures to accept new foods.”
  - “Always include one familiar food per meal.”

---

## 7. Data Visualization & Analytics

### 7.1 Parent-Facing Metrics
- % of nutrient targets met per week
- # of unique foods eaten this month
- Average acceptance rate for new foods
- Food exposure count per category

### 7.2 Backend Metrics for System Optimization
- Recommendation success rate
- New food acceptance ratio per demographic
- Profile recheck frequency
- Meal plan completion rate

---

## 8. Research and Behavioral Basis

### 8.1 Repeated Exposure
Children may require 8–15 exposures to accept a new food. EatPal’s exposure log tracks and spaces these attempts appropriately.

### 8.2 Food Bridges & Similarity Mapping
The AI uses taste, color, and texture similarity to recommend gradual introductions. Example: apple → pear → peach.

### 8.3 Balanced Diet Framework
Adheres to pediatric nutrition guidelines:
- Daily calorie target per age group
- Balanced macronutrients
- Minimal added sugar (<25g/day)

### 8.4 Allergy Safety
All foods are cross-referenced with Open Food Facts allergen data.

### 8.5 Behavioral Psychology Integration
Incorporates strategies from pediatric feeding therapy:
- Always include one safe food per meal.
- No pressure to eat new foods.
- Encourage exploration and repeated gentle exposure.

---

## 9. Technical Considerations

### 9.1 APIs
- **Open Food Facts API** – Ingredient, allergen, and nutritional data.
- **USDA FoodData Central API** – Supplemental nutrition source.

### 9.2 Architecture
- Backend: Node.js + PostgreSQL
- AI Engine: Python (FastAPI or Flask microservice)
- Frontend: React Native / Next.js
- Authentication: Firebase Auth or Cognito

### 9.3 Data Privacy
- All child profiles stored under parent accounts.
- HIPAA-like data handling (no public sharing).
- Option to delete profile anytime.

---

## 10. Implementation Roadmap

| Phase | Duration | Focus |
|-------|-----------|-------|
| 1 | Month 1 | Questionnaire design & database schema |
| 2 | Month 2 | AI rule logic & API integration |
| 3 | Month 3 | Dashboard UI and charts |
| 4 | Month 4 | Adaptive learning feedback loop |
| 5 | Month 5 | Beta testing with parent group |
| 6 | Month 6 | Public release + SEO launch (tie to blog engine) |

---

## 11. Future Enhancements
- Multi-child support with shared grocery planning.
- Voice assistant integration (meal check-ins via Alexa/Google).
- Predictive alerts: “Protein goal consistently low — suggest yogurt snacks.”
- Integration with school lunch menus.

---

## 12. References
- Dietary Guidelines for Americans (USDA/HHS)
- American Academy of Pediatrics – Feeding & Nutrition
- Pathways.org – Feeding Development Resources
- Open Food Facts API Documentation
- HealthyChildren.org – Managing Picky Eaters
- Verywell Health – Sensory Food Issues in Children

---

**Document Version:** 1.0  
**Prepared For:** EatPal Product, Engineering, and Nutrition Teams  
**Last Updated:** October 2025