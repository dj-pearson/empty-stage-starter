# 🚀 Phase 2 Quick Start Guide

Test all the new Phase 2 features in EatPal!

## 🎯 Testing Recipe Collections

### Create Your First Collection
1. Go to **Recipes** page
2. Look for the **Collections Selector** dropdown (shows "All Recipes" by default)
3. Click the dropdown → **Create Collection**
4. **Try a Quick Template:**
   - Click "Weeknight Dinners" template
   - Notice the pre-filled name, description, clock icon, and blue color
   - Click **Create Collection**
5. **Or Create Custom:**
   - Enter name: "Kid Favorites"
   - Choose a heart icon (❤️)
   - Choose pink color
   - Add description: "Recipes kids love"
   - Click **Create Collection**

### Add Recipes to Collections
1. On a recipe card, click **Add to Collection** button
2. Check the boxes for collections you want
3. Click **Save**
4. Recipe is now in those collections!

### Filter by Collection
1. Click the Collections dropdown
2. Select a collection (shows recipe count badge)
3. Only recipes in that collection are displayed
4. Click "All Recipes" to see everything again

### Manage Collections
1. Collections dropdown → **Manage Collections**
2. **Edit:** Click pencil icon to change name/icon/color
3. **Delete:** Click trash icon (recipes stay, just removed from collection)
4. Drag handle (⋮⋮) for future sorting feature

---

## 📝 Testing Multiple Grocery Lists

### Create Your First List
1. Go to **Grocery** page
2. Look for **List Selector** dropdown (shows "My Grocery List" or first list)
3. Click dropdown → **Create New List**
4. **Try different list types:**
   - Name: "Costco Run" → Create
   - Name: "Weekly Shopping" → Create
   - Name: "Party Supplies" → Set as default → Create

### Add Items to Specific List
1. Switch to a list using the dropdown
2. Click **Add Item** button
3. Add items (they go to the currently selected list)
4. Switch lists to see different items

### Manage Lists
1. List dropdown → **Manage Lists**
2. **Rename:** Click pencil → Edit name
3. **Archive:** Toggle "Active" off (hides from dropdown but keeps data)
4. **Delete:** Click trash → Confirms deletion
5. **Set Default:** Check "Set as default list"

### Smart Features
- **Badge Counts:** See item counts in dropdown
- **Default Badge:** Shows which list is default
- **Empty State:** Helpful message when list has no items

---

## 🏪 Testing Store Layout Manager

### Create Your First Store
1. Go to **Grocery** page
2. Click **Store Layouts** button in the header
3. Click the **Create Store** button (or if first time, might show empty state)
4. **Enter store details:**
   - Name: "Costco Redmond"
   - Address: "13130 Willows Rd NE, Redmond, WA" (optional)
   - Check "Set as default store"
   - Click **Create Store**

### Add Aisles to Your Store
1. In the store list, click **Aisles** button for your store
2. **Quick-add aisles:**
   - Aisle name: "Produce" → Aisle #: "1" → **Add**
   - Aisle name: "Dairy" → Aisle #: "2" → **Add**
   - Aisle name: "Frozen" → Aisle #: "3" → **Add**
   - Aisle name: "Bakery" → Aisle #: "4" → **Add**
   - Aisle name: "Meat & Seafood" → Aisle #: "5" → **Add**
3. Each aisle appears instantly in the list below

### Manage Aisles
1. **View Aisle Count:** Shows total aisles in store card
2. **Delete Aisle:** Click trash icon → Confirm
3. **Reorder:** Drag handle (⋮⋮) visible (sorting TBD)

### Manage Stores
1. From Manage Stores dialog:
2. **Edit Store:** Click pencil → Update name/address
3. **Delete Store:** Click trash → Warns about aisle deletion
4. **View Details:** Store card shows name, address, aisle count

---

## 🎨 Testing Enhanced Recipe Cards

### View Enhanced Recipe Card
1. Go to **Recipes** page
2. Notice the new visual design:
   - **Full-width image** at top (if recipe has `image_url`)
   - **Overlay badges:** Difficulty, Kid-Friendly, Rating
   - **Quick stats:** Time, servings, times made
   - **Tags:** Visible at a glance
   - **Stock status:** Red alert for out-of-stock ingredients
   - **Allergen warnings:** Yellow alert if family has allergens
   - **Nutrition panel:** Calories, protein, carbs, fiber
   - **Picky eater tips:** Helpful suggestions

### Test Recipe Actions
1. **Edit Recipe:** Click pencil icon → Opens recipe builder
2. **Delete Recipe:** Click trash icon → Confirms deletion
3. **Add to Grocery List:** Click button → Adds all ingredients to current list
4. **Add to Collection:** Click folder+ button → Select collections

### Create Recipe with All Fields
1. Click **Create Recipe**
2. **Fill in all new fields:**
   - Name: "Mac & Cheese"
   - Description: "Creamy comfort food"
   - Image URL: (paste any image URL)
   - Tags: Add "comfort", "quick", "kid-friendly"
   - Difficulty: "easy"
   - Total Time: "25" minutes
   - Servings: "4"
   - **Nutrition Info:** (if you want to test)
     - Calories: 400
     - Protein: 15g
     - Carbs: 45g
     - Fiber: 2g
3. **Save Recipe**
4. Notice how the enhanced card displays everything beautifully!

---

## ⚡ Quick Testing Scenarios

### Scenario 1: Organize Recipes for the Week
1. Create collections: "Monday", "Tuesday", "Wednesday", etc.
2. Add recipes to each day
3. Filter by collection to see that day's meal
4. Add all Monday recipes to grocery list

### Scenario 2: Multiple Shopping Trips
1. Create lists: "Costco" and "Whole Foods"
2. Switch to Costco list → Add bulk items
3. Switch to Whole Foods → Add organic produce
4. Export each list separately

### Scenario 3: Store-Specific Shopping
1. Create store: "Trader Joe's"
2. Add aisles in the order you walk through the store
3. Future: Map foods to aisles for optimized shopping route

### Scenario 4: Recipe Discovery
1. View all recipes with enhanced cards
2. Filter by difficulty: Look for "easy" badge
3. Check ratings: Look for 4+ stars
4. Check stock: Avoid recipes with out-of-stock items
5. Check allergens: Ensure safe for family

---

## 🎯 Feature Combinations

### Best Practices
- **Collections + Multiple Lists:** Create "Week 1" collection, add all recipes to "Weekly Shopping" list
- **Store Layouts + Real Shopping:** Use aisle order to shop efficiently
- **Enhanced Cards + Smart Decisions:** See stock status before planning meals
- **Collections + Favorites:** Create "5-Star Favorites" collection with best recipes

---

## 🐛 What to Look For

### Expected Behaviors
✅ Real-time sync across devices  
✅ Smooth transitions and animations  
✅ Mobile-responsive layouts  
✅ Helpful empty states  
✅ Confirmation dialogs for destructive actions  
✅ Toast notifications for all actions  
✅ Badge counts update instantly  

### Potential Issues
❌ Slow loading on large collections  
❌ Layout issues on very small screens  
❌ Confusing empty states  
❌ Missing error messages  
❌ Sync delays across devices  

---

## 📊 Success Indicators

**You'll know Phase 2 is working when:**
1. You can organize 20+ recipes into collections effortlessly
2. You can manage 5+ different grocery lists simultaneously
3. You can create custom store layouts matching your real stores
4. Recipe cards are visually appealing and informative
5. All operations feel instant and responsive
6. The app feels like a professional product (not a prototype)

---

## 🎉 Have Fun Testing!

Phase 2 represents a major leap forward in functionality. These features bring EatPal to competitive parity with apps like AnyList and OurGroceries while maintaining our unique value around picky eaters.

**Share your feedback:**
- What features do you use most?
- What feels clunky?
- What's missing?
- What exceeds expectations?

Happy testing! 🚀

