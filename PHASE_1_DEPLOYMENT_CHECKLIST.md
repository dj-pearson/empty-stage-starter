# Phase 1 Deployment Checklist
## Before Moving to Phase 2

**Date:** October 13, 2025  
**Status:** Ready for Deployment

---

## ✅ Pre-Deployment Checklist

### 1. Database Migration
- [x] Migration file created: `20251014000000_grocery_recipe_phase1.sql`
- [x] Fixed `user_profiles` → `profiles` reference
- [ ] **ACTION REQUIRED:** Run migration
  ```bash
  supabase db push
  # or
  supabase migration up
  ```
- [ ] **ACTION REQUIRED:** Verify tables created
  ```sql
  -- Check new tables exist
  SELECT table_name FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name IN (
    'recipe_ingredients',
    'recipe_collections', 
    'grocery_lists',
    'shopping_sessions',
    'store_layouts'
  );
  ```

### 2. TypeScript Types
- [x] Updated `src/types/index.ts` with new fields
- [x] Added `GroceryList` interface
- [x] Added `RecipeIngredient` interface
- [x] Added `RecipeCollection` interface
- [x] Added `ShoppingSession` interface
- [x] Extended `Recipe` with Phase 1 fields
- [x] Extended `GroceryItem` with Phase 1 fields

### 3. Components Created
- [x] `src/components/SmartRestockSuggestions.tsx`
- [x] Integrated into `src/pages/Grocery.tsx`
- [x] Updated `src/pages/Recipes.tsx` with grocery list integration
- [x] Added real-time sync to `src/contexts/AppContext.tsx`

### 4. Supabase Configuration
- [ ] **ACTION REQUIRED:** Enable Realtime in Supabase Dashboard
  1. Go to Database → Replication
  2. Enable replication for `grocery_items` table
  3. Verify replication is active
- [ ] **ACTION REQUIRED:** Check RLS policies
  ```sql
  -- Verify policies exist
  SELECT schemaname, tablename, policyname 
  FROM pg_policies 
  WHERE tablename IN ('grocery_lists', 'recipe_ingredients', 'shopping_sessions');
  ```

---

## 🧪 Testing Requirements

### Smart Restock Suggestions
- [ ] Navigate to Grocery page (logged in)
- [ ] Verify component loads without errors
- [ ] Check suggestions appear (if meal plan exists)
- [ ] Click "Add All" button → Items added to list
- [ ] Click individual item add → Item added
- [ ] Dismiss button works

### Recipe → Grocery List
- [ ] Navigate to Recipes page
- [ ] Find recipe with ingredients
- [ ] Click "Add to Grocery List" button
- [ ] Verify toast notification appears
- [ ] Navigate to Grocery page
- [ ] Confirm ingredients were added

### Real-Time Sync (Multi-User Test)
- [ ] Open app in 2 browsers (same household)
- [ ] Browser A: Add grocery item
- [ ] Browser B: See item appear (<2 seconds)
- [ ] Browser B: Check off item
- [ ] Browser A: See checkmark update
- [ ] Browser A: Delete item
- [ ] Browser B: See item disappear

### Database Integrity
- [ ] Create grocery item → Check `grocery_list_id` populated
- [ ] Verify default grocery list created for existing users
- [ ] Check RLS prevents cross-household access

---

## 🚨 Common Issues & Fixes

### Issue: Real-time not working
**Fix:** Enable replication in Supabase Dashboard
```bash
# Check if realtime is enabled
supabase realtime
```

### Issue: Smart Restock shows no suggestions
**Expected:** Only shows if:
1. User is logged in
2. Has meal plan entries
3. Has foods in pantry
4. Some foods are low/out of stock

### Issue: Recipe button disabled
**Expected:** Button disabled if `recipe.food_ids` is empty

### Issue: TypeScript errors
**Fix:** Restart TypeScript server
```bash
# In VS Code: Cmd/Ctrl + Shift + P
# "TypeScript: Restart TS Server"
```

---

## 📊 Performance Verification

### Database Queries
- [ ] Check query performance
  ```sql
  -- Should return quickly (<100ms)
  SELECT * FROM grocery_items WHERE household_id = 'your-household-id';
  SELECT * FROM recipes WHERE user_id = 'your-user-id';
  ```

### Real-Time Latency
- [ ] Measure sync delay (should be <500ms)
- [ ] Test with 5+ concurrent users
- [ ] Monitor Supabase dashboard for errors

### Frontend Performance
- [ ] Lighthouse score (should be >90)
- [ ] Check bundle size didn't increase significantly
- [ ] Verify no memory leaks (long session test)

---

## 🔒 Security Verification

### RLS Policies
- [ ] Test cross-household isolation
  ```sql
  -- As User A (household 1)
  INSERT INTO grocery_items (...) VALUES (...);
  
  -- As User B (household 2) - should NOT see User A's items
  SELECT * FROM grocery_items;
  ```

### Data Validation
- [ ] Try invalid data (should be rejected)
  ```typescript
  // Should fail - invalid added_via
  addGroceryItem({ ..., added_via: 'invalid' });
  
  // Should fail - rating out of range
  updateRecipe({ ..., rating: 10 });
  ```

---

## 📝 Documentation

- [x] Main enhancement plan: `GROCERY_RECIPE_ENHANCEMENT_PLAN.md`
- [x] Quick start guide: `GROCERY_RECIPE_QUICK_START.md`
- [x] Competitive analysis: `COMPETITIVE_FEATURE_COMPARISON.md`
- [x] Implementation summary: `IMPLEMENTATION_SUMMARY_GROCERY_RECIPE.md`
- [x] This checklist: `PHASE_1_DEPLOYMENT_CHECKLIST.md`

---

## 🚀 Deployment Steps

### 1. Deploy Database
```bash
# From project root
cd supabase
supabase db push

# Verify migration succeeded
supabase migration list
```

### 2. Enable Realtime
- Supabase Dashboard → Database → Replication
- Toggle on for `grocery_items`
- Save changes

### 3. Deploy Frontend
```bash
# Build production bundle
npm run build

# Deploy to hosting (Cloudflare/Vercel/etc.)
# Example for Cloudflare:
npm run deploy
```

### 4. Verify Production
- [ ] Visit production URL
- [ ] Test all 3 features
- [ ] Check browser console for errors
- [ ] Monitor Supabase logs

---

## ✅ Phase 1 Complete When:

- [x] All code written and reviewed
- [ ] Migration successfully applied
- [ ] Realtime enabled in Supabase
- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] Frontend deployed
- [ ] Feature validation complete

---

## 🎯 Ready for Phase 2?

**YES, if:**
- ✅ All checklist items completed
- ✅ Features work in production
- ✅ No critical bugs found
- ✅ User feedback is positive (if beta testing)

**Phase 2 Priority Features:**
1. Enhanced Recipe Cards (visual improvements)
2. Multiple Grocery Lists UI
3. Recipe Collections/Folders
4. Store Layout Manager

---

## 📞 Support & Troubleshooting

**If issues arise:**
1. Check browser console for errors
2. Check Supabase logs
3. Verify RLS policies
4. Test with fresh user account
5. Review this checklist

**Common Error Messages:**
- "relation does not exist" → Migration not run
- "permission denied" → RLS policy issue
- "real-time not working" → Replication not enabled
- "Type error" → TypeScript types not updated

---

**Status:** Phase 1 code complete, ready for deployment testing! 🎉  
**Next:** Run deployment steps above, then proceed to Phase 2.

