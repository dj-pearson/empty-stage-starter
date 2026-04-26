import SwiftUI

struct DashboardHomeView: View {
    @EnvironmentObject var appState: AppState
    @State private var showingScanner = false
    @State private var showingAddFood = false
    @State private var scannedBarcode: ScannedBarcodeItem?
    /// US-230: opens the pantry tab pre-filtered to expiring foods.
    @State private var showingExpiringSheet = false

    /// US-240: First active kid that has neither a saved pickinessLevel nor
    /// strategies — these are the parents who will benefit most from the quiz.
    /// Returns nil once everyone has a profile set up.
    private var kidNeedingQuiz: Kid? {
        appState.kids.first { kid in
            let noPickiness = (kid.pickinessLevel ?? "").isEmpty
            let noStrategies = (kid.helpfulStrategies ?? []).isEmpty
            return noPickiness && noStrategies
        }
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

                // Today's Meals Summary
                if let kidId = appState.activeKidId {
                    TodayMealSummaryCard(kidId: kidId)
                }

                // US-240: Quiz nudge card for kids without a pickiness profile.
                // Auto-hides once they've taken the quiz so it doesn't nag.
                if let kid = kidNeedingQuiz {
                    PickyEaterQuizNudgeCard(kid: kid)
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

                // Quick Stats
                QuickStatsGrid()

                // Quick Actions
                QuickActionsSection(
                    onAddFood: { showingAddFood = true },
                    onScanBarcode: { showingScanner = true }
                )
            }
            .padding()
        }
        .navigationTitle("Dashboard")
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
        .sheet(item: $scannedBarcode) { item in
            ScannedProductView(barcode: item.code)
        }
        .sheet(isPresented: $showingExpiringSheet) {
            ExpiringFoodsSheet(foods: expiringFoods)
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

                            Text(kid.name)
                                .font(.caption)
                                .foregroundStyle(appState.activeKidId == kid.id ? .primary : .secondary)
                        }
                    }
                    .buttonStyle(.plain)
                    // US-246: A1-letter avatar + name is fragmented to VoiceOver
                    // by default; combine into a single labeled selection state.
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(kid.name)
                    .accessibilityValue(appState.activeKidId == kid.id ? "Selected" : "Not selected")
                    .accessibilityHint("Switch active kid to \(kid.name)")
                }
            }
            .padding(.horizontal, 4)
        }
    }
}

// MARK: - Today's Meal Summary

struct TodayMealSummaryCard: View {
    @EnvironmentObject var appState: AppState
    let kidId: String

    private var todayEntries: [PlanEntry] {
        appState.planEntriesForDate(Date(), kidId: kidId)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Today's Meals")
                    .font(.headline)
                Spacer()
                Text(DateFormatter.shortDisplay.string(from: Date()))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if todayEntries.isEmpty {
                HStack {
                    Image(systemName: "calendar.badge.plus")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                    Text("No meals planned for today")
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
            } else {
                ForEach(MealSlot.allCases, id: \.self) { slot in
                    let entries = todayEntries.filter { $0.mealSlot == slot.rawValue }
                    if !entries.isEmpty {
                        HStack {
                            Image(systemName: slot.icon)
                                .foregroundStyle(.green)
                                .frame(width: 24)

                            Text(slot.displayName)
                                .font(.subheadline)
                                .fontWeight(.medium)

                            Spacer()

                            Text(foodNames(for: entries))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private func foodNames(for entries: [PlanEntry]) -> String {
        entries.compactMap { entry in
            appState.foods.first { $0.id == entry.foodId }?.name
        }.joined(separator: ", ")
    }
}

// MARK: - Quick Stats

struct QuickStatsGrid: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        LazyVGrid(columns: [
            GridItem(.flexible()),
            GridItem(.flexible()),
        ], spacing: 12) {
            DashboardStatCard(
                title: "Foods",
                value: "\(appState.foods.count)",
                icon: "leaf.fill",
                color: .green
            )
            DashboardStatCard(
                title: "Safe Foods",
                value: "\(appState.safeFoods.count)",
                icon: "checkmark.shield.fill",
                color: .blue
            )
            DashboardStatCard(
                title: "Recipes",
                value: "\(appState.recipes.count)",
                icon: "book.fill",
                color: .orange
            )
            DashboardStatCard(
                title: "Grocery Items",
                value: "\(appState.groceryItems.filter { !$0.checked }.count)",
                icon: "cart.fill",
                color: .purple
            )
        }
    }
}

struct DashboardStatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

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
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Quick Actions

struct QuickActionsSection: View {
    var onAddFood: () -> Void = {}
    var onScanBarcode: () -> Void = {}

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
                QuickActionButton(title: "New Recipe", icon: "book.fill", color: .orange, action: {})
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
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Expiring Soon Card (US-230)

/// Dashboard card surfacing foods expiring within 7 days. Tapping opens a
/// focused sheet listing them; the sheet is read-only — taking action is
/// done via the underlying Pantry tab. Counts and copy adapt depending on
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
                    Text("Tap to plan meals around them")
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

/// Read-only sheet listing expiring foods sorted soonest-first. Designed
/// for the "skim & decide" use case before opening Pantry to actually edit.
private struct ExpiringFoodsSheet: View {
    @Environment(\.dismiss) var dismiss
    let foods: [Food]

    private var sorted: [Food] {
        foods.sorted {
            ($0.daysUntilExpiry ?? .max) < ($1.daysUntilExpiry ?? .max)
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(sorted) { food in
                        HStack(spacing: 12) {
                            let category = FoodCategory(rawValue: food.category)
                            Text(category?.icon ?? "🍽")
                                .font(.title2)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(food.name)
                                    .font(.body)
                                    .fontWeight(.medium)
                                    .strikethrough(food.isExpired, color: .red)
                                if let days = food.daysUntilExpiry {
                                    ExpiryChip(days: days)
                                }
                            }
                            Spacer()
                        }
                    }
                } footer: {
                    Text("To edit or delete a food, open the Pantry tab.")
                        .font(.caption2)
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
        }
    }
}

// MARK: - Most Loved Meals (US-231)

/// Dashboard card surfacing the top-rated meals from `plan_entry_feedback`.
/// Sort key is `(avgRating × log10(occurrences + 1))` so a single 5-star
/// outlier doesn't beat a meal rated 4+ ten times. Auto-hidden until the
/// family has at least 2 rated meals — not enough signal otherwise.
private struct MostLovedMealsCard: View {
    @EnvironmentObject var appState: AppState

    private struct Loved: Identifiable {
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
                    Label("Most loved", systemImage: "heart.fill")
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
                .accessibilityLabel("Add \(item.name) to today's plan")
            }
        }
        .padding(.vertical, 4)
    }

    private func addToToday() async {
        guard let kidId = appState.activeKidId, let foodId = item.foodId else { return }
        isAdding = true
        defer { isAdding = false }

        let entry = PlanEntry(
            id: UUID().uuidString,
            userId: "",
            kidId: kidId,
            date: DateFormatter.isoDate.string(from: Date()),
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
    @State private var showingQuiz = false

    var body: some View {
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
                    Text("8 questions • personalized strategies")
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
                    colors: [Color.pink.opacity(0.08), Color.purple.opacity(0.05)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: RoundedRectangle(cornerRadius: 12)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(Color.pink.opacity(0.2), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showingQuiz) {
            PickyEaterQuizView(kid: kid)
        }
        .accessibilityLabel("Discover \(kid.name)'s eating style — take the picky-eater quiz")
    }
}

#Preview {
    NavigationStack {
        DashboardHomeView()
    }
    .environmentObject(AppState())
}
