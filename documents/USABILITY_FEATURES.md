# Usability Enhancements Documentation

This document describes the comprehensive usability improvements added to enhance the platform's ease of use for all users, with special attention to mobile users and parents.

## Table of Contents
1. [Empty States](#empty-states)
2. [Keyboard Shortcuts & Command Palette](#keyboard-shortcuts--command-palette)
3. [Contextual Help System](#contextual-help-system)
4. [Undo/Redo Functionality](#undoredo-functionality)
5. [Auto-Save & Draft Recovery](#auto-save--draft-recovery)
6. [Gesture Tutorial](#gesture-tutorial)
7. [Quick Actions Menu](#quick-actions-menu)
8. [Smart Defaults](#smart-defaults)

---

## Empty States

**Location:** `src/components/EmptyState.tsx`

Empty states provide guidance when users encounter empty sections, making the platform more welcoming for new users.

### Features
- **Generic EmptyState component** for custom scenarios
- **Pre-built variants** for common scenarios:
  - `EmptyRecipes` - When recipe library is empty
  - `EmptyPantry` - When pantry has no items
  - `EmptyGroceryList` - When no grocery lists exist
  - `EmptyMealPlan` - When meal planner is empty
  - `EmptyChildren` - When no child profiles exist
  - `EmptySearchResults` - When search returns no results

### Usage Example
```tsx
import { EmptyPantry } from "@/components/EmptyState";

function PantryPage() {
  if (items.length === 0) {
    return <EmptyPantry onAddFood={() => setShowAddDialog(true)} />;
  }
  // ... rest of component
}
```

### Benefits
- Reduces confusion for new users
- Provides clear calls-to-action
- Improves onboarding experience
- Guides users toward first actions

---

## Keyboard Shortcuts & Command Palette

**Location:**
- Hook: `src/hooks/useKeyboardShortcuts.ts`
- Component: `src/components/CommandPalette.tsx`

A powerful command palette (like Spotlight or VS Code) for quick navigation and actions.

### Key Shortcuts
- **`Cmd/Ctrl + K`** - Open command palette
- **`?`** - Show keyboard shortcuts overlay
- **`Esc`** - Close dialogs/palette

### Features
- **Fast Navigation** - Jump to any page instantly
- **Quick Actions** - Execute common tasks
- **Fuzzy Search** - Find commands with keywords
- **Theme Switching** - Quick theme toggle
- **Keyboard First** - Designed for power users

### Command Groups
1. **Navigation** - Go to Home, Kids, Pantry, Recipes, etc.
2. **Actions** - Add child, recipe, grocery list, etc.
3. **Settings** - Theme switching, account settings
4. **Help** - FAQ, support, documentation

### Usage Example
```tsx
import { CommandPalette } from "@/components/CommandPalette";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

function App() {
  // Add custom shortcuts
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: "n",
        metaKey: true,
        description: "New recipe",
        action: () => navigate("/recipes/new"),
      },
    ],
  });

  return (
    <>
      <CommandPalette />
      {/* rest of app */}
    </>
  );
}
```

### Benefits
- **Speed** - Navigate without mouse
- **Accessibility** - Keyboard-first design
- **Discoverability** - All features in one place
- **Productivity** - Save time with shortcuts

---

## Contextual Help System

**Location:** `src/components/ContextualHelp.tsx`

Inline help and tooltips reduce the learning curve and provide just-in-time guidance.

### Components

#### 1. ContextualHelp
Tooltip-based help for buttons and controls.

```tsx
<ContextualHelp
  type="info"
  title="Safe Foods"
  content="These are foods your child has eaten before without issues."
  side="right"
/>
```

#### 2. InlineHelp
Help text for form fields.

```tsx
<InlineHelp>
  Enter your child's birth date to calculate age-appropriate portions.
</InlineHelp>
```

#### 3. HelpSection
Expandable help sections for detailed guidance.

```tsx
<HelpSection title="How does meal planning work?" defaultOpen>
  <p>Our meal planner helps you schedule meals for the week...</p>
</HelpSection>
```

#### 4. FeatureHint
Highlight new features with dismissible hints.

```tsx
<FeatureHint
  hint="Try our new AI-powered meal suggestions!"
  storageKey="ai-meal-hint"
  persistent
>
  <Button>AI Planner</Button>
</FeatureHint>
```

#### 5. ShortcutHint
Display keyboard shortcuts in UI.

```tsx
<ShortcutHint shortcut="Cmd+K" description="Open command palette" />
```

### Benefits
- **Reduced Learning Curve** - Users get help when needed
- **Less Support Requests** - Self-service guidance
- **Better UX** - Contextual, not overwhelming
- **Feature Discovery** - Highlight new capabilities

---

## Undo/Redo Functionality

**Location:** `src/hooks/useUndoRedo.ts`

Allows users to reverse actions, reducing anxiety about mistakes.

### Features
- **Full State History** - Track up to 50 state changes
- **Undo/Redo** - Navigate through history
- **Deleted Items Recovery** - Restore recently deleted items
- **Smart Comparison** - Only tracks actual changes

### Usage Example

#### Basic Undo/Redo
```tsx
import { useUndoRedo } from "@/hooks/useUndoRedo";

function RecipeEditor() {
  const {
    state: recipe,
    set: setRecipe,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useUndoRedo(initialRecipe);

  return (
    <>
      <Button onClick={undo} disabled={!canUndo}>Undo</Button>
      <Button onClick={redo} disabled={!canRedo}>Redo</Button>
      {/* editor UI */}
    </>
  );
}
```

#### Deleted Items Recovery
```tsx
import { useDeletedItems } from "@/hooks/useUndoRedo";

function RecipeList() {
  const { deletedItems, addDeleted, restore } = useDeletedItems();

  const handleDelete = (recipe) => {
    addDeleted(recipe, "recipe");
    // perform deletion
  };

  return (
    <>
      {deletedItems.length > 0 && (
        <div>
          <Button onClick={() => restore(0)}>
            Restore "{deletedItems[0].item.name}"
          </Button>
        </div>
      )}
    </>
  );
}
```

### Benefits
- **Mistake Recovery** - Users can easily fix errors
- **Confidence** - Less fear of permanent changes
- **Experimentation** - Encourages trying features
- **Better UX** - Industry-standard functionality

---

## Auto-Save & Draft Recovery

**Location:** `src/hooks/useAutoSave.ts`

Automatically saves form progress and recovers unsaved work.

### Features
- **Auto-Save** - Saves every 2 seconds (configurable)
- **Draft Recovery** - Restore unsaved work on return
- **Save Indicator** - Visual feedback on save status
- **Error Handling** - Graceful failure with retry
- **LocalStorage + Custom** - Save locally and/or to server

### Usage Example

```tsx
import { useAutoSave, AutoSaveIndicator, DraftRecovery } from "@/hooks/useAutoSave";

function RecipeForm() {
  const [recipe, setRecipe] = useState(initialRecipe);

  const {
    isSaving,
    lastSaved,
    saveError,
    loadDraft,
    clearDraft,
    getDraftInfo,
  } = useAutoSave({
    key: "recipe-form",
    data: recipe,
    onSave: async (data) => {
      // Optional: save to server
      await api.saveRecipe(data);
    },
    delay: 2000,
  });

  useEffect(() => {
    // Check for draft on mount
    const draftInfo = getDraftInfo();
    if (draftInfo?.exists) {
      setShowDraftRecovery(true);
    }
  }, []);

  return (
    <>
      {showDraftRecovery && (
        <DraftRecovery
          draftTimestamp={getDraftInfo()!.timestamp}
          onRecover={() => {
            const draft = loadDraft();
            if (draft) setRecipe(draft);
          }}
          onDiscard={clearDraft}
        />
      )}

      <AutoSaveIndicator
        isSaving={isSaving}
        lastSaved={lastSaved}
        error={saveError}
      />

      {/* form fields */}
    </>
  );
}
```

### Benefits
- **No Lost Work** - Never lose progress
- **Peace of Mind** - Automatic protection
- **Better UX** - No manual saving needed
- **Error Recovery** - Survive crashes/closes

---

## Gesture Tutorial

**Location:** `src/components/GestureTutorial.tsx`

Interactive tutorial teaching mobile users how to use swipe gestures.

### Features
- **Auto-Show** - Appears on first mobile visit
- **3-Step Tutorial** - Swipe back, pull-to-refresh, tab switching
- **Animated Demos** - Visual gesture demonstrations
- **Skip/Resume** - User controls pacing
- **Persistent** - Won't show again after completion
- **Reopen Button** - Access tutorial anytime

### Tutorial Steps
1. **Swipe to Navigate Back** - Right swipe from edge
2. **Pull to Refresh** - Pull down on lists
3. **Swipe Between Tabs** - Left/right for sections

### Usage
```tsx
import { GestureTutorial } from "@/components/GestureTutorial";

function App() {
  return (
    <>
      <GestureTutorial />
      {/* rest of app */}
    </>
  );
}
```

### Benefits
- **Feature Discovery** - Users learn gestures
- **Mobile UX** - Optimized for touch
- **Reduced Confusion** - Clear instructions
- **Better Adoption** - Higher gesture usage

---

## Quick Actions Menu

**Location:** `src/components/QuickActionsMenu.tsx`

Floating action button (FAB) for quick access to common tasks.

### Features
- **Floating Button** - Always accessible
- **6 Quick Actions**:
  - Add Child
  - Add Recipe
  - Create Grocery List
  - Plan Meal
  - Add to Pantry
  - AI Planner
- **Animated Expansion** - Smooth transitions
- **Haptic Feedback** - Touch feedback on mobile
- **Backdrop Blur** - Focus on actions
- **Color-Coded** - Visual differentiation

### Companion: Keyboard Shortcuts Overlay
Shows all available keyboard shortcuts in a dialog.

### Usage
```tsx
import { QuickActionsMenu, KeyboardShortcutsOverlay } from "@/components/QuickActionsMenu";

function Layout() {
  return (
    <>
      <QuickActionsMenu />
      <KeyboardShortcutsOverlay />
      {/* page content */}
    </>
  );
}
```

### Benefits
- **Fast Access** - Common tasks one tap away
- **Discoverability** - Features are visible
- **Mobile Friendly** - Large touch targets
- **Desktop Support** - Keyboard overlay too

---

## Smart Defaults

**Location:** `src/hooks/useSmartDefaults.ts`

System learns from user behavior to suggest intelligent defaults.

### Hooks Available

#### 1. useSmartDefaults
Learns and suggests most recent values.

```tsx
const { smartDefault, updateDefault } = useSmartDefaults({
  storageKey: "preferred-portion-size",
  defaultValue: "medium",
  ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
});
```

#### 2. useFrequencyTracker
Tracks most frequently selected items.

```tsx
const { track, getMostFrequent } = useFrequencyTracker("meal-categories");

// When user selects something
track("lunch");

// Get top 5 most frequent
const topCategories = getMostFrequent(5);
```

#### 3. useContextAwareDefaults
Pre-fills based on URL params and navigation state.

```tsx
const { getDefault } = useContextAwareDefaults();

// If navigated from /kids/john
const childId = getDefault("childId");
```

#### 4. useRecentEntries
Shows recently entered values for quick selection.

```tsx
const { recentEntries, addEntry } = useRecentEntries("allergies", 10);

// Display recent entries as quick picks
{recentEntries.map(entry => (
  <Button onClick={() => selectAllergy(entry)}>{entry}</Button>
))}
```

#### 5. usePreferenceLearning
Learns user preferences over time.

```tsx
const { learnPreference, getPreference } = usePreferenceLearning("meal-prefs");

// Learn that user prefers vegetarian
learnPreference("diet", "vegetarian");

// Later, use as default
const dietPreference = getPreference("diet", "omnivore");
```

#### 6. useTimeBasedDefaults
Suggests defaults based on time of day.

```tsx
const { getMealSuggestion, getTimeOfDay } = useTimeBasedDefaults();

// At 7 AM: returns "breakfast"
const suggestedMeal = getMealSuggestion();
```

### Benefits
- **Less Typing** - Smart pre-fill reduces input
- **Faster Forms** - Common choices ready
- **Personalized** - Learns individual preferences
- **Context-Aware** - Understands user's workflow
- **Time-Saving** - Reduces repetitive input

---

## Integration Guide

### Adding to Main App

1. **Add to App.tsx or Layout:**
```tsx
import { CommandPalette } from "@/components/CommandPalette";
import { GestureTutorial } from "@/components/GestureTutorial";
import { QuickActionsMenu } from "@/components/QuickActionsMenu";

function App() {
  return (
    <>
      <CommandPalette />
      <GestureTutorial />
      <QuickActionsMenu />
      {/* existing app content */}
    </>
  );
}
```

2. **Add Empty States to Pages:**
```tsx
function RecipesPage() {
  if (recipes.length === 0) {
    return <EmptyRecipes onAddRecipe={() => setShowDialog(true)} />;
  }
  return <RecipeList recipes={recipes} />;
}
```

3. **Add Contextual Help:**
```tsx
<Label>
  Allergens
  <ContextualHelp
    content="Select all foods your child is allergic to."
    type="info"
  />
</Label>
```

4. **Add Auto-Save to Forms:**
```tsx
const autoSave = useAutoSave({
  key: "recipe-form",
  data: formData,
});

return (
  <>
    <AutoSaveIndicator {...autoSave} />
    {/* form */}
  </>
);
```

---

## Testing Checklist

### Desktop
- [ ] Command palette opens with Cmd/Ctrl+K
- [ ] Keyboard shortcuts work
- [ ] Empty states show appropriate actions
- [ ] Auto-save indicator appears
- [ ] Contextual help tooltips display

### Mobile
- [ ] Gesture tutorial shows on first visit
- [ ] Quick actions menu expands/collapses
- [ ] Swipe gestures work alongside tutorial
- [ ] Pull-to-refresh triggers tutorial hint
- [ ] Empty states are touch-friendly

### Both
- [ ] Undo/redo works correctly
- [ ] Draft recovery offers to restore work
- [ ] Smart defaults learn from usage
- [ ] Help tooltips are clear and helpful

---

## Browser Support

All features support:
- **Chrome/Edge** 90+
- **Firefox** 88+
- **Safari** 14+
- **Mobile Safari** 14+
- **Chrome Mobile** 90+

### Graceful Degradation
- Haptics fail silently on unsupported devices
- LocalStorage features work in all modern browsers
- CSS animations respect `prefers-reduced-motion`

---

## Performance Considerations

- **Auto-save debounced** - Prevents excessive saves
- **LocalStorage limits** - 5-10MB typical, cleaned up after TTL
- **Lazy animations** - Gesture tutorial only on mobile
- **Smart bundling** - Command palette code-split friendly

---

## Accessibility

All features are WCAG 2.1 AA compliant:
- **Keyboard Navigation** - Full keyboard access
- **Screen Readers** - Proper ARIA labels
- **Reduced Motion** - Respects user preferences
- **Color Contrast** - Meets AA standards
- **Focus Management** - Clear focus indicators

---

## Future Enhancements

Potential additions:
1. **Voice Input** - Speech-to-text for forms
2. **Multi-language** - i18n support
3. **Offline Mode** - Service worker integration
4. **Drag & Drop** - Reordering lists
5. **Advanced Search** - Full-text search
6. **Tour Mode** - Guided product tour
7. **Notification Center** - Unified notifications
8. **Collaborative Features** - Family sharing

---

## Support

For issues or suggestions:
- Open a GitHub issue
- Contact support via in-app widget
- Check FAQ for common questions

---

**Last Updated:** 2025-11-05
**Version:** 1.0.0
