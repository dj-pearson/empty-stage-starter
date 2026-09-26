import SwiftUI
import Combine

struct DashboardHomeView: View {
    @EnvironmentObject var appState: AppState
    @State private var showingScanner = false
    @State private var showingAddFood = false
    // US-418: the "New Recipe" quick action was a no-op; present the editor.
    @State private var showingAddRecipe = false
    @State private var scannedBarcode: ScannedBarcodeItem?
    /// US-230: opens the pantry tab pre-filtered to expiring foods.
    @State private var showingExpiringSheet = false
    /// US-461: app-wide cross-entity search surface.
    @State private var showingGlobalSearch = false
    /// "Today" for every card below. Held in state and moved on at midnight
    /// (and on return to the foreground), so a dashboard left open overnight
    /// stops showing yesterday's meals under yesterday's date.
    @State private var today = Date()
    @Environment(\.scenePhase) private var scenePhase
    /// Kids whose quiz nudge the parent dismissed with "Not now".
    @AppStorage("dashboard.quizNudgeDismissedKidIds") private var dismissedQuizKidIdsRaw = ""

    /// US-240: the kid with neither a saved pickinessLevel nor strategies
    /// who should see the quiz nudge: the selected kid first, so the card is
    /// about the child on screen, then any other. Kids the parent said
    /// "Not now" for are skipped, so the card can't nag forever.
    private var kidNeedingQuiz: Kid? {
        let dismissed = Set(dismissedQuizKidIdsRaw.split(separator: ",").map(String.init))
        let candidates = appState.kids.filter { kid in
            let noPickiness = (kid.pickinessLevel ?? "").isEmpty
            let noStrategies = (kid.helpfulStrategies ?? []).isEmpty
            return noPickiness && noStrategies && !dismissed.contains(kid.id)
        }
        return candidates.first { $0.id == appState.activeKidId } ?? candidates.first
    }

    private func dismissQuizNudge(for kid: Kid) {
        var ids = dismissedQuizKidIdsRaw.split(separator: ",").map(String.init)
        if !ids.contains(kid.id) { ids.append(kid.id) }
        dismissedQuizKidIdsRaw = ids.joined(separator: ",")
    }

    /// US-230: foods that expire within the next 7 days OR are already
    /// expired. Drives the dashboard surfaceability of the "use these up"
    /// nudge card; auto-hides when the count is zero.
    private var expiringFoods: [Food] {
        appState.foods.filter { food in
            guard let days = food.daysUntilExpiry else { return false }
            return days <= 7
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Kid Selector
                if !appState.kids.isEmpty {
                    KidSelectorView()
                }

                // Today's Meals Summary: allergies, what's planned, logging,
                // and what to offer if a meal doesn't go well.
                if let kidId = appState.activeKidId {
                    TodayMealSummaryCard(kidId: kidId, date: today)
                }

                // US-293: Tonight Mode. Prominent from 4pm-8pm while a kid
                // has no dinner planned; a small ideas button otherwise.
                TonightModeCard()

                // US-240: Quiz nudge card for kids without a pickiness profile.
                // Hides once they've taken the quiz, or after "Not now".
                if let kid = kidNeedingQuiz {
                    PickyEaterQuizNudgeCard(kid: kid, onDismiss: { dismissQuizNudge(for: kid) })
                }

                // US-230: only show when there's something to act on.
                if !expiringFoods.isEmpty {
                    ExpiringSoonCard(
                        foods: expiringFoods,
                        onTap: { showingExpiringSheet = true }
                    )
                }

                // US-231: surfaced once the family has rated a few meals.
                // Auto-hidden until there's signal worth showing.
                MostLovedMealsCard()

                // US-705: with no children there is nothing for the stats to
                // count and nothing the quick actions can attach to, so the
                // dashboard showed a grid of zeroes above three buttons, none
                // of which was "add a child" -- and Add Food was disabled
                // besides, because it needs an activeKidId. AC5: hide them
                // rather than render them empty, and offer the one action that
                // gets the parent out of this state.
                if appState.kids.isEmpty {
                    AddFirstChildCard(
                        message: "Add your child to start planning meals and keep a calm record of the foods they try."
                    )
                } else {
                    // The parents' logging streak and this week's household
                    // meter. Counts any logged try, refusals included, never
                    // what a child ate (FamilyRhythm).
                    FamilyRhythmCard(date: today)

                    // Food groups across the week for the selected child.
                    if let kidId = appState.activeKidId {
                        WeeklyVarietyStrip(kidId: kidId, date: today)
                    }

                    // Quick Stats
                    QuickStatsGrid(date: today)

                    // Quick Actions
                    QuickActionsSection(
                        onAddFood: { showingAddFood = true },
                        onScanBarcode: { showingScanner = true },
                        onNewRecipe: { showingAddRecipe = true }
                    )
                }
            }
            .padding()
        }
        .navigationTitle("Home")
        .onReceive(
            NotificationCenter.default.publisher(for: .NSCalendarDayChanged).receive(on: RunLoop.main)
        ) { _ in
            today = Date()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { today = Date() }
        }
        // US-461: global search entry point. Available from the primary
        // landing tab so any entity is one tap away regardless of which tab
        // owns it.
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingGlobalSearch = true
                } label: {
                    Image(systemName: "magnifyingglass")
                }
                .accessibilityLabel("Search everything")
            }
        }
        .sheet(isPresented: $showingGlobalSearch) {
            GlobalSearchView()
                .environmentObject(appState)
        }
        .refreshable {
            await appState.loadAllData()
        }
        .fullScreenCover(isPresented: $showingScanner) {
            UnifiedScannerView(
                initialMode: .barcode,
                allowModeSwitching: false
            ) { result in
                if case .barcode(let code) = result {
                    scannedBarcode = ScannedBarcodeItem(code: code)
                }
            }
        }
        .sheet(isPresented: $showingAddFood) {
            AddFoodView()
        }
        .sheet(isPresented: $showingAddRecipe) {
            AddRecipeView()
        }
        .sheet(item: $scannedBarcode) { item in
            ScannedProductView(barcode: item.code)
        }
        .sheet(isPresented: $showingExpiringSheet) {
            ExpiringFoodsSheet()
                .environmentObject(appState)
        }
    }
}

/// Wrapper to make a scanned barcode identifiable for sheet presentation.
struct ScannedBarcodeItem: Identifiable {
    let id = UUID()
    let code: String
}

// MARK: - Kid Selector

struct KidSelectorView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(appState.kids) { kid in
                    Button {
                        // US-246: Reduce-Motion respect — selecting a kid no
                        // longer animates for users on the system preference.
                        accessibleWithAnimation(
                            .default,
                            reduceMotion: UIAccessibility.isReduceMotionEnabled
                        ) {
                            appState.activeKidId = kid.id
                        }
                    } label: {
                        VStack(spacing: 6) {
                            ZStack {
                                Circle()
                                    .fill(appState.activeKidId == kid.id ? Color.green : Color(.systemGray5))
                                    .frame(width: 52, height: 52)

                                Text(String(kid.name.prefix(1)).uppercased())
                                    .font(.title2)
                                    .fontWeight(.bold)
                                    .foregroundStyle(appState.activeKidId == kid.id ? .white : .primary)
                            }
                            // Selection is shown by shape as well as colour,
                            // for colour-blind parents and bright sunlight.
                            .overlay(alignment: .bottomTrailing) {
                                if appState.activeKidId == kid.id {
                                    Image(systemName: "checkmark.circle.fill")
                                        .font(.body)
                                        .foregroundStyle(.white, .green)
                                        .background(Circle().fill(Color(.systemBackground)))
                                        .offset(x: 4, y: 4)
                                }
                            }

                            Text(kid.name)
                                .font(.caption)
                                .fontWeight(appState.activeKidId == kid.id ? .semibold : .regular)
                                .foregroundStyle(appState.activeKidId == kid.id ? .primary : .secondary)
                        }
                    }
                    .buttonStyle(.plain)
                    // US-246: A1-letter avatar + name is fragmented to VoiceOver
                    // by default; combine into a single labeled selection state.
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(kid.name)
                    .accessibilityValue(appState.activeKidId == kid.id ? "Selected" : "Not selected")
                    .accessibilityAddTraits(appState.activeKidId == kid.id ? [.isSelected] : [])
                    .accessibilityHint("Switch active kid to \(kid.name)")
                }
            }
            .padding(.horizontal, 4)
        }
    }
}

// MARK: - Today's Meal Summary

/// The card a parent (or a sitter handed the phone) opens the app for: whose
/// day it is, their allergies, what's planned in the order the day happens,
/// a one-tap log for each meal, and what to offer if a meal doesn't go well.
struct TodayMealSummaryCard: View {
    @EnvironmentObject var appState: AppState
    let kidId: String
    var date: Date = Date()

    /// The day in the order it happens. Breakfast, lunch and dinner always
    /// show so a gap is visible; snacks and the try bite only when planned.
    private static let slotOrder: [MealSlot] = [.breakfast, .snack1, .lunch, .snack2, .dinner, .tryBite]
    private static let coreSlots: Set<MealSlot> = [.breakfast, .lunch, .dinner]

    private var kid: Kid? {
        appState.kids.first { $0.id == kidId }
    }

    private var todayEntries: [PlanEntry] {
        appState.planEntriesForDate(date, kidId: kidId)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(kid.map { "\($0.name)'s meals today" } ?? "Today's meals")
                    .font(.headline)
                Spacer()
                Text(DateFormatter.shortDisplay.string(from: date))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if let kid {
                allergyLine(for: kid)
            }

            if todayEntries.isEmpty {
                emptyState
            } else {
                ForEach(Self.slotOrder, id: \.self) { slot in
                    let entries = todayEntries.filter { $0.mealSlot == slot.rawValue }
                    if !entries.isEmpty || Self.coreSlots.contains(slot) {
                        slotSection(slot, entries: entries)
                    }
                }
            }

            if let kid {
                fallbackSection(for: kid)
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: Allergies

    /// Always shown, so "none recorded" reads differently from "not loaded".
    @ViewBuilder
    private func allergyLine(for kid: Kid) -> some View {
        let allergens = (kid.allergens ?? [])
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        if allergens.isEmpty {
            Label("No allergies recorded", systemImage: "checkmark.shield")
                .font(.caption)
                .foregroundStyle(.secondary)
        } else {
            let parts = allergens.map { allergen -> String in
                guard let level = AllergenMatcher.recordedSeverity(for: kid, key: allergen) else { return allergen }
                return "\(allergen) (\(level))"
            }
            VStack(alignment: .leading, spacing: 2) {
                Label("Allergies: \(parts.joined(separator: ", "))", systemImage: "exclamationmark.triangle.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.red)
                if kid.crossContaminationSensitive == true {
                    Text("Sensitive to cross-contact. Keep prep surfaces and utensils separate.")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
            .accessibilityElement(children: .combine)
        }
    }

    // MARK: Slots

    private var emptyState: some View {
        VStack(spacing: 8) {
            Text("Nothing planned for today yet")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Button {
                DeepLinkHandler.shared.activeDestination = .mealPlan(
                    date: DateFormatter.isoDate.string(from: date)
                )
            } label: {
                Label("Plan today", systemImage: "calendar.badge.plus")
            }
            .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
    }

    @ViewBuilder
    private func slotSection(_ slot: MealSlot, entries: [PlanEntry]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Image(systemName: slot.icon)
                    .foregroundStyle(.green)
                    .frame(width: 24)
                    .accessibilityHidden(true)
                Text(slot.displayName)
                    .font(.subheadline.weight(.medium))
                Spacer()
                if entries.isEmpty {
                    Text("Nothing planned")
                        .font(.subheadline)
                        .foregroundStyle(.tertiary)
                }
            }

            ForEach(entries) { entry in
                entryRow(entry)
            }

            if slot == .tryBite && !entries.isEmpty {
                Text("Just on the plate. No bite needed.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.leading, 32)
            } else if Self.coreSlots.contains(slot), !entries.isEmpty, let kid,
                      !entries.contains(where: { isFamiliar($0, kid: kid) }) {
                Label("No safe food in this meal yet", systemImage: "info.circle")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .padding(.leading, 32)
            }
        }
    }

    private func entryRow(_ entry: PlanEntry) -> some View {
        let name = displayName(for: entry)
        let result = entry.result.flatMap { MealResult(rawValue: $0) }
        let allergen = kid.flatMap { allergenHit(entry, kid: $0) }
        return HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(.subheadline)
                if let allergen {
                    Label("Contains \(allergen)", systemImage: "exclamationmark.octagon.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.red)
                }
            }
            Spacer(minLength: 8)
            // One tap to record how it went, right where the meal is listed;
            // the same write the Planner's Log button makes.
            Menu {
                ForEach(MealResult.allCases, id: \.self) { option in
                    Button {
                        log(option, entry: entry)
                    } label: {
                        Label(option.displayName, systemImage: option.icon)
                    }
                }
            } label: {
                if let result {
                    Label(result.displayName, systemImage: result.icon)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(result.tint.opacity(0.15), in: Capsule())
                        .foregroundStyle(result.tint)
                } else {
                    Text("Log")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 4)
                        .background(Color.green.opacity(0.15), in: Capsule())
                        .foregroundStyle(.green)
                }
            }
            .accessibilityLabel(result.map { "\(name), logged \($0.displayName)" } ?? "Log how \(name) went")
            .accessibilityHint(result == nil ? "" : "Change what was logged")
        }
        .padding(.leading, 32)
    }

    private func log(_ result: MealResult, entry: PlanEntry) {
        guard entry.result != result.rawValue else { return }
        Task {
            // updatePlanEntry toasts both success and failure.
            try? await appState.updatePlanEntry(entry.id, updates: PlanEntryUpdate(result: result.rawValue))
        }
    }

    // MARK: Resolving entries

    /// Recipe first: a recipe entry's foodId is only its first ingredient.
    /// US-446: an entry that resolves to neither still shows, as "Meal".
    private func displayName(for entry: PlanEntry) -> String {
        if let recipeId = entry.recipeId,
           let recipe = appState.recipes.first(where: { $0.id == recipeId }) {
            return recipe.name
        }
        if let food = appState.foods.first(where: { $0.id == entry.foodId }) {
            return food.name
        }
        return "Meal"
    }

    private func foods(in entry: PlanEntry) -> [Food] {
        var ids = [entry.foodId]
        if let recipeId = entry.recipeId,
           let recipe = appState.recipes.first(where: { $0.id == recipeId }) {
            ids += recipe.foodIds
        }
        return ids.compactMap { id in appState.foods.first { $0.id == id } }
    }

    private func allergenHit(_ entry: PlanEntry, kid: Kid) -> String? {
        for food in foods(in: entry) {
            if let hit = AllergenMatcher.hit(for: kid, food: food) { return hit }
        }
        return nil
    }

    /// A meal counts as having a safe food when any of its foods is marked
    /// safe or is one the child always eats, and doesn't carry their allergen.
    private func isFamiliar(_ entry: PlanEntry, kid: Kid) -> Bool {
        let always = Set((kid.alwaysEatsFoods ?? []).map { $0.lowercased() })
        return foods(in: entry).contains {
            ($0.isSafe || always.contains($0.name.lowercased())) && AllergenMatcher.hit(for: kid, food: $0) == nil
        }
    }

    // MARK: Fallbacks

    /// What to offer if a meal doesn't go well, and what the parents have
    /// noted helps. A sitter needs this more than anything else on the card.
    @ViewBuilder
    private func fallbackSection(for kid: Kid) -> some View {
        let offers = fallbackFoods(for: kid)
        let tips = Array((kid.helpfulStrategies ?? []).filter { !$0.isEmpty }.prefix(2))
        if !offers.isEmpty || !tips.isEmpty {
            Divider()
            VStack(alignment: .leading, spacing: 6) {
                if !offers.isEmpty {
                    Text("If a meal doesn't go well, \(kid.name) usually eats")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(offers.joined(separator: " · "))
                        .font(.subheadline)
                }
                if !tips.isEmpty {
                    Text("What helps: \(tips.joined(separator: " "))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .accessibilityElement(children: .combine)
        }
    }

    /// The child's "always eats" list first; otherwise safe foods that are
    /// in stock, not expired and clear of this child's allergens.
    private func fallbackFoods(for kid: Kid) -> [String] {
        let always = (kid.alwaysEatsFoods ?? []).filter { !$0.isEmpty }
        if !always.isEmpty { return Array(always.prefix(5)) }
        return appState.safeFoods
            .filter { !$0.isExpired && ($0.quantity ?? 1) > 0 && AllergenMatcher.hit(for: kid, food: $0) == nil }
            .prefix(5)
            .map(\.name)
    }
}

// MARK: - Quick Stats

/// Numbers a parent can act on. The old grid showed household totals
/// ("Foods", "Safe Foods") under the kid selector, where they read as the
/// selected child's numbers; each tile now says whose number it is.
struct QuickStatsGrid: View {
    @EnvironmentObject var appState: AppState
    var date: Date = Date()

    private var kid: Kid? { appState.activeKid }

    /// Safe foods actually available: in stock and not expired.
    private var safeOnHand: [Food] {
        appState.safeFoods.filter { !$0.isExpired && ($0.quantity ?? 1) > 0 }
    }

    /// Safe foods about to run out: one or fewer left, or expiring in 3 days.
    private var safeRunningLow: Int {
        safeOnHand.filter { ($0.quantity ?? 2) <= 1 || $0.isExpiringSoon(within: 3) }.count
    }

    /// Try bites put on the plate in the last 7 days, whatever happened.
    /// Exposures are the progress, not bites eaten.
    private var tryBitesThisWeek: Int {
        guard let kid else { return 0 }
        let days = (0..<7).compactMap { Calendar.current.date(byAdding: .day, value: -$0, to: date) }
        let isoDays = Set(days.map { DateFormatter.isoDate.string(from: $0) })
        return appState.planEntries.filter {
            $0.kidId == kid.id && $0.mealSlot == MealSlot.tryBite.rawValue && isoDays.contains($0.date)
        }.count
    }

    var body: some View {
        LazyVGrid(columns: [
            GridItem(.flexible()),
            GridItem(.flexible()),
        ], spacing: 12) {
            DashboardStatCard(
                title: "Safe foods on hand",
                value: "\(safeOnHand.count)",
                icon: "checkmark.shield.fill",
                color: .blue,
                detail: safeRunningLow > 0 ? "\(safeRunningLow) running low" : "Household"
            )
            DashboardStatCard(
                title: kid.map { "\($0.name)'s try bites" } ?? "Try bites",
                value: "\(tryBitesThisWeek)",
                icon: "star.fill",
                color: .green,
                detail: "Offered in the last 7 days"
            )
            DashboardStatCard(
                title: "Recipes",
                value: "\(appState.recipes.count)",
                icon: "book.fill",
                color: .orange
            )
            DashboardStatCard(
                title: "To buy",
                value: "\(appState.groceryItems.filter { !$0.checked }.count)",
                icon: "cart.fill",
                color: .purple,
                detail: "On the grocery list"
            )
        }
    }
}

struct DashboardStatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color
    var detail: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .foregroundStyle(color)
                Spacer()
            }
            Text(value)
                .font(.title)
                .fontWeight(.bold)
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            if let detail {
                Text(detail)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        // One element for VoiceOver: "Recipes, 12" rather than three fragments.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title), \(value)\(detail.map { ". \($0)" } ?? "")")
    }
}

// MARK: - Weekly variety

/// Food groups on the selected child's plan over the last 7 days, counted in
/// days rather than servings: variety is judged across the week, not per
/// meal. Planned, not eaten, and labelled that way.
struct WeeklyVarietyStrip: View {
    @EnvironmentObject var appState: AppState
    let kidId: String
    var date: Date = Date()

    private static let groups: [FoodCategory] = [.protein, .carb, .dairy, .fruit, .vegetable]

    private var daysByGroup: [FoodCategory: Int] {
        let days = (0..<7).compactMap { Calendar.current.date(byAdding: .day, value: -$0, to: date) }
        let isoDays = Set(days.map { DateFormatter.isoDate.string(from: $0) })
        var seen: [FoodCategory: Set<String>] = [:]
        for entry in appState.planEntries where entry.kidId == kidId && isoDays.contains(entry.date) {
            var ids = [entry.foodId]
            if let rid = entry.recipeId, let recipe = appState.recipes.first(where: { $0.id == rid }) {
                ids += recipe.foodIds
            }
            for id in ids {
                guard let food = appState.foods.first(where: { $0.id == id }),
                      let group = FoodCategory(rawValue: food.category) else { continue }
                seen[group, default: []].insert(entry.date)
            }
        }
        return seen.mapValues(\.count)
    }

    var body: some View {
        let counts = daysByGroup
        if !counts.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Planned this week")
                    .font(.subheadline.weight(.semibold))
                HStack(spacing: 0) {
                    ForEach(Self.groups, id: \.self) { group in
                        let n = counts[group] ?? 0
                        VStack(spacing: 2) {
                            Text(group.icon)
                                .font(.title3)
                                .opacity(n == 0 ? 0.35 : 1)
                            Text("\(n)/7")
                                .font(.caption2.monospacedDigit())
                                .foregroundStyle(n == 0 ? HierarchicalShapeStyle.tertiary : HierarchicalShapeStyle.secondary)
                        }
                        .frame(maxWidth: .infinity)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(group.displayName): \(n) of 7 days")
                    }
                }
                if let gap = Self.groups.first(where: { (counts[$0] ?? 0) == 0 }) {
                    Text("No \(gap.displayName.lowercased()) planned in the last 7 days")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding()
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        }
    }
}

// MARK: - Quick Actions

struct QuickActionsSection: View {
    var onAddFood: () -> Void = {}
    var onScanBarcode: () -> Void = {}
    var onNewRecipe: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Quick Actions")
                .font(.headline)

            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible()),
                GridItem(.flexible()),
            ], spacing: 12) {
                QuickActionButton(title: "Add Food", icon: "plus.circle.fill", color: .green, action: onAddFood)
                QuickActionButton(title: "Scan Barcode", icon: "barcode.viewfinder", color: .blue, action: onScanBarcode)
                QuickActionButton(title: "New Recipe", icon: "book.fill", color: .orange, action: onNewRecipe)
            }
        }
    }
}

struct QuickActionButton: View {
    let title: String
    let icon: String
    let color: Color
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundStyle(color)

                Text(title)
                    .font(.caption)
                    .foregroundStyle(.primary)
                    // Wrap rather than truncate at large text sizes.
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .padding(.horizontal, 4)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: - Expiring Soon Card (US-230)

/// Dashboard card surfacing foods expiring within 7 days. Tapping opens a
/// focused sheet listing them, where each can be used, restocked, edited or
/// removed (US-472). Counts and copy adapt depending on
/// whether anything is already expired vs. just upcoming.
private struct ExpiringSoonCard: View {
    let foods: [Food]
    let onTap: () -> Void

    private var expiredCount: Int {
        foods.filter(\.isExpired).count
    }

    private var soonCount: Int {
        foods.filter { !$0.isExpired }.count
    }

    private var headline: String {
        if expiredCount > 0 && soonCount > 0 {
            return "\(expiredCount) expired · \(soonCount) expiring soon"
        }
        if expiredCount > 0 {
            return "\(expiredCount) food\(expiredCount == 1 ? "" : "s") expired"
        }
        return "\(soonCount) food\(soonCount == 1 ? "" : "s") expiring this week"
    }

    private var iconName: String {
        expiredCount > 0 ? "exclamationmark.triangle.fill" : "calendar.badge.exclamationmark"
    }

    private var iconColor: Color {
        expiredCount > 0 ? .red : .orange
    }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(iconColor.opacity(0.18))
                        .frame(width: 48, height: 48)
                    Image(systemName: iconName)
                        .font(.title3)
                        .foregroundStyle(iconColor)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(headline)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(.primary)
                    // It opens a list to use up, restock or remove; the old
                    // "plan meals around them" promised an action it lacks.
                    Text("Tap to use up, restock or remove")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding()
            .background(
                LinearGradient(
                    colors: [iconColor.opacity(0.10), iconColor.opacity(0.04)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: RoundedRectangle(cornerRadius: 12)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(iconColor.opacity(0.20), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(headline)
        .accessibilityHint("Open the expiring foods list")
    }
}

/// Sheet listing expiring foods sorted soonest-first, with inline actions
/// so the user can act without switching to the Pantry tab.
private struct ExpiringFoodsSheet: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss

    // US-472: inline edit / delete state so the user can act without
    // switching to the Pantry tab.
    @State private var editingFood: Food?
    @State private var foodPendingDeletion: Food?

    /// Read live from AppState (not a static snapshot) so used/deleted items
    /// drop off the list immediately.
    private var sorted: [Food] {
        appState.foods
            .filter { ($0.daysUntilExpiry ?? .max) <= 7 }
            .sorted { ($0.daysUntilExpiry ?? .max) < ($1.daysUntilExpiry ?? .max) }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if sorted.isEmpty {
                        ContentUnavailableView(
                            "Nothing expiring",
                            systemImage: "checkmark.seal",
                            description: Text("No foods are within 7 days of expiring.")
                        )
                    } else {
                        ForEach(sorted) { food in
                            Button {
                                editingFood = food
                            } label: {
                                row(for: food)
                            }
                            .buttonStyle(.plain)
                            // No full swipe: "Used" changes the shared pantry
                            // count, so it takes a deliberate tap.
                            .swipeActions(edge: .leading, allowsFullSwipe: false) {
                                Button {
                                    Task { await markUsed(food) }
                                } label: {
                                    Label("Used", systemImage: "minus.circle")
                                }
                                .tint(.orange)

                                Button {
                                    Task { await addToGrocery(food) }
                                } label: {
                                    Label("Grocery", systemImage: "cart.fill.badge.plus")
                                }
                                .tint(.blue)
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    foodPendingDeletion = food
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                            .contextMenu {
                                Button {
                                    editingFood = food
                                } label: {
                                    Label("Edit", systemImage: "pencil")
                                }
                                Button {
                                    Task { await markUsed(food) }
                                } label: {
                                    Label("Mark 1 used", systemImage: "minus.circle")
                                }
                                Button {
                                    Task { await addToGrocery(food) }
                                } label: {
                                    Label("Add to Grocery", systemImage: "cart.fill.badge.plus")
                                }
                                Divider()
                                Button(role: .destructive) {
                                    foodPendingDeletion = food
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Expiring Soon")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(item: $editingFood) { food in
                FoodDetailView(food: food)
                    .environmentObject(appState)
            }
            .alert(
                "Remove from pantry?",
                isPresented: Binding(
                    get: { foodPendingDeletion != nil },
                    set: { if !$0 { foodPendingDeletion = nil } }
                ),
                presenting: foodPendingDeletion
            ) { food in
                Button("Delete", role: .destructive) {
                    Task { try? await appState.deleteFood(food.id) }
                    foodPendingDeletion = nil
                }
                Button("Cancel", role: .cancel) { foodPendingDeletion = nil }
            } message: { food in
                Text("Delete \(food.name) from your pantry?")
            }
        }
    }

    @ViewBuilder
    private func row(for food: Food) -> some View {
        HStack(spacing: 12) {
            let category = FoodCategory(rawValue: food.category)
            Text(category?.icon ?? "🍽")
                .font(.title2)

            VStack(alignment: .leading, spacing: 2) {
                Text(food.name)
                    .font(.body)
                    .fontWeight(.medium)
                    .foregroundStyle(.primary)
                    .strikethrough(food.isExpired, color: .red)
                if let days = food.daysUntilExpiry {
                    ExpiryChip(days: days)
                }
            }
            Spacer()
            if let qty = food.quantity {
                Text(qty.formatted())
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// US-472: decrement on-hand quantity by one (floored at zero), reusing
    /// the same AppState update path as the Pantry (offline queue + realtime).
    private func markUsed(_ food: Food) async {
        // No recorded quantity means "we have some": there is nothing to
        // count down, and writing 0 would mark it as run out.
        guard let quantity = food.quantity, quantity > 0 else {
            ToastManager.shared.info("No quantity recorded for \(food.name)", message: "Edit it to set how many you have.")
            return
        }
        let previous = quantity
        let next = max(0, quantity - 1)
        do {
            try await appState.updateFood(food.id, updates: FoodUpdate(quantity: next))
            ToastManager.shared.show(Toast(
                type: .success,
                title: "Used 1 \(food.name)",
                message: "\(next.formatted()) left",
                duration: 5,
                actionLabel: "Undo",
                retry: {
                    try? await appState.updateFood(food.id, updates: FoodUpdate(quantity: previous))
                }
            ))
        } catch {
            // updateFood already toasted the failure.
        }
    }

    private func addToGrocery(_ food: Food) async {
        let key = food.name.lowercased()
        if appState.groceryItems.contains(where: { !$0.checked && $0.name.lowercased() == key }) {
            ToastManager.shared.info("\(food.name) is already on your grocery list")
            return
        }
        let item = GroceryItem(
            id: UUID().uuidString,
            userId: "",
            name: food.name,
            category: food.category,
            quantity: 1,
            unit: food.unit ?? "count",
            checked: false,
            addedVia: "restock"
        )
        try? await appState.addGroceryItem(item)
    }
}

// MARK: - Most Loved Meals (US-231)

/// Dashboard card surfacing the top-rated meals from `plan_entry_feedback`.
/// Sort key is `(avgRating × log10(occurrences + 1))` so a single 5-star
/// outlier doesn't beat a meal rated 4+ ten times. Auto-hidden until the
/// family has at least 2 rated meals — not enough signal otherwise.
private struct MostLovedMealsCard: View {
    @EnvironmentObject var appState: AppState

    // fileprivate so the sibling `LovedMealRow` (also fileprivate) can
    // reference it in its `let item: MostLovedMealsCard.Loved` property.
    fileprivate struct Loved: Identifiable {
        let id: String  // food or recipe id
        let name: String
        let avgRating: Double
        let count: Int
        let foodId: String?
        let recipeId: String?
    }

    private var loved: [Loved] {
        // Aggregate ratings per food/recipe by walking feedback → planEntry → name.
        // Group key prefers recipeId over foodId so pasta-vs-pasta-recipe stay separate.
        var bucket: [String: (name: String, ratings: [Int], foodId: String?, recipeId: String?)] = [:]
        for fb in appState.planEntryFeedback where fb.rating >= 4 {
            guard let entry = appState.planEntries.first(where: { $0.id == fb.planEntryId }) else { continue }
            // The selected child's favourites only: a sibling's loved meal
            // quick-added to this child's dinner is the wrong suggestion, and
            // for a child with ARFID or an allergy it can be a harmful one.
            if let kidId = appState.activeKidId, entry.kidId != kidId { continue }
            let key: String
            let displayName: String?
            let foodId: String?
            let recipeId: String?
            if let rid = entry.recipeId, let recipe = appState.recipes.first(where: { $0.id == rid }) {
                key = "recipe:\(rid)"
                displayName = recipe.name
                foodId = nil
                recipeId = rid
            } else if let food = appState.foods.first(where: { $0.id == entry.foodId }) {
                key = "food:\(food.id)"
                displayName = food.name
                foodId = food.id
                recipeId = nil
            } else {
                continue
            }
            guard let name = displayName else { continue }
            var existing = bucket[key] ?? (name: name, ratings: [], foodId: foodId, recipeId: recipeId)
            existing.ratings.append(fb.rating)
            bucket[key] = existing
        }

        return bucket
            .map { (key, value) -> Loved in
                let avg = Double(value.ratings.reduce(0, +)) / Double(value.ratings.count)
                return Loved(
                    id: key,
                    name: value.name,
                    avgRating: avg,
                    count: value.ratings.count,
                    foodId: value.foodId,
                    recipeId: value.recipeId
                )
            }
            // avg × log(count + 1) — frequency tiebreaker but a single 5-star
            // doesn't trump a 4-star ten-times.
            .sorted {
                let a = $0.avgRating * log10(Double($0.count) + 1)
                let b = $1.avgRating * log10(Double($1.count) + 1)
                return a > b
            }
            .prefix(5)
            .map { $0 }
    }

    var body: some View {
        // Need at least 2 distinct loved meals before the card carries weight.
        if loved.count >= 2 {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Label(appState.activeKid.map { "\($0.name)'s favourites" } ?? "Most loved", systemImage: "heart.fill")
                        .foregroundStyle(.pink)
                        .font(.headline)
                    Spacer()
                    Text("from your ratings")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }

                ForEach(loved) { item in
                    LovedMealRow(item: item)
                }
            }
            .padding()
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        }
    }
}

private struct LovedMealRow: View {
    @EnvironmentObject var appState: AppState
    let item: MostLovedMealsCard.Loved
    @State private var isAdding = false

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: item.recipeId != nil ? "book.fill" : "leaf.fill")
                .foregroundStyle(.pink)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                Text(item.name)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .lineLimit(1)
                Text(String(format: "%.1f★ · rated %d time%@",
                            item.avgRating,
                            item.count,
                            item.count == 1 ? "" : "s"))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            // Quick-add only works for food-based loved meals — plan_entries
            // requires a non-null food_id. Recipe-only items still appear in
            // the list (informative) but route the user to the recipe detail
            // for the full add flow.
            if item.foodId != nil {
                if alreadyTonight {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                        .accessibilityLabel("\(item.name) is already on tonight's dinner")
                } else {
                    Button {
                        Task { await addToToday() }
                    } label: {
                        if isAdding {
                            ProgressView().controlSize(.small)
                        } else {
                            Image(systemName: "plus.circle.fill")
                                .font(.title3)
                                .foregroundStyle(.green)
                        }
                    }
                    .disabled(isAdding || appState.activeKidId == nil)
                    .accessibilityLabel("Add \(item.name) to \(appState.activeKid?.name ?? "today")'s dinner tonight")
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var todayIso: String { DateFormatter.isoDate.string(from: Date()) }

    /// Tonight's dinner for the selected kid already has this food.
    private var alreadyTonight: Bool {
        guard let kidId = appState.activeKidId, let foodId = item.foodId else { return false }
        return appState.planEntries.contains {
            $0.kidId == kidId && $0.date == todayIso
                && $0.mealSlot == MealSlot.dinner.rawValue && $0.foodId == foodId
        }
    }

    private func addToToday() async {
        guard let kidId = appState.activeKidId, let foodId = item.foodId else { return }
        guard !alreadyTonight else { return }
        if let kid = appState.activeKid,
           let food = appState.foods.first(where: { $0.id == foodId }),
           let allergen = AllergenMatcher.hit(for: kid, food: food) {
            ToastManager.shared.warning(
                "Not added",
                message: "\(food.name) contains \(allergen), which \(kid.name) is allergic to."
            )
            HapticManager.error()
            return
        }
        isAdding = true
        defer { isAdding = false }

        let entry = PlanEntry(
            id: UUID().uuidString,
            userId: "",
            kidId: kidId,
            date: todayIso,
            mealSlot: MealSlot.dinner.rawValue,
            foodId: foodId,
            recipeId: item.recipeId
        )
        try? await appState.addPlanEntry(entry)
    }
}

// MARK: - Picky Eater Quiz Nudge (US-240)

/// Dashboard prompt shown when an active kid has no pickiness profile yet.
/// One tap opens the quiz pre-targeted to that kid; the result screen then
/// offers an "Apply to <name>" button that persists the personality result.
private struct PickyEaterQuizNudgeCard: View {
    let kid: Kid
    var onDismiss: () -> Void = {}
    @State private var showingQuiz = false

    var body: some View {
        VStack(alignment: .trailing, spacing: 4) {
            card
            Button("Not now", action: onDismiss)
                .font(.caption)
                .foregroundStyle(.secondary)
                .accessibilityLabel("Hide the eating style suggestion for \(kid.name)")
        }
    }

    private var card: some View {
        Button {
            showingQuiz = true
        } label: {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(Color.pink.opacity(0.18))
                        .frame(width: 48, height: 48)
                    Image(systemName: "questionmark.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.pink)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("Discover \(kid.name)'s eating style")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(.primary)
                    Text("8 quick questions, ideas that fit them")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding()
            .background(Color.pink.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showingQuiz) {
            PickyEaterQuizView(kid: kid)
        }
        .accessibilityLabel("Discover \(kid.name)'s eating style. 8 quick questions")
    }
}

#Preview {
    NavigationStack {
        DashboardHomeView()
    }
    .environmentObject(AppState())
}
