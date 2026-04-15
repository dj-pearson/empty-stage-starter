# Kid Meal Planner – Product Requirements Document (PRD)

## 1. Product Overview

**Goal:**  
Help parents of picky eaters plan weekly meals using a rotation of “safe foods” while introducing one “try bite” food each day. The app will also auto-generate a grocery list based on the meal plan.

**Problem:**  
Parents waste time repeating meals and struggle to add new foods. Traditional lists or spreadsheets get messy and don’t connect to shopping lists.

**Solution:**  
A simple app that saves safe foods, builds a 7-day meal plan with one try bite per day, and turns that plan into a grocery list.

---

## 2. Core Features

### MVP Features

1. **Kid Profile**

   - Add child name, age (optional), notes.
   - Select safe foods for that child.

2. **Food Library (Pantry)**

   - Add foods manually or from starter list.
   - Mark as “Safe Food” or “Try Bite.”
   - Categories: Protein, Carb, Dairy, Fruit, Veg, Snack.

3. **Meal Planner (7-Day Grid)**

   - Auto-generate 7 days of meals:
     - 3 meals + 2 snacks per day.
     - 1 “Try Bite” per day.
   - Prevent repeats in same meal slot for 3 days.
   - Swap foods manually.
   - Log meal outcome: Ate / Tasted / Refused.

4. **Grocery List**

   - Auto-created from weekly plan.
   - Group by food type.
   - Editable quantities.
   - Checkboxes for shopping.
   - Copy or print list.

5. **Storage**
   - Local storage only (MVP).
   - Import/export JSON for backup.

---

## 3. Future Enhancements

- Multi-kid support.
- Login + cloud sync (Supabase).
- AI “Try Bite Suggestions.”
- Recipes and grouped meals.
- Grocery delivery integrations.
- Food analytics (Top eaten foods).

---

## 4. User Stories

### Parent User

- Add safe foods my child will eat.
- Generate a week of meals automatically.
- Swap meals I don’t like.
- See one new food per day.
- View and check off grocery list items.

---

## 5. Functional Requirements

### Data Model

| Table            | Fields                                                                   |
| ---------------- | ------------------------------------------------------------------------ |
| **Kids**         | id, name, age, notes                                                     |
| **Foods**        | id, name, category, is_safe (bool), is_try_bite (bool), allergens, aisle |
| **PlanEntries**  | id, kid_id, date, meal_slot, food_id, result (ate/tasted/refused), notes |
| **GroceryItems** | id, name, qty, unit, checked, source_plan_entry_id                       |

### Meal Rules

- Pull foods from Safe list.
- No repeat for 3 days in same meal slot.
- One Try Bite daily from Try Bite pool.
- Manual swaps don’t reset full plan.

---

## 6. System Design

### Frontend

- Framework: **Next.js 15 (App Router)**
- UI: **Tailwind + shadcn/ui**
- State: **Zustand**
- Storage: **LocalStorage (MVP)**
- Icons: **Lucide-react**

### Backend (Phase 2)

- Database: Supabase (PostgreSQL + Prisma)
- Auth: Clerk/Auth.js
- API: REST or tRPC
- Deployment: Vercel or Fly.io

---

## 7. UI / UX

### Pantry Page

- Table view of all foods.
- Add / Edit / Delete food.
- Filters by category.
- “Mark Safe” or “Mark Try Bite.”
- Load starter list button.

### Planner Page

- 7 columns (Days), 6 rows (Breakfast, Lunch, Dinner, Snack1, Snack2, Try Bite).
- Food name in each cell.
- Buttons:
  - **Build Week**
  - **Shuffle Day**
  - **Swap Food**
  - **Ate / Tasted / Refused**
- Keeps history for last 3 days per meal slot.

### Grocery Page

- Auto-built from current plan.
- Grouped by type.
- Checkbox for each item.
- “Copy to Clipboard” and “Print.”
- Auto-refresh on plan changes.

---

## 8. Implementation Plan

### Phase 1: Setup

- [ ] Create Next.js app with Tailwind + shadcn/ui.
- [ ] Set up Zustand store (foods, plan, grocery).
- [ ] Add seed data (15 safe foods).

### Phase 2: Pantry

- [ ] CRUD for Foods.
- [ ] Safe and Try Bite toggles.
- [ ] LocalStorage persistence.

### Phase 3: Planner

- [ ] Build 7-day grid.
- [ ] Implement rotation logic (Build Week).
- [ ] Add swap and Ate/Tasted/Refused tracking.
- [ ] Save plans locally.

### Phase 4: Grocery List

- [ ] Aggregate unique foods from plan.
- [ ] Add checkboxes and “Copy” button.
- [ ] Clear checked option.

### Phase 5: Polish

- [ ] Responsive styling.
- [ ] Dark mode.
- [ ] JSON import/export.
- [ ] Reset all data button.

---

## 9. Rotation Logic (Pseudo)

```js
function buildWeekPlan(kidId, foods, history) {
  const plan = [];
  const days = 7;
  const slots = ["breakfast", "lunch", "dinner", "snack1", "snack2"];
  const safeFoods = foods.filter((f) => f.is_safe);
  const tryBites = foods.filter((f) => f.is_try_bite);

  for (let d = 0; d < days; d++) {
    slots.forEach((slot) => {
      const recentFoods = history
        .filter((p) => p.meal_slot === slot)
        .slice(-3)
        .map((p) => p.food_id);
      const available = safeFoods.filter((f) => !recentFoods.includes(f.id));
      const pick = available.length
        ? available[d % available.length]
        : safeFoods[0];
      plan.push({ day: d, slot, food: pick });
    });
    const tryBite = tryBites[d % tryBites.length];
    plan.push({ day: d, slot: "try_bite", food: tryBite });
  }
  return plan;
}
```

10. Timeline
    Week Deliverables
    1 Setup project, Pantry CRUD
    2 Planner UI + Build Week logic
    3 Grocery List + Persistence
    4 Styling + Result tracking
    5 Import/Export + Final QA
11. Success Metrics

7-day plan builds under 10 seconds.

Grocery list always matches plan.

Swapping and marking meals takes ≤2 taps.

Fully usable offline.

No account needed for MVP.

12. Next Steps

Finalize UI wireframes.

Build Pantry first with seed data.

Add “Build Week” logic next.

Launch MVP as PWA for mobile use.

Gather parent feedback before adding accounts.
