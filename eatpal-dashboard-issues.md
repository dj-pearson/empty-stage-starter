# EatPal Dashboard — QA Issue Report

**Date:** February 26, 2026
**URL:** https://tryeatpal.com/dashboard
**Tested by:** Dan Pearson (pearsonperformance@gmail.com)

---

## Summary

Tested all dashboard pages and interactive elements. Found **7 issues** ranging from bugs to UX improvements.

---

## Issues

### 1. Kids Page — Health Tab Shows No Content
- **Page:** `/dashboard/kids`
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Navigate to Kids page
  2. Click "Health" tab for any child (tested on Ella)
- **Expected:** Health-related information or an empty state with guidance
- **Actual:** Tab activates but no content renders below it — just a blank area before the next child card
- **Fix:** Ensure the Health tab either renders health data or shows an empty state (e.g., "No health info added yet. Complete the profile to add health details.")

### 2. Kids Page — Preferences Tab Shows No Content
- **Page:** `/dashboard/kids`
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Navigate to Kids page
  2. Click "Preferences" tab for any child (tested on Ella)
- **Expected:** Preference settings or an empty state
- **Actual:** Tab activates but renders nothing below it
- **Fix:** Same as Health tab — render content or a meaningful empty state

### 3. Recipe Detail — Nutrition Tab Shows "No nutrition data available"
- **Page:** `/dashboard/recipes` (recipe detail modal)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Navigate to Recipes
  2. Click on any recipe (tested "Crunchy Nugget Loops")
  3. Click "Nutrition" tab
- **Expected:** Nutrition data for the recipe, or at minimum a prompt to add nutrition info
- **Actual:** Shows "No nutrition data available." with no action to add it
- **Fix:** Either auto-calculate nutrition from ingredients, provide a way for users to add nutrition data, or show a more helpful message like "Nutrition data is coming soon" or "Add nutrition info"

### 4. Meal Builder — Child Selection Does Not Persist
- **Page:** `/dashboard/meal-builder`
- **Severity:** High
- **Steps to Reproduce:**
  1. Navigate to Meal Builder (shows "Please select a child to start building meals!")
  2. Click the Family dropdown in the top header bar
  3. Select a child (e.g., Ella)
- **Expected:** Page reloads with Ella's meal builder content
- **Actual:** The dropdown reverts back to "Family" and the page still shows the "Please select a child" message — the child selection doesn't stick
- **Fix:** Ensure selecting a child from the global dropdown properly updates the Meal Builder page context and persists the selection

### 5. Security Settings — Missing Current Password Field
- **Page:** `/dashboard/settings` → Security tab
- **Severity:** High (Security)
- **Steps to Reproduce:**
  1. Navigate to Account Settings
  2. Click Security tab
  3. Observe the Change Password form
- **Expected:** Form should require "Current Password" before allowing a new password to be set
- **Actual:** Only "New Password" and "Confirm New Password" fields are shown — no current password verification
- **Fix:** Add a "Current Password" field that must be validated before allowing a password change. This is a standard security practice to prevent unauthorized password changes from an unattended session.

### 6. Admin Panel — User Names Display as "Unknown"
- **Page:** `/admin` → Users
- **Severity:** Low
- **Steps to Reproduce:**
  1. Navigate to Admin Panel
  2. View the User Management table
- **Expected:** User names should display (pulled from profile display name)
- **Actual:** All users show "Unknown" as their name, with only email addresses visible
- **Fix:** Pull the user's display name from their profile. If no display name is set, fall back to email prefix or show "No Name Set" instead of "Unknown"

### 7. Browser Tab Title Not Updating Per Page
- **Page:** Multiple pages
- **Severity:** Low
- **Steps to Reproduce:**
  1. Navigate between different pages (e.g., Meal Builder, AI Coach, Accessibility Settings)
  2. Observe the browser tab title
- **Expected:** Tab title should reflect the current page (e.g., "Meal Builder - EatPal")
- **Actual:** Several pages retain stale tab titles from previously visited pages (e.g., "Accessibility Settings - EatPal" persists when navigating to AI Coach or Meal Builder)
- **Fix:** Ensure each route updates `document.title` appropriately on mount

---

## Pages Tested (All Loaded Successfully)

| Page | URL | Status |
|------|-----|--------|
| Home/Dashboard | `/dashboard` | ✅ Working |
| Kids | `/dashboard/kids` | ⚠️ Tab issues (see #1, #2) |
| Pantry | `/dashboard/pantry` | ✅ Working |
| Recipes | `/dashboard/recipes` | ⚠️ Nutrition tab (see #3) |
| Planner | `/dashboard/planner` | ✅ Working |
| Grocery | `/dashboard/grocery` | ✅ Working |
| Food Tracker | `/dashboard/food-tracker` | ✅ Working |
| AI Coach | `/dashboard/ai-coach` | ✅ Working |
| Meal Builder | `/dashboard/meal-builder` | ❌ Child selection bug (see #4) |
| Food Chaining | `/dashboard/food-chaining` | ✅ Working |
| Analytics | `/dashboard/analytics` | ✅ Working |
| Progress | `/dashboard/progress` | ✅ Working |
| Admin Panel | `/admin` | ⚠️ Unknown names (see #6) |
| Account Settings | `/dashboard/settings` | ⚠️ Security concern (see #5) |
| Accessibility | `/dashboard/accessibility-settings` | ✅ Working |

---

## Features Tested and Confirmed Working

- Sidebar navigation (all links route correctly)
- Family/Child dropdown selector (works on most pages)
- Pantry: search, category filters, sort, grid/list view, quantity +/- buttons, edit/delete icons
- Recipes: search, filters (Favorites, Ready to Cook, Quick, Kid Approved), sort, grid/list view, AI Suggest button
- Recipe detail modal: Ingredients tab, Instructions tab, star rating, I Made It / Plan / Grocery buttons, servings adjuster, Start Cook Mode
- Planner: week navigation, Add meal modal with food/recipe search, template actions
- Grocery: Add Item, From Recipe, Smart Restock buttons, empty state
- Food Tracker: child selection, Log Attempt, outcome filters, outcome breakdown
- Progress: Overview, Achievements, Weekly Report tabs, Share/Download PDF
- AI Coach: new conversation flow, suggested prompts
- Admin: user management, search, filter, Export CSV, Revenue Operations dashboard
- Account Settings: Profile, Subscription, Security, Accessibility tabs
- Accessibility Settings: toggles for High Contrast, Large Text, Font Size, Focus Indicators
