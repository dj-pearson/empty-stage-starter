import SwiftUI
import TipKit

/// US-264: GroceryView display mode. Persisted via @AppStorage so the
/// user's preference survives across app launches.
enum GroceryViewMode: String, CaseIterable {
    case byAisle = "by_aisle"
    case byRecipe = "by_recipe"

    var title: String {
        switch self {
        case .byAisle:  return "By Aisle"
        case .byRecipe: return "By Recipe"
        }
    }

    var icon: String {
        switch self {
        case .byAisle:  return "list.bullet.indent"
        case .byRecipe: return "book.closed.fill"
        }
    }
}

struct GroceryView: View {
    @EnvironmentObject var appState: AppState
    @State private var searchText = ""
    @State private var showingAddItem = false
    @State private var showingVoiceAdd = false
    @State private var showingPhotoImport = false
    @State private var showingListScanner = false
    @State private var scannedListLines: [String] = []
    @State private var showingScanReview = false
    @State private var showingClearAlert = false
    @State private var isGenerating = false
    @State private var editingItem: GroceryItem?
    // US-232: Shopping Mode (one-handed in-store UI)
    @State private var showingShoppingMode = false
    // US-264: tapping a recipe section header opens the recipe detail.
    @State private var inspectedRecipe: Recipe?

    /// US-264: persisted view-mode preference. Defaults to .byAisle so
    /// existing users see no behavior change until they opt in.
    @AppStorage("grocery.viewMode") private var viewModeRaw: String =
        GroceryViewMode.byAisle.rawValue

    private var viewMode: GroceryViewMode {
        GroceryViewMode(rawValue: viewModeRaw) ?? .byAisle
    }

    private var swipeTip = SwipeGroceryTip()
    private var contextMenuTip = ContextMenuTip()

    private var uncheckedItems: [GroceryItem] {
        appState.groceryItems.filter { !$0.checked && matchesSearch($0) }
    }

    private var checkedItems: [GroceryItem] {
        appState.groceryItems.filter { $0.checked && matchesSearch($0) }
    }

    /// US-263: group by aisleSection when present (32-value store
    /// taxonomy), fall back to legacy `category` otherwise. The composite
    /// key uses an "aisle:" / "category:" prefix so headers can render
    /// the right icon + label without an extra lookup.
    private var groupedUncheckedItems: [(String, [GroceryItem])] {
        let grouped = Dictionary(grouping: uncheckedItems) { item -> String in
            if let raw = item.aisleSection, GroceryAisle(rawValue: raw) != nil {
                return "aisle:\(raw)"
            }
            return "category:\(item.category)"
        }
        return grouped.sorted { sortKey($0.key) < sortKey($1.key) }
    }

    /// Aisle keys sort by store walk order; legacy category keys sort
    /// alphabetically and always come after aisles so a half-migrated
    /// list reads cleanly.
    private func sortKey(_ key: String) -> (Int, String) {
        if let aisle = aisle(from: key) {
            return (aisle.storeWalkOrder, aisle.displayName)
        }
        return (10_000, key)
    }

    private func aisle(from key: String) -> GroceryAisle? {
        guard key.hasPrefix("aisle:") else { return nil }
        return GroceryAisle(rawValue: String(key.dropFirst("aisle:".count)))
    }

    private func matchesSearch(_ item: GroceryItem) -> Bool {
        searchText.isEmpty || item.name.localizedCaseInsensitiveContains(searchText)
    }

    // MARK: - US-264 By Recipe grouping

    /// Tag for the synthetic top + bottom buckets in By Recipe mode.
    private enum RecipeBucket: Hashable {
        case recipe(String)
        case shared
        case manual
    }

    /// Per-bucket items for By Recipe mode. Order: Shared first
    /// (multi-recipe items the user should weigh against multiple meals),
    /// then individual recipes alphabetically by name, then Manual at the
    /// bottom (items with no source rows).
    private var groupedByRecipeBuckets: [(RecipeBucket, String, [GroceryItem])] {
        let sourcesByItem = Dictionary(grouping: appState.groceryItemSources, by: \.groceryItemId)
        var sharedItems: [GroceryItem] = []
        var manualItems: [GroceryItem] = []
        var perRecipe: [String: [GroceryItem]] = [:]

        for item in uncheckedItems {
            let sources = sourcesByItem[item.id] ?? []
            let recipeIds = Set(sources.compactMap(\.recipeId))
            if recipeIds.isEmpty {
                manualItems.append(item)
            } else if recipeIds.count >= 2 {
                sharedItems.append(item)
            } else if let only = recipeIds.first {
                perRecipe[only, default: []].append(item)
            }
        }

        var result: [(RecipeBucket, String, [GroceryItem])] = []
        if !sharedItems.isEmpty {
            result.append((.shared, "Shared across recipes", sharedItems))
        }
        let recipesById = Dictionary(uniqueKeysWithValues: appState.recipes.map { ($0.id, $0) })
        let recipeSections = perRecipe
            .compactMap { (recipeId, items) -> (RecipeBucket, String, [GroceryItem])? in
                let title = recipesById[recipeId]?.name ?? "Unknown recipe"
                return (.recipe(recipeId), title, items)
            }
            .sorted { $0.1.localizedCaseInsensitiveCompare($1.1) == .orderedAscending }
        result.append(contentsOf: recipeSections)
        if !manualItems.isEmpty {
            result.append((.manual, "Manual additions", manualItems))
        }
        return result
    }

    /// Subtitle for a recipe section: "Mon dinner · Wed lunch" — every
    /// meal slot the recipe covers in the current sources data.
    private func recipeSectionSubtitle(for recipeId: String) -> String {
        let sources = appState.groceryItemSources.filter { $0.recipeId == recipeId }
        let labels: [String] = sources.compactMap { src -> String? in
            guard let dateStr = src.mealDate, let slot = src.mealSlot else { return nil }
            guard let date = DateFormatter.isoDate.date(from: dateStr) else { return nil }
            let weekday = Self.weekdayShortFormatter.string(from: date)
            let slotName = MealSlot(rawValue: slot)?.displayName ?? slot.capitalized
            return "\(weekday) \(slotName.lowercased())"
        }
        // Dedupe + cap so we don't render endless subtitles for recipes
        // that show up many times in the week.
        let unique = Array(Set(labels)).sorted()
        return unique.prefix(3).joined(separator: " · ")
    }

    private static let weekdayShortFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "EEE"
        return f
    }()

    /// Wrap a GroceryItemRow with all the swipe + tap + context menu
    /// modifiers. Extracted so both view modes can share the behavior
    /// without duplicating ~80 lines.
    @ViewBuilder
    private func decoratedRow(for item: GroceryItem) -> some View {
        GroceryItemRow(item: item)
            .contentShape(Rectangle())
            .onTapGesture { editingItem = item }
            .swipeActions(edge: .leading, allowsFullSwipe: true) {
                Button {
                    HapticManager.success()
                    Task {
                        try? await appState.toggleGroceryItem(item.id)
                        await TipEvents.didSwipeGrocery.donate()
                    }
                } label: {
                    Label("Check", systemImage: "checkmark.circle.fill")
                }
                .tint(.green)
                .accessibilityLabel("Mark \(item.name) as bought")
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                Button(role: .destructive) {
                    HapticManager.error()
                    Task {
                        try? await appState.deleteGroceryItem(item.id)
                        await TipEvents.didSwipeGrocery.donate()
                    }
                } label: {
                    Label("Delete", systemImage: "trash")
                }
                Button {
                    HapticManager.lightImpact()
                    editingItem = item
                    Task { await TipEvents.didSwipeGrocery.donate() }
                } label: {
                    Label("Edit", systemImage: "pencil")
                }
                .tint(.blue)
            }
            .contextMenu {
                Button {
                    HapticManager.success()
                    Task { try? await appState.toggleGroceryItem(item.id) }
                } label: {
                    Label(item.checked ? "Uncheck" : "Mark Bought",
                          systemImage: item.checked ? "arrow.uturn.backward.circle" : "checkmark.circle.fill")
                }

                Button {
                    HapticManager.lightImpact()
                    editingItem = item
                } label: {
                    Label("Edit", systemImage: "pencil")
                }

                Button {
                    HapticManager.success()
                    Task {
                        let duplicate = GroceryItem(
                            id: UUID().uuidString,
                            userId: "",
                            name: item.name,
                            category: item.category,
                            quantity: item.quantity,
                            unit: item.unit,
                            checked: false,
                            notes: item.notes,
                            priority: item.priority,
                            addedVia: "manual"
                        )
                        try? await appState.addGroceryItem(duplicate)
                        ToastManager.shared.success("Duplicated", message: item.name)
                    }
                } label: {
                    Label("Duplicate", systemImage: "plus.square.on.square")
                }

                Divider()

                Button(role: .destructive) {
                    HapticManager.error()
                    Task { try? await appState.deleteGroceryItem(item.id) }
                } label: {
                    Label("Delete", systemImage: "trash")
                }
            }
    }

    @ViewBuilder
    private var byAisleSections: some View {
        ForEach(groupedUncheckedItems, id: \.0) { category, items in
            Section {
                ForEach(items) { item in
                    decoratedRow(for: item)
                }
            } header: {
                if let aisle = aisle(from: category) {
                    Label(aisle.displayName, systemImage: aisle.icon)
                } else {
                    let raw = category.hasPrefix("category:")
                        ? String(category.dropFirst("category:".count))
                        : category
                    let cat = FoodCategory(rawValue: raw)
                    Text("\(cat?.icon ?? "🛒") \(cat?.displayName ?? raw)")
                }
            }
        }
    }

    @ViewBuilder
    private var byRecipeSections: some View {
        ForEach(groupedByRecipeBuckets, id: \.0) { bucket, title, items in
            Section {
                ForEach(items) { item in
                    decoratedRow(for: item)
                }
            } header: {
                byRecipeSectionHeader(bucket: bucket, title: title)
            }
        }
    }

    @ViewBuilder
    private func byRecipeSectionHeader(bucket: RecipeBucket, title: String) -> some View {
        switch bucket {
        case .recipe(let recipeId):
            Button {
                if let recipe = appState.recipes.first(where: { $0.id == recipeId }) {
                    inspectedRecipe = recipe
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "book.closed.fill")
                        .foregroundStyle(.secondary)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(title)
                            .textCase(nil)
                        let subtitle = recipeSectionSubtitle(for: recipeId)
                        if !subtitle.isEmpty {
                            Text(subtitle)
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                                .textCase(nil)
                        }
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .foregroundStyle(.tertiary)
                        .font(.caption)
                }
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens \(title) recipe details")
        case .shared:
            Label(title, systemImage: "rectangle.connected.to.line.below")
        case .manual:
            Label(title, systemImage: "hand.point.up.left.fill")
        }
    }

    var body: some View {
        List {
            // Summary Header
            Section {
                HStack {
                    VStack(alignment: .leading) {
                        Text("\(uncheckedItems.count) items remaining")
                            .font(.headline)
                        if !checkedItems.isEmpty {
                            Text("\(checkedItems.count) completed")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Spacer()

                    if !checkedItems.isEmpty {
                        Button("Clear Done") {
                            showingClearAlert = true
                        }
                        .font(.subheadline)
                        .foregroundStyle(.red)
                    }
                }
                .popoverTip(swipeTip)
            }

            // Unchecked Items by Category
            if appState.isLoading && appState.groceryItems.isEmpty {
                Section {
                    ForEach(0..<5, id: \.self) { _ in
                        SkeletonView(shape: .groceryRow)
                    }
                }
            } else if groupedUncheckedItems.isEmpty && checkedItems.isEmpty {
                Section {
                    ContentUnavailableView(
                        "No Grocery Items",
                        systemImage: "cart.fill",
                        description: Text("Add items to your grocery list to get started.")
                    )
                }
            } else {
                // US-264: branch on view mode. By Aisle uses the existing
                // walk-order grouping; By Recipe groups items under the
                // recipes that contributed to them.
                switch viewMode {
                case .byAisle:
                    byAisleSections
                case .byRecipe:
                    byRecipeSections
                }

                // Checked Items
                if !checkedItems.isEmpty {
                    Section {
                        ForEach(checkedItems) { item in
                            GroceryItemRow(item: item)
                                .swipeActions(edge: .leading, allowsFullSwipe: true) {
                                    Button {
                                        HapticManager.lightImpact()
                                        Task { try? await appState.toggleGroceryItem(item.id) }
                                    } label: {
                                        Label("Uncheck", systemImage: "arrow.uturn.backward.circle")
                                    }
                                    .tint(.orange)
                                    .accessibilityLabel("Uncheck \(item.name)")
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    Button(role: .destructive) {
                                        HapticManager.error()
                                        Task { try? await appState.deleteGroceryItem(item.id) }
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                        }
                    } header: {
                        Text("Completed")
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Grocery List")
        .searchable(text: $searchText, prompt: "Search items...")
        .dropDestination(for: FoodTransferable.self) { droppedFoods, _ in
            guard !droppedFoods.isEmpty else { return false }
            Task {
                var addedCount = 0
                for dropped in droppedFoods {
                    // US-263: derive aisle from the dropped food's FoodCategory
                    // so the new item lands in the right store section
                    // immediately rather than stuck under a "category:" header.
                    let aisle = GroceryAisle.fromLegacyCategory(dropped.category)
                    let item = GroceryItem(
                        id: UUID().uuidString,
                        userId: "",
                        name: dropped.name,
                        category: dropped.category,
                        quantity: 1,
                        unit: dropped.unit ?? "count",
                        checked: false,
                        addedVia: "drag",
                        aisleSection: aisle.rawValue
                    )
                    do {
                        try await appState.addGroceryItem(item)
                        addedCount += 1
                    } catch {
                        continue
                    }
                }
                HapticManager.success()
                await TipEvents.didDragFood.donate()
                if addedCount > 0 {
                    ToastManager.shared.success(
                        "Added to grocery",
                        message: addedCount == 1
                            ? droppedFoods.first!.name
                            : "\(addedCount) items"
                    )
                }
            }
            return true
        }
        .toolbar {
            // US-232: Shopping mode entry — placed on the leading edge so the
            // grab is reachable with the same hand that's already holding the
            // phone in-store. Disabled when the list is empty.
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    HapticManager.mediumImpact()
                    showingShoppingMode = true
                } label: {
                    Image(systemName: "figure.walk.motion")
                        .symbolRenderingMode(.hierarchical)
                }
                .disabled(uncheckedItems.isEmpty)
                .accessibilityLabel("Start shopping mode")
                .accessibilityHint("One-handed in-store view with large rows and dim screen")
            }

            // US-264: View-mode toggle. Placed near the title so it
            // reads as a list-display switcher rather than a write
            // action; uses a Menu with checkmarks so the current mode
            // is glanceable without opening the menu twice.
            ToolbarItem(placement: .principal) {
                Menu {
                    ForEach(GroceryViewMode.allCases, id: \.self) { mode in
                        Button {
                            if viewMode != mode {
                                HapticManager.selection()
                                viewModeRaw = mode.rawValue
                            }
                        } label: {
                            Label(mode.title, systemImage: mode.icon)
                            if viewMode == mode {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: viewMode.icon)
                            .imageScale(.small)
                        Text(viewMode.title)
                            .font(.subheadline)
                            .fontWeight(.semibold)
                        Image(systemName: "chevron.down")
                            .imageScale(.small)
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityLabel("Grocery view mode: \(viewMode.title)")
                }
            }

            ToolbarItem(placement: .primaryAction) {
                HStack(spacing: 12) {
                    Menu {
                        Button {
                            showingVoiceAdd = true
                        } label: {
                            Label("Dictate items", systemImage: "mic.fill")
                        }

                        Button {
                            showingListScanner = true
                        } label: {
                            Label("Scan a list", systemImage: "text.viewfinder")
                        }

                        Button {
                            showingPhotoImport = true
                        } label: {
                            Label("Import from photo", systemImage: "photo.on.rectangle.angled")
                        }

                        Divider()

                        Button {
                            Task { await generateFromWeekPlan() }
                        } label: {
                            Label("Generate from this week's plan", systemImage: "calendar.badge.plus")
                        }
                        .disabled(isGenerating)

                        Divider()

                        if GroceryTripActivityService.shared.isActive {
                            Button(role: .destructive) {
                                Task {
                                    await GroceryTripActivityService.shared.end()
                                    HapticManager.mediumImpact()
                                }
                            } label: {
                                Label("End shopping trip", systemImage: "checkmark.circle.fill")
                            }
                        } else {
                            Button {
                                Task {
                                    let total = appState.groceryItems.count
                                    let checked = appState.groceryItems.filter(\.checked).count
                                    await GroceryTripActivityService.shared.start(
                                        listTitle: "Grocery Trip",
                                        totalCount: total,
                                        checkedCount: checked
                                    )
                                    HapticManager.success()
                                }
                            } label: {
                                Label("Start shopping trip", systemImage: "cart.fill.badge.plus")
                            }
                            .disabled(appState.groceryItems.isEmpty)
                        }
                    } label: {
                        Image(systemName: "wand.and.stars")
                    }
                    .accessibilityLabel("Quick add options")

                    Button {
                        showingAddItem = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add grocery item")
                }
            }
        }
        .sheet(isPresented: $showingAddItem) {
            AddGroceryItemView()
        }
        .sheet(isPresented: $showingVoiceAdd) {
            VoiceAddGrocerySheet()
        }
        .sheet(isPresented: $showingPhotoImport) {
            PhotoImportGrocerySheet()
        }
        .fullScreenCover(isPresented: $showingListScanner) {
            UnifiedScannerView(
                initialMode: .groceryList,
                allowModeSwitching: false
            ) { result in
                if case .text(let lines) = result, !lines.isEmpty {
                    scannedListLines = lines
                    showingScanReview = true
                }
            }
        }
        .sheet(isPresented: $showingScanReview) {
            TextImportGrocerySheet(
                recognisedLines: scannedListLines,
                sourceTag: "scan",
                title: "Review Scanned List"
            )
        }
        .sheet(item: $editingItem) { item in
            EditGroceryItemView(item: item)
        }
        // US-264: tap a recipe section header in By Recipe mode → open
        // the recipe detail without leaving the Grocery tab.
        .sheet(item: $inspectedRecipe) { recipe in
            RecipeDetailView(recipe: recipe)
        }
        .fullScreenCover(isPresented: $showingShoppingMode) {
            ShoppingModeView()
        }
        .alert("Clear Completed Items?", isPresented: $showingClearAlert) {
            Button("Clear", role: .destructive) {
                Task { try? await appState.clearCheckedGroceryItems() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will remove all checked items from your list.")
        }
        .refreshable {
            await appState.loadAllData()
        }
    }

    private func generateFromWeekPlan() async {
        isGenerating = true
        let weekStart = Date().weekDates.first ?? Date()
        let kidIds = appState.activeKidId.map { [$0] } ?? appState.kids.map(\.id)

        do {
            // US-264: returns both new items and the source-link rows
            // that map them back to the recipes/plan entries that
            // contributed. addGeneratedItems persists both atomically.
            let result = try await GroceryGeneratorService.generateFromMealPlan(
                weekStart: weekStart,
                kidIds: kidIds,
                appState: appState
            )
            if !result.items.isEmpty || !result.sources.isEmpty {
                try await GroceryGeneratorService.addGeneratedItems(result, appState: appState)
            } else {
                let toast = ToastManager.shared
                toast.info("No new items", message: "All ingredients are already on your list.")
            }
        } catch {
            ToastManager.shared.show(error, as: { .save(entity: "grocery list", underlying: $0) })
        }
        isGenerating = false
    }
}

// MARK: - Grocery Item Row

struct GroceryItemRow: View {
    @EnvironmentObject var appState: AppState
    let item: GroceryItem

    var body: some View {
        HStack(spacing: 12) {
            Button {
                Task { try? await appState.toggleGroceryItem(item.id) }
            } label: {
                Image(systemName: item.checked ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(item.checked ? .green : .secondary)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 2) {
                Text(item.name)
                    .font(.body)
                    .strikethrough(item.checked)
                    .foregroundStyle(item.checked ? .secondary : .primary)

                HStack(spacing: 8) {
                    Text("\(item.quantity.formatted()) \(item.unit)")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if let priority = item.priority, priority == "high" {
                        Label("High", systemImage: "exclamationmark.circle.fill")
                            .font(.caption2)
                            .foregroundStyle(.red)
                    }

                    if let aisle = item.aisle {
                        Text("Aisle: \(aisle)")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }
            }

            Spacer()

            if let notes = item.notes, !notes.isEmpty {
                Image(systemName: "note.text")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
    }
}

// MARK: - Add Grocery Item View

struct AddGroceryItemView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss

    @State private var name = ""
    @State private var category: FoodCategory = .protein
    // US-263: store-section taxonomy. Defaults to .other so the user
    // explicitly opts into a real aisle; auto-classification (US-266)
    // will pre-fill this for known item names.
    @State private var aisleSection: GroceryAisle = .other
    @State private var quantity: Double = 1
    @State private var unit = "count"
    @State private var notes = ""
    @State private var priority = "medium"
    // US-243: optional unit price + locale-default currency
    @State private var pricePerUnit: Double = 0

    private let units = ["count", "oz", "lb", "g", "kg", "cups", "tbsp", "tsp", "ml", "l"]
    private let priorities = ["low", "medium", "high"]

    /// US-263: aisles sorted by typical store walk order (produce first,
    /// other last) so the picker matches in-store routing.
    private var sortedAisles: [GroceryAisle] {
        GroceryAisle.allCases.sorted()
    }

    // US-225: autocomplete from grocery history
    private var suggestions: [GrocerySuggestion] {
        GrocerySuggestionEngine.suggestions(
            for: name,
            history: appState.groceryItems,
            pantry: appState.foods,
            limit: 5
        )
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Item Details") {
                    TextField("Item name", text: $name)

                    if !suggestions.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(suggestions) { suggestion in
                                    Button {
                                        apply(suggestion)
                                    } label: {
                                        HStack(spacing: 4) {
                                            Text(FoodCategory(rawValue: suggestion.category)?.icon ?? "🛒")
                                                .font(.caption)
                                            Text(suggestion.name)
                                                .font(.caption)
                                                .lineLimit(1)
                                        }
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 6)
                                        .background(Color.green.opacity(0.12), in: Capsule())
                                        .foregroundStyle(.primary)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel("Use suggestion \(suggestion.name)")
                                }
                            }
                            .padding(.vertical, 2)
                        }
                        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                    }

                    Picker("Aisle", selection: $aisleSection) {
                        ForEach(sortedAisles, id: \.self) { aisle in
                            Label(aisle.displayName, systemImage: aisle.icon).tag(aisle)
                        }
                    }
                    .onChange(of: aisleSection) { _, newAisle in
                        category = newAisle.derivedFoodCategory
                    }

                    Picker("Nutrition Category", selection: $category) {
                        ForEach(FoodCategory.allCases, id: \.self) { cat in
                            Text("\(cat.icon) \(cat.displayName)").tag(cat)
                        }
                    }
                }

                Section("Quantity") {
                    HStack {
                        TextField("Qty", value: $quantity, format: .number)
                            .keyboardType(.decimalPad)
                            .frame(width: 80)

                        Picker("Unit", selection: $unit) {
                            ForEach(units, id: \.self) { u in
                                Text(u).tag(u)
                            }
                        }
                    }
                }

                Section("Priority") {
                    Picker("Priority", selection: $priority) {
                        ForEach(priorities, id: \.self) { p in
                            Text(p.capitalized).tag(p)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                // US-243: optional price per unit. Empty (0) is treated as
                // "untracked" by the budget view — no fake $0.00 totals.
                Section {
                    HStack {
                        Text("Price")
                        Spacer()
                        TextField("Optional", value: $pricePerUnit, format: .number.precision(.fractionLength(0...2)))
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 100)
                            .monospacedDigit()
                        Text(BudgetService.defaultCurrencyCode)
                            .foregroundStyle(.tertiary)
                            .font(.caption)
                    }
                } header: {
                    Text("Price (optional)")
                } footer: {
                    Text("Skip if unknown — Budget will only count priced items.")
                        .font(.caption2)
                }

                Section("Notes") {
                    TextField("Optional notes", text: $notes, axis: .vertical)
                        .lineLimit(3)
                }
            }
            .navigationTitle("Add Item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task { await addItem() }
                    }
                    .disabled(name.isEmpty)
                }
            }
        }
    }

    private func apply(_ suggestion: GrocerySuggestion) {
        name = suggestion.name
        if let cat = FoodCategory(rawValue: suggestion.category) {
            category = cat
        }
        if units.contains(suggestion.unit) {
            unit = suggestion.unit
        }
        if priorities.contains(suggestion.priority) {
            priority = suggestion.priority
        }
        HapticManager.selection()
    }

    private func addItem() async {
        // US-243: only persist a price when the user actually entered one
        // (zero is the sentinel for "untracked" — see Budget view logic).
        let resolvedPrice: Double? = pricePerUnit > 0 ? pricePerUnit : nil
        let resolvedCurrency: String? = resolvedPrice != nil
            ? BudgetService.defaultCurrencyCode
            : nil

        let item = GroceryItem(
            id: UUID().uuidString,
            userId: "",
            name: name,
            category: category.rawValue,
            quantity: quantity,
            unit: unit,
            checked: false,
            notes: notes.isEmpty ? nil : notes,
            priority: priority,
            addedVia: "manual",
            pricePerUnit: resolvedPrice,
            currency: resolvedCurrency,
            aisleSection: aisleSection.rawValue
        )

        try? await appState.addGroceryItem(item)
        dismiss()
    }
}

// MARK: - Edit Grocery Item View

struct EditGroceryItemView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss
    let item: GroceryItem

    @State private var name: String = ""
    @State private var category: FoodCategory = .protein
    // US-263: aisle taxonomy. Loaded from item.aisleSectionEnum on appear.
    @State private var aisleSection: GroceryAisle = .other
    @State private var quantity: Double = 1
    @State private var unit: String = "count"
    @State private var notes: String = ""
    @State private var priority: String = "medium"

    private let units = ["count", "oz", "lb", "g", "kg", "cups", "tbsp", "tsp", "ml", "l"]
    private let priorities = ["low", "medium", "high"]

    private var sortedAisles: [GroceryAisle] {
        GroceryAisle.allCases.sorted()
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Item Details") {
                    TextField("Item name", text: $name)

                    Picker("Aisle", selection: $aisleSection) {
                        ForEach(sortedAisles, id: \.self) { aisle in
                            Label(aisle.displayName, systemImage: aisle.icon).tag(aisle)
                        }
                    }
                    .onChange(of: aisleSection) { _, newAisle in
                        category = newAisle.derivedFoodCategory
                    }

                    Picker("Nutrition Category", selection: $category) {
                        ForEach(FoodCategory.allCases, id: \.self) { cat in
                            Text("\(cat.icon) \(cat.displayName)").tag(cat)
                        }
                    }
                }

                Section("Quantity") {
                    HStack {
                        Button {
                            quantity = max(0, quantity - 1)
                        } label: {
                            Image(systemName: "minus.circle.fill")
                                .font(.title2)
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)

                        TextField("Qty", value: $quantity, format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)

                        Button {
                            quantity += 1
                        } label: {
                            Image(systemName: "plus.circle.fill")
                                .font(.title2)
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)

                        Picker("Unit", selection: $unit) {
                            ForEach(units, id: \.self) { u in
                                Text(u).tag(u)
                            }
                        }
                        .labelsHidden()
                        .pickerStyle(.menu)
                    }
                }

                Section("Priority") {
                    Picker("Priority", selection: $priority) {
                        ForEach(priorities, id: \.self) { p in
                            Text(p.capitalized).tag(p)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                Section("Notes") {
                    TextField("Optional notes", text: $notes, axis: .vertical)
                        .lineLimit(3)
                }

                Section {
                    Button("Save Changes") {
                        Task { await save() }
                    }
                    .frame(maxWidth: .infinity)
                    .disabled(name.isEmpty)
                }
            }
            .navigationTitle("Edit Item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear {
                name = item.name
                category = FoodCategory(rawValue: item.category) ?? .protein
                aisleSection = item.aisleSectionEnum ?? .other
                quantity = item.quantity
                unit = item.unit
                notes = item.notes ?? ""
                priority = item.priority ?? "medium"
            }
        }
    }

    private func save() async {
        try? await appState.updateGroceryItem(
            item.id,
            updates: GroceryItemUpdate(
                name: name,
                category: category.rawValue,
                quantity: quantity,
                unit: unit,
                notes: notes.isEmpty ? nil : notes,
                priority: priority,
                aisleSection: aisleSection.rawValue
            )
        )
        dismiss()
    }
}

#Preview {
    NavigationStack {
        GroceryView()
    }
    .environmentObject(AppState())
}
