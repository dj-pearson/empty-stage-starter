import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/integrations/supabase/client.mobile';
import type { FoodCategory, MealResult, MealSlot } from '@/types';
import { colors, spacing, fontSize, borderRadius } from '../../app/mobile/lib/theme';
import { suggestCategory } from '../../app/mobile/lib/unit-suggestions';
import { sanitizeTextInput } from '../../app/mobile/lib/validation';
import { useNetworkStatus } from '../../app/mobile/hooks/useNetworkStatus';
import { announceForAccessibility } from '../../app/mobile/lib/a11y';
import {
  PlannerSearchSheet,
  type PlannerSelection,
} from '../../app/mobile/components/PlannerSearchSheet';
import {
  PlannerEntryActionSheet,
  type PlannerEntryGroup,
} from '../../app/mobile/components/PlannerEntryActionSheet';

const SLOTS: { value: MealSlot; label: string; emoji: string }[] = [
  { value: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { value: 'lunch', label: 'Lunch', emoji: '☀️' },
  { value: 'dinner', label: 'Dinner', emoji: '🌙' },
  { value: 'snack1', label: 'Snack', emoji: '🍎' },
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FAMILY_KEY = '__family__';

type DayChip = { iso: string; dayLabel: string; dateLabel: string; isToday: boolean };

interface Kid {
  id: string;
  name: string;
}

interface RawEntry {
  id: string;
  kid_id: string;
  date: string;
  meal_slot: MealSlot;
  food_id: string;
  recipe_id: string | null;
  result: MealResult;
  food_name: string;
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function buildDayStrip(centerIso: string, count = 14): DayChip[] {
  const center = new Date(`${centerIso}T00:00:00`);
  const today = todayIso();
  const start = new Date(center);
  start.setDate(center.getDate() - 3);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    return {
      iso,
      dayLabel: DAY_NAMES[d.getDay()],
      dateLabel: String(d.getDate()),
      isToday: iso === today,
    };
  });
}

function groupEntries(entries: RawEntry[], slot: MealSlot): PlannerEntryGroup[] {
  const filtered = entries.filter((e) => e.meal_slot === slot);
  const map = new Map<string, PlannerEntryGroup>();
  for (const e of filtered) {
    const sig = `${e.food_id}|${e.recipe_id ?? ''}`;
    const existing = map.get(sig);
    if (existing) {
      existing.perKid.push({ kidId: e.kid_id, entryId: e.id });
      // First non-null result wins for display.
      if (existing.result == null && e.result != null) existing.result = e.result;
    } else {
      map.set(sig, {
        signature: sig,
        foodId: e.food_id,
        foodName: e.food_name,
        recipeId: e.recipe_id,
        date: e.date,
        slot,
        result: e.result,
        perKid: [{ kidId: e.kid_id, entryId: e.id }],
      });
    }
  }
  return Array.from(map.values());
}

export default function MealsScreen() {
  const [selectedDate, setSelectedDate] = useState<string>(todayIso());
  const [audience, setAudience] = useState<string>(FAMILY_KEY);
  const [kids, setKids] = useState<Kid[]>([]);
  const [entries, setEntries] = useState<RawEntry[]>([]);
  const [weekCounts, setWeekCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const [searchSlot, setSearchSlot] = useState<MealSlot | null>(null);
  const [actionEntry, setActionEntry] = useState<PlannerEntryGroup | null>(null);
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const isOffline = !isConnected || !isInternetReachable;

  const dayStrip = useMemo(() => buildDayStrip(selectedDate, 14), [selectedDate]);

  const showFlash = useCallback((msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  }, []);

  const targetKidIds = useCallback(
    (override?: string): string[] => {
      const a = override ?? audience;
      if (a === FAMILY_KEY) return kids.map((k) => k.id);
      return [a];
    },
    [audience, kids]
  );

  const audienceLabel = useMemo(() => {
    if (audience === FAMILY_KEY) {
      if (kids.length === 0) return 'No kids yet';
      if (kids.length === 1) return kids[0].name;
      return `Family (${kids.length})`;
    }
    return kids.find((k) => k.id === audience)?.name ?? 'Family';
  }, [audience, kids]);

  const loadKids = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const { data } = await supabase
      .from('kids')
      .select('id, name')
      .eq('user_id', user.id)
      .order('name');
    const list = (data ?? []) as Kid[];
    setKids(list);
    return list;
  }, []);

  const loadEntries = useCallback(
    async (date: string, currentKids: Kid[]) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Pull a 14-day window for the day-strip badges and the selected day's entries together.
      const windowStart = dayStrip[0]?.iso ?? date;
      const windowEnd = dayStrip[dayStrip.length - 1]?.iso ?? date;

      const { data, error } = await supabase
        .from('plan_entries')
        .select('id, kid_id, date, meal_slot, food_id, recipe_id, result, foods:food_id (name)')
        .eq('user_id', user.id)
        .gte('date', windowStart)
        .lte('date', windowEnd);

      if (error) throw error;

      const kidIds = new Set(currentKids.map((k) => k.id));
      const rows = (data ?? [])
        .filter((r: { kid_id: string }) => kidIds.size === 0 || kidIds.has(r.kid_id))
        .map(
          (r: {
            id: string;
            kid_id: string;
            date: string;
            meal_slot: string;
            food_id: string;
            recipe_id: string | null;
            result: string | null;
            foods: { name: string } | null;
          }) => ({
            id: r.id,
            kid_id: r.kid_id,
            date: r.date,
            meal_slot: r.meal_slot as MealSlot,
            food_id: r.food_id,
            recipe_id: r.recipe_id,
            result: (r.result as MealResult) ?? null,
            food_name: r.foods?.name ?? 'Unknown',
          })
        ) as RawEntry[];

      const counts = new Map<string, number>();
      rows.forEach((row) => {
        // Per-day signature dedupe so "family" doesn't double-count duplicated rows.
        counts.set(row.date, (counts.get(row.date) ?? 0) + 1);
      });
      setWeekCounts(counts);
      setEntries(rows.filter((r) => r.date === date));
    },
    [dayStrip]
  );

  const refresh = useCallback(async () => {
    try {
      const list = kids.length > 0 ? kids : await loadKids();
      await loadEntries(selectedDate, list);
    } catch (err) {
      console.error('Planner refresh failed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [kids, loadKids, loadEntries, selectedDate]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime sync: update plan when other devices/household members change plan_entries.
  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | undefined;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !active) return;

      const channel = supabase
        .channel(`mobile-plan-entries-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'plan_entries',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            void refresh();
          }
        )
        .subscribe();

      cleanup = () => {
        void supabase.removeChannel(channel);
      };
    })();

    return () => {
      active = false;
      if (cleanup) cleanup();
    };
  }, [refresh]);

  const onRefresh = () => {
    setRefreshing(true);
    void refresh();
  };

  const ensureGroceryItem = useCallback(
    async (params: {
      userId: string;
      name: string;
      category: FoodCategory;
      unit?: string | null;
      addedVia: string;
    }) => {
      const lower = params.name.trim().toLowerCase();
      const { data: existing } = await supabase
        .from('grocery_items')
        .select('id')
        .eq('user_id', params.userId)
        .eq('checked', false)
        .ilike('name', lower)
        .limit(1);
      if (existing && existing.length > 0) return false;
      await supabase.from('grocery_items').insert({
        user_id: params.userId,
        name: params.name,
        quantity: 1,
        unit: params.unit ?? '',
        category: params.category,
        checked: false,
        added_via: params.addedVia,
      });
      return true;
    },
    []
  );

  const insertPlanRows = useCallback(
    async (params: {
      userId: string;
      kidIds: string[];
      foodId: string;
      recipeId: string | null;
      date: string;
      slot: MealSlot;
    }) => {
      if (params.kidIds.length === 0) {
        Alert.alert('Add a child first', 'Create a kid profile to start planning meals.');
        return false;
      }
      const rows = params.kidIds.map((kid_id) => ({
        user_id: params.userId,
        kid_id,
        date: params.date,
        meal_slot: params.slot,
        food_id: params.foodId,
        recipe_id: params.recipeId,
      }));
      const { error } = await supabase.from('plan_entries').insert(rows);
      if (error) throw error;
      return true;
    },
    []
  );

  const handlePick = useCallback(
    async (selection: PlannerSelection) => {
      if (!searchSlot) return;
      const slot = searchSlot;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const kidIds = targetKidIds();

        if (selection.kind === 'pantry') {
          const ok = await insertPlanRows({
            userId: user.id,
            kidIds,
            foodId: selection.food.id,
            recipeId: null,
            date: selectedDate,
            slot,
          });
          if (!ok) return;

          let extra = '';
          if (selection.deductFromPantry) {
            const next = Math.max(0, (selection.food.quantity ?? 0) - 1);
            await supabase.from('foods').update({ quantity: next }).eq('id', selection.food.id);
            extra = ' · pantry −1';
          }
          if (selection.addToGroceryIfShort) {
            const added = await ensureGroceryItem({
              userId: user.id,
              name: selection.food.name,
              category: selection.food.category ?? 'snack',
              unit: selection.food.unit,
              addedVia: 'planner',
            });
            if (added) extra += ' · added to grocery';
          }
          showFlash(`Planned ${selection.food.name}${extra}`);
        } else if (selection.kind === 'recipe') {
          if (selection.recipe.food_ids.length === 0) {
            Alert.alert('Recipe has no ingredients', 'Link ingredients on the web first.');
            return;
          }
          const rows = kidIds.flatMap((kid_id) =>
            selection.recipe.food_ids.map((food_id) => ({
              user_id: user.id,
              kid_id,
              date: selectedDate,
              meal_slot: slot,
              food_id,
              recipe_id: selection.recipe.id,
            }))
          );
          if (rows.length === 0) {
            Alert.alert('Add a child first', 'Create a kid profile to start planning meals.');
            return;
          }
          const { error } = await supabase.from('plan_entries').insert(rows);
          if (error) throw error;

          let groceryAdded = 0;
          if (selection.addMissingToGrocery) {
            const { data: foodRows } = await supabase
              .from('foods')
              .select('id, name, category, unit, quantity')
              .in('id', selection.recipe.food_ids);
            const missing = (foodRows ?? []).filter(
              (f: { quantity: number | null }) => (f.quantity ?? 0) <= 0
            );
            for (const f of missing as {
              id: string;
              name: string;
              category: FoodCategory | null;
              unit: string | null;
            }[]) {
              const added = await ensureGroceryItem({
                userId: user.id,
                name: f.name,
                category: f.category ?? 'snack',
                unit: f.unit,
                addedVia: 'recipe',
              });
              if (added) groceryAdded++;
            }
          }
          const tail = groceryAdded > 0 ? ` · ${groceryAdded} added to grocery` : '';
          showFlash(`Planned recipe "${selection.recipe.name}"${tail}`);
        } else {
          // Brand-new item the user typed in. Create a pantry food at qty 0,
          // schedule it, and (optionally) add to grocery.
          const cleanName = sanitizeTextInput(selection.name, 80);
          const { data: foodIns, error: foodErr } = await supabase
            .from('foods')
            .insert({
              user_id: user.id,
              name: cleanName,
              quantity: 0,
              unit: '',
              category: selection.category,
              is_safe: true,
              is_try_bite: false,
            })
            .select('id')
            .single();
          if (foodErr || !foodIns) throw foodErr ?? new Error('food insert failed');

          const ok = await insertPlanRows({
            userId: user.id,
            kidIds,
            foodId: foodIns.id,
            recipeId: null,
            date: selectedDate,
            slot,
          });
          if (!ok) return;

          let extra = '';
          if (selection.addToGrocery) {
            const added = await ensureGroceryItem({
              userId: user.id,
              name: cleanName,
              category: selection.category,
              addedVia: 'planner',
            });
            if (added) extra = ' · added to grocery';
          }
          showFlash(`Planned ${cleanName}${extra}`);
        }

        setSearchSlot(null);
        await refresh();
      } catch (err) {
        console.error('Plan add failed:', err);
        Alert.alert('Could not add to plan', 'Please try again.');
      }
    },
    [searchSlot, selectedDate, targetKidIds, insertPlanRows, ensureGroceryItem, showFlash, refresh]
  );

  const ids = (entry: PlannerEntryGroup) => entry.perKid.map((p) => p.entryId);

  const moveSlot = async (entry: PlannerEntryGroup, newSlot: MealSlot) => {
    await supabase.from('plan_entries').update({ meal_slot: newSlot }).in('id', ids(entry));
    showFlash(`Moved to ${SLOTS.find((s) => s.value === newSlot)?.label ?? newSlot}`);
    await refresh();
  };

  const moveDate = async (entry: PlannerEntryGroup, newDate: string) => {
    await supabase.from('plan_entries').update({ date: newDate }).in('id', ids(entry));
    showFlash(`Moved to ${newDate}`);
    setSelectedDate(newDate);
    await refresh();
  };

  const duplicateNextDay = async (entry: PlannerEntryGroup) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const next = new Date(`${entry.date}T00:00:00`);
    next.setDate(next.getDate() + 1);
    const nextIso = next.toISOString().split('T')[0];
    const rows = entry.perKid.map((p) => ({
      user_id: user.id,
      kid_id: p.kidId,
      date: nextIso,
      meal_slot: entry.slot,
      food_id: entry.foodId,
      recipe_id: entry.recipeId,
    }));
    await supabase.from('plan_entries').insert(rows);
    showFlash(`Copied to ${nextIso}`);
    await refresh();
  };

  const markResult = async (entry: PlannerEntryGroup, result: MealResult) => {
    await supabase.from('plan_entries').update({ result }).in('id', ids(entry));
    await refresh();
  };

  const addEntryToGrocery = async (entry: PlannerEntryGroup) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    let foodIds: string[] = [];
    if (entry.recipeId) {
      const { data: recipe } = await supabase
        .from('recipes')
        .select('food_ids')
        .eq('id', entry.recipeId)
        .single();
      foodIds = ((recipe?.food_ids as string[] | null) ?? []).filter(Boolean);
      if (foodIds.length === 0) foodIds = [entry.foodId];
    } else {
      foodIds = [entry.foodId];
    }
    const { data: foods } = await supabase
      .from('foods')
      .select('id, name, category, unit, quantity')
      .in('id', foodIds);
    let added = 0;
    for (const f of (foods ?? []) as {
      name: string;
      category: FoodCategory | null;
      unit: string | null;
      quantity: number | null;
    }[]) {
      if ((f.quantity ?? 0) > 0) continue;
      const ok = await ensureGroceryItem({
        userId: user.id,
        name: f.name,
        category: f.category ?? suggestCategory(f.name) ?? 'snack',
        unit: f.unit,
        addedVia: entry.recipeId ? 'recipe' : 'planner',
      });
      if (ok) added++;
    }
    showFlash(added > 0 ? `Added ${added} to grocery` : 'Already on grocery list');
  };

  const deleteEntry = async (entry: PlannerEntryGroup) => {
    await supabase.from('plan_entries').delete().in('id', ids(entry));
    showFlash('Removed from plan');
    await refresh();
  };

  const confirmDeleteEntry = useCallback(
    (entry: PlannerEntryGroup) => {
      Alert.alert(
        'Remove from plan?',
        `Remove "${entry.foodName}" from ${SLOTS.find((s) => s.value === entry.slot)?.label ?? entry.slot}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => void deleteEntry(entry) },
        ]
      );
    },
    // deleteEntry depends on supabase + refresh; both stable via closure.
    [refresh]
  );

  if (loading) {
    announceForAccessibility('Loading meal plan');
    return (
      <SafeAreaView
        style={styles.container}
        edges={['top']}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Loading" />
        </View>
      </SafeAreaView>
    );
  }

  const totalToday = entries.length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenTitle}>Plan</Text>
          <Text style={styles.headerSub}>
            {audienceLabel}
            {totalToday > 0 ? ` · ${totalToday} planned` : ''}
          </Text>
        </View>
        {selectedDate !== todayIso() && (
          <TouchableOpacity
            style={styles.todayBtn}
            onPress={() => setSelectedDate(todayIso())}
            accessibilityLabel="Jump to today"
          >
            <Text style={styles.todayBtnText}>Today</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Audience selector */}
      {kids.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.audienceRow}
        >
          <AudienceChip
            label={kids.length > 1 ? `👨‍👩‍👧 Family (${kids.length})` : `👤 ${kids[0].name}`}
            active={audience === FAMILY_KEY}
            onPress={() => setAudience(FAMILY_KEY)}
          />
          {kids.length > 1 &&
            kids.map((k) => (
              <AudienceChip
                key={k.id}
                label={k.name}
                active={audience === k.id}
                onPress={() => setAudience(k.id)}
              />
            ))}
        </ScrollView>
      )}

      {/* Day strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dayStrip}
      >
        {dayStrip.map((d) => {
          const active = d.iso === selectedDate;
          const planned = (weekCounts.get(d.iso) ?? 0) > 0;
          return (
            <TouchableOpacity
              key={d.iso}
              style={[
                styles.dayChip,
                active && styles.dayChipActive,
                d.isToday && !active && styles.dayChipToday,
              ]}
              onPress={() => setSelectedDate(d.iso)}
              accessibilityLabel={`Select ${d.dayLabel} ${d.dateLabel}`}
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.dayChipDay, active && styles.dayChipDayActive]}>
                {d.isToday ? 'Today' : d.dayLabel}
              </Text>
              <Text style={[styles.dayChipDate, active && styles.dayChipDateActive]}>
                {d.dateLabel}
              </Text>
              <View
                style={[
                  styles.plannedDot,
                  planned && styles.plannedDotOn,
                  active && planned && styles.plannedDotActive,
                ]}
              />
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {isOffline && (
        <View
          style={styles.offlineBanner}
          accessibilityRole="alert"
          accessibilityLabel="Offline. Changes will sync when you reconnect."
        >
          <Text style={styles.offlineBannerText}>
            ⚡️ Offline — changes will sync when you reconnect
          </Text>
        </View>
      )}

      {flash && (
        <View style={styles.flash}>
          <Text style={styles.flashText}>{flash}</Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {kids.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👶</Text>
            <Text style={styles.emptyTitle}>Add a child first</Text>
            <Text style={styles.emptyText}>
              Create a kid profile to start planning meals for the family.
            </Text>
          </View>
        ) : (
          SLOTS.map((slot) => {
            const groups = groupEntries(entries, slot.value);
            return (
              <View key={slot.value} style={styles.slotCard}>
                <View style={styles.slotHeader}>
                  <Text style={styles.slotEmoji}>{slot.emoji}</Text>
                  <Text style={styles.slotTitle}>{slot.label}</Text>
                  <Text style={styles.slotCount}>
                    {groups.length === 0
                      ? 'Empty'
                      : `${groups.length} item${groups.length === 1 ? '' : 's'}`}
                  </Text>
                  <TouchableOpacity
                    style={styles.addPill}
                    onPress={() => setSearchSlot(slot.value)}
                    accessibilityLabel={`Add to ${slot.label}`}
                  >
                    <Text style={styles.addPillText}>＋ Add</Text>
                  </TouchableOpacity>
                </View>

                {groups.length === 0 ? (
                  <TouchableOpacity
                    style={styles.emptySlot}
                    onPress={() => setSearchSlot(slot.value)}
                    accessibilityLabel={`Add ${slot.label}`}
                  >
                    <Text style={styles.emptySlotText}>Tap to add a meal</Text>
                  </TouchableOpacity>
                ) : (
                  groups.map((g) => (
                    <TouchableOpacity
                      key={g.signature}
                      style={[styles.entryRow, g.result && styles[`row_${g.result}`]]}
                      onPress={() => setActionEntry(g)}
                      onLongPress={() => confirmDeleteEntry(g)}
                      delayLongPress={400}
                      accessibilityLabel={`${g.foodName}. Tap for actions, long-press to remove.`}
                      accessibilityHint="Open actions: move, duplicate, mark result, remove"
                    >
                      <View style={styles.entryBody}>
                        <Text style={styles.entryName} numberOfLines={1}>
                          {g.recipeId ? '🍳 ' : ''}
                          {g.foodName}
                        </Text>
                        <Text style={styles.entryMeta} numberOfLines={1}>
                          {g.perKid.length === 1
                            ? (kids.find((k) => k.id === g.perKid[0].kidId)?.name ?? '—')
                            : `${g.perKid.length} kids`}
                          {g.result === 'ate' && ' · ate it'}
                          {g.result === 'tasted' && ' · tasted'}
                          {g.result === 'refused' && ' · refused'}
                        </Text>
                      </View>
                      <Text style={styles.entryChevron}>›</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <PlannerSearchSheet
        visible={!!searchSlot}
        slot={searchSlot}
        slotLabel={SLOTS.find((s) => s.value === searchSlot)?.label ?? ''}
        date={selectedDate}
        audienceLabel={audienceLabel}
        onClose={() => setSearchSlot(null)}
        onPick={handlePick}
      />

      <PlannerEntryActionSheet
        visible={!!actionEntry}
        entry={actionEntry}
        audienceLabel={audienceLabel}
        onClose={() => setActionEntry(null)}
        onMoveSlot={moveSlot}
        onMoveDate={moveDate}
        onDuplicateNextDay={duplicateNextDay}
        onMarkResult={markResult}
        onAddToGrocery={addEntryToGrocery}
        onDelete={deleteEntry}
      />
    </SafeAreaView>
  );
}

function AudienceChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.audienceChip, active && styles.audienceChipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.audienceChipText, active && styles.audienceChipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  screenTitle: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text },
  headerSub: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  todayBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    minHeight: 36,
    justifyContent: 'center',
  },
  todayBtnText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '700' },
  audienceRow: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
    flexDirection: 'row',
  },
  audienceChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    minHeight: 36,
    justifyContent: 'center',
  },
  audienceChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  audienceChipText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  audienceChipTextActive: { color: colors.background },
  dayStrip: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.xs,
    flexDirection: 'row',
  },
  dayChip: {
    width: 56,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    minHeight: 64,
    justifyContent: 'center',
  },
  dayChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipToday: { borderColor: colors.primary, borderWidth: 2 },
  dayChipDay: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  dayChipDayActive: { color: colors.background },
  dayChipDate: { fontSize: fontSize.lg, color: colors.text, fontWeight: '700', marginTop: 2 },
  dayChipDateActive: { color: colors.background },
  plannedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'transparent',
    marginTop: 4,
  },
  plannedDotOn: { backgroundColor: colors.primary },
  plannedDotActive: { backgroundColor: colors.background },
  flash: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  flashText: { fontSize: fontSize.sm, color: colors.primaryDark, fontWeight: '600' },
  offlineBanner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  offlineBannerText: { fontSize: fontSize.sm, color: '#78350f', fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },
  slotCard: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  slotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  slotEmoji: { fontSize: fontSize.lg },
  slotTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  slotCount: { fontSize: fontSize.xs, color: colors.textSecondary, flex: 1 },
  addPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    minHeight: 36,
    justifyContent: 'center',
  },
  addPillText: { fontSize: fontSize.xs, color: colors.background, fontWeight: '700' },
  emptySlot: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    minHeight: 48,
    justifyContent: 'center',
  },
  emptySlotText: { fontSize: fontSize.sm, color: colors.textSecondary, fontStyle: 'italic' },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    minHeight: 56,
    gap: spacing.sm,
  },
  row_ate: { backgroundColor: '#ecfdf5' },
  row_tasted: { backgroundColor: '#fffbeb' },
  row_refused: { backgroundColor: '#fef2f2' },
  entryBody: { flex: 1 },
  entryName: { fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
  entryMeta: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  entryChevron: {
    fontSize: fontSize.xl,
    color: colors.textSecondary,
    paddingHorizontal: spacing.sm,
  },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    textAlign: 'center',
  },
});
