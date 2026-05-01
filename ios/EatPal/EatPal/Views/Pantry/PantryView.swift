import SwiftUI
import TipKit

struct PantryView: View {
    @EnvironmentObject var appState: AppState
    @State private var searchText = ""
    @State private var selectedCategory: FoodCategory?
    @State private var filterMode: PantryFilter = .all
    @State private var showingAddFood = false
    @State private var showingBulkAdd = false
    @State private var showingScanner = false
    @State private var scannedBarcode: ScannedBarcodeItem?
    @State private var selectedFood: Food?
    @State private var showingFilters = false

    // US-226: bulk-select mode
    @State private var isSelecting = false
    @State private var selectedIds: Set<String> = []
    @State private var showingChangeCategory = false
    @State private var showingDeleteConfirm = false
    @State private var filterCategories: Set<FoodCategory> = []
    @State private var filterAllergens: Set<String> = []
    @State private var filterSafeOnly = false
    @State private var filterTryBiteOnly = false
    @State private var sortOption: FoodSortOption = .nameAsc

    private var swipeTip = SwipePantryTip()

    enum PantryFilter: String, CaseIterable {
        case all = "All"
        case safe = "Safe"
        case tryBite = "Try Bite"
    }

    private var hasActiveFilters: Bool {
        !filterCategories.isEmpty || !filterAllergens.isEmpty || filterSafeOnly || filterTryBiteOnly || sortOption != .nameAsc
    }

    private var activeFilterCount: Int {
        var count = filterCategories.count + filterAllergens.count
        if filterSafeOnly { count += 1 }
        if filterTryBiteOnly { count += 1 }
        if sortOption != .nameAsc { count += 1 }
        return count
    }

    private var availableAllergens: [String] {
        let all = appState.foods.compactMap(\.allergens).flatMap { $0 }
        return Array(Set(all)).sorted()
    }

    private var filteredFoods: [Food] {
        var foods = appState.foods

        // Apply quick category chip filter
        if let category = selectedCategory {
            foods = foods.filter { $0.category == category.rawValue }
        }

        // Apply quick segment filter
        switch filterMode {
        case .all: break
        case .safe: foods = foods.filter(\.isSafe)
        case .tryBite: foods = foods.filter(\.isTryBite)
        }

        // Apply advanced filters
        foods = FoodFilterEngine.apply(
            foods: foods,
            searchText: searchText,
            categories: filterCategories,
            excludeAllergens: filterAllergens,
            safeOnly: filterSafeOnly,
            tryBiteOnly: filterTryBiteOnly,
            sortOption: sortOption
        )

        return foods
    }

    private var groupedFoods: [(String, [Food])] {
        Dictionary(grouping: filteredFoods, by: { $0.category })
            .sorted { $0.key < $1.key }
    }

    var body: some View {
        List {
            // Category Chips
            Section {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        CategoryChip(
                            title: "All",
                            isSelected: selectedCategory == nil
                        ) {
                            selectedCategory = nil
                        }

                        ForEach(FoodCategory.allCases, id: \.self) { category in
                            CategoryChip(
                                title: "\(category.icon) \(category.displayName)",
                                isSelected: selectedCategory == category
                            ) {
                                selectedCategory = selectedCategory == category ? nil : category
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
                .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
            }

            // Filter Picker
            Section {
                Picker("Filter", selection: $filterMode) {
                    ForEach(PantryFilter.allCases, id: \.self) { filter in
                        Text(filter.rawValue).tag(filter)
                    }
                }
                .pickerStyle(.segmented)
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                .popoverTip(swipeTip)
            }

            // Foods List
            if appState.isLoading && appState.foods.isEmpty {
                Section {
                    ForEach(0..<5, id: \.self) { _ in
                        SkeletonView(shape: .foodRow)
                    }
                }
            } else if groupedFoods.isEmpty {
                Section {
                    ContentUnavailableView(
                        "No Foods",
                        systemImage: "leaf.fill",
                        description: Text("Add foods to your pantry to get started.")
                    )
                }
            } else {
                ForEach(groupedFoods, id: \.0) { category, foods in
                    Section {
                        ForEach(foods) { food in
                            HStack(spacing: 12) {
                                if isSelecting {
                                    Image(systemName: selectedIds.contains(food.id) ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(selectedIds.contains(food.id) ? .green : .secondary)
                                        .imageScale(.large)
                                        .accessibilityLabel(selectedIds.contains(food.id) ? "Selected" : "Not selected")
                                }
                                FoodRowView(food: food)
                            }
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    if isSelecting {
                                        toggleSelection(food.id)
                                    } else {
                                        selectedFood = food
                                    }
                                }
                                .draggable(FoodTransferable(food: food)) {
                                    // Drag preview
                                    HStack(spacing: 8) {
                                        Text(FoodCategory(rawValue: food.category)?.icon ?? "🍽")
                                        Text(food.name)
                                            .font(.subheadline)
                                            .fontWeight(.medium)
                                    }
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 8))
                                    .shadow(radius: 4)
                                }
                                .swipeActions(edge: .leading, allowsFullSwipe: !isSelecting) {
                                    if !isSelecting {
                                        Button {
                                            HapticManager.lightImpact()
                                            Task {
                                                try? await appState.updateFood(
                                                    food.id,
                                                    updates: FoodUpdate(quantity: (food.quantity ?? 0) + 1)
                                                )
                                                await TipEvents.didSwipePantry.donate()
                                            }
                                        } label: {
                                            Label("+1", systemImage: "plus.circle.fill")
                                        }
                                        .tint(.green)
                                        .accessibilityLabel("Add one \(food.name) to pantry")

                                        Button {
                                            HapticManager.selection()
                                            Task {
                                                try? await appState.updateFood(
                                                    food.id,
                                                    updates: FoodUpdate(isSafe: !food.isSafe)
                                                )
                                                await TipEvents.didSwipePantry.donate()
                                            }
                                        } label: {
                                            Label(
                                                food.isSafe ? "Unsafe" : "Safe",
                                                systemImage: food.isSafe ? "xmark.shield" : "checkmark.shield"
                                            )
                                        }
                                        .tint(food.isSafe ? .orange : .blue)
                                    }
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: !isSelecting) {
                                    if !isSelecting {
                                        Button(role: .destructive) {
                                            HapticManager.error()
                                            Task { try? await appState.deleteFood(food.id) }
                                        } label: {
                                            Label("Delete", systemImage: "trash")
                                        }

                                        Button {
                                            HapticManager.success()
                                            Task {
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
                                                ToastManager.shared.success(
                                                    "Added to grocery",
                                                    message: food.name
                                                )
                                                await TipEvents.didSwipePantry.donate()
                                            }
                                        } label: {
                                            Label("Grocery", systemImage: "cart.fill.badge.plus")
                                        }
                                        .tint(.blue)
                                        .accessibilityLabel("Add \(food.name) to grocery list")
                                    }
                                }
                                .contextMenu {
                                    if !isSelecting {
                                        Button {
                                            HapticManager.success()
                                            Task {
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
                                                ToastManager.shared.success("Added to grocery", message: food.name)
                                            }
                                        } label: {
                                            Label("Add to Grocery", systemImage: "cart.fill.badge.plus")
                                        }

                                        Button {
                                            HapticManager.selection()
                                            Task {
                                                try? await appState.updateFood(
                                                    food.id,
                                                    updates: FoodUpdate(isSafe: !food.isSafe)
                                                )
                                            }
                                        } label: {
                                            Label(
                                                food.isSafe ? "Mark Unsafe" : "Mark Safe",
                                                systemImage: food.isSafe ? "xmark.shield" : "checkmark.shield"
                                            )
                                        }

                                        Button {
                                            HapticManager.selection()
                                            Task {
                                                try? await appState.updateFood(
                                                    food.id,
                                                    updates: FoodUpdate(isTryBite: !food.isTryBite)
                                                )
                                            }
                                        } label: {
                                            Label(
                                                food.isTryBite ? "Clear Try Bite" : "Mark Try Bite",
                                                systemImage: food.isTryBite ? "star.slash" : "star.fill"
                                            )
                                        }

                                        Divider()

                                        Button {
                                            selectedFood = food
                                        } label: {
                                            Label("Edit", systemImage: "pencil")
                                        }

                                        Button(role: .destructive) {
                                            HapticManager.error()
                                            Task { try? await appState.deleteFood(food.id) }
                                        } label: {
                                            Label("Delete", systemImage: "trash")
                                        }
                                    }
                                }
                        }
                    } header: {
                        let cat = FoodCategory(rawValue: category)
                        Text("\(cat?.icon ?? "") \(cat?.displayName ?? category) (\(foods.count))")
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(isSelecting ? "\(selectedIds.count) selected" : "Pantry")
        .searchable(text: $searchText, prompt: "Search foods...")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                HStack(spacing: 12) {
                    if isSelecting {
                        Button("Done") {
                            isSelecting = false
                            selectedIds.removeAll()
                        }
                        .fontWeight(.semibold)
                    } else {
                        Button {
                            showingFilters = true
                        } label: {
                            ZStack(alignment: .topTrailing) {
                                Image(systemName: "line.3.horizontal.decrease.circle")
                                if hasActiveFilters {
                                    Text("\(activeFilterCount)")
                                        .font(.system(size: 10, weight: .bold))
                                        .foregroundStyle(.white)
                                        .frame(width: 16, height: 16)
                                        .background(.red, in: Circle())
                                        .offset(x: 6, y: -6)
                                }
                            }
                        }
                        .accessibilityLabel("Filter and sort")

                        Button {
                            showingScanner = true
                        } label: {
                            Image(systemName: "barcode.viewfinder")
                        }
                        .accessibilityLabel("Scan barcode")

                        Menu {
                            Button {
                                isSelecting = true
                            } label: {
                                Label("Select multiple", systemImage: "checkmark.circle")
                            }
                            Divider()
                            Button {
                                showingAddFood = true
                            } label: {
                                Label("Add one food", systemImage: "plus.circle")
                            }
                            Button {
                                showingBulkAdd = true
                            } label: {
                                Label("Bulk add (paste list)", systemImage: "doc.on.clipboard")
                            }
                        } label: {
                            Image(systemName: "plus")
                        }
                        .accessibilityLabel("Add food")
                    }
                }
            }

            // US-226: bottom action bar visible only in selection mode
            ToolbarItemGroup(placement: .bottomBar) {
                if isSelecting {
                    Button {
                        Task { await bulkSetSafe(true) }
                    } label: {
                        Label("Safe", systemImage: "checkmark.shield")
                    }
                    .disabled(selectedIds.isEmpty)

                    Spacer()

                    Button {
                        Task { await bulkSetTryBite(true) }
                    } label: {
                        Label("Try Bite", systemImage: "star")
                    }
                    .disabled(selectedIds.isEmpty)

                    Spacer()

                    Button {
                        Task { await bulkAddToGrocery() }
                    } label: {
                        Label("Grocery", systemImage: "cart.badge.plus")
                    }
                    .disabled(selectedIds.isEmpty)

                    Spacer()

                    Button {
                        showingChangeCategory = true
                    } label: {
                        Label("Category", systemImage: "tag")
                    }
                    .disabled(selectedIds.isEmpty)

                    Spacer()

                    Button(role: .destructive) {
                        showingDeleteConfirm = true
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                    .disabled(selectedIds.isEmpty)
                }
            }
        }
        .sheet(isPresented: $showingAddFood) {
            AddFoodView()
        }
        .sheet(isPresented: $showingBulkAdd) {
            BulkAddFoodSheet()
                .environmentObject(appState)
        }
        .confirmationDialog(
            "Change category for \(selectedIds.count) food\(selectedIds.count == 1 ? "" : "s")",
            isPresented: $showingChangeCategory,
            titleVisibility: .visible
        ) {
            ForEach(FoodCategory.allCases, id: \.self) { cat in
                Button("\(cat.icon) \(cat.displayName)") {
                    Task { await bulkChangeCategory(to: cat) }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .alert(
            "Delete \(selectedIds.count) food\(selectedIds.count == 1 ? "" : "s")?",
            isPresented: $showingDeleteConfirm
        ) {
            Button("Delete", role: .destructive) {
                Task { await bulkDelete() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This can't be undone.")
        }
        .sheet(item: $selectedFood) { food in
            FoodDetailView(food: food)
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
        .sheet(item: $scannedBarcode) { item in
            ScannedProductView(barcode: item.code)
        }
        .sheet(isPresented: $showingFilters) {
            SearchFilterView(
                selectedCategories: $filterCategories,
                selectedAllergens: $filterAllergens,
                safeOnly: $filterSafeOnly,
                tryBiteOnly: $filterTryBiteOnly,
                sortOption: $sortOption,
                availableAllergens: availableAllergens
            )
            .presentationDetents([.medium, .large])
        }
        .refreshable {
            await appState.loadAllData()
        }
    }

    // MARK: - Bulk-select helpers (US-226)

    private func toggleSelection(_ id: String) {
        if selectedIds.contains(id) {
            selectedIds.remove(id)
        } else {
            selectedIds.insert(id)
        }
        HapticManager.selection()
    }

    private func selectedFoods() -> [Food] {
        appState.foods.filter { selectedIds.contains($0.id) }
    }

    // US-269: bulk methods now batch through `bulkUpdateFoods` /
    // `bulkDeleteFoods` so a 30-food selection costs one HTTP request,
    // not 30. Each method auto-exits select mode on success and clears
    // the selection set so the user lands cleanly back in browse mode.

    private func bulkSetSafe(_ value: Bool) async {
        guard !selectedIds.isEmpty else { return }
        let ids = selectedIds
        do {
            try await DataService.shared.bulkUpdateFoods(
                Array(ids),
                updates: FoodUpdate(isSafe: value)
            )
            // Mirror the change in-memory so the UI updates immediately.
            for i in appState.foods.indices where ids.contains(appState.foods[i].id) {
                appState.foods[i].isSafe = value
            }
            HapticManager.success()
            ToastManager.shared.success(
                value ? "Marked safe" : "Cleared safe",
                message: "\(ids.count) food\(ids.count == 1 ? "" : "s") updated"
            )
            exitSelectMode()
        } catch {
            ToastManager.shared.show(error, as: { .save(entity: "foods", underlying: $0) })
            HapticManager.error()
        }
    }

    private func bulkSetTryBite(_ value: Bool) async {
        guard !selectedIds.isEmpty else { return }
        let ids = selectedIds
        do {
            try await DataService.shared.bulkUpdateFoods(
                Array(ids),
                updates: FoodUpdate(isTryBite: value)
            )
            for i in appState.foods.indices where ids.contains(appState.foods[i].id) {
                appState.foods[i].isTryBite = value
            }
            HapticManager.success()
            ToastManager.shared.success(
                "Marked try-bite",
                message: "\(ids.count) food\(ids.count == 1 ? "" : "s") updated"
            )
            exitSelectMode()
        } catch {
            ToastManager.shared.show(error, as: { .save(entity: "foods", underlying: $0) })
            HapticManager.error()
        }
    }

    private func bulkAddToGrocery() async {
        guard !selectedIds.isEmpty else { return }
        do {
            try await appState.bulkMoveFoodsToGrocery(selectedIds)
            exitSelectMode()
        } catch {
            // toast already surfaced inside bulkMoveFoodsToGrocery
        }
    }

    private func bulkChangeCategory(to category: FoodCategory) async {
        guard !selectedIds.isEmpty else { return }
        do {
            try await appState.bulkSetFoodCategory(selectedIds, category: category.rawValue)
            exitSelectMode()
        } catch {
            // toast surfaced inside bulkSetFoodCategory
        }
    }

    private func bulkDelete() async {
        guard !selectedIds.isEmpty else { return }
        do {
            try await appState.bulkDeleteFoods(selectedIds)
            exitSelectMode()
        } catch {
            // toast surfaced inside bulkDeleteFoods
        }
    }

    private func exitSelectMode() {
        selectedIds.removeAll()
        isSelecting = false
    }
}

// MARK: - Category Chip

struct CategoryChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline)
                .fontWeight(isSelected ? .semibold : .regular)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(
                    isSelected ? Color.green : Color(.systemGray5),
                    in: Capsule()
                )
                .foregroundStyle(isSelected ? .white : .primary)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Food Row

struct FoodRowView: View {
    @EnvironmentObject var appState: AppState
    let food: Food

    @State private var showQuantityAdjust = false

    private var displayQuantity: Double {
        food.quantity ?? 0
    }

    private var stockColor: Color {
        if displayQuantity <= 0 { return .red }
        if displayQuantity <= 2 { return .orange }
        return .secondary
    }

    var body: some View {
        HStack(spacing: 12) {
            let category = FoodCategory(rawValue: food.category)
            Text(category?.icon ?? "🍽")
                .font(.title2)

            VStack(alignment: .leading, spacing: 2) {
                Text(food.name)
                    .font(.body)
                    .fontWeight(.medium)
                    // US-230: visual cue that the food is past its expiry.
                    // The badge below carries the redundant text so VO is
                    // still informative when strikethrough is the only signal.
                    .strikethrough(food.isExpired, color: .red)
                    .foregroundStyle(food.isExpired ? .secondary : .primary)

                HStack(spacing: 6) {
                    if food.isSafe {
                        Label("Safe", systemImage: "checkmark.shield.fill")
                            .font(.caption2)
                            .foregroundStyle(.green)
                    }
                    if food.isTryBite {
                        Label("Try Bite", systemImage: "star.fill")
                            .font(.caption2)
                            .foregroundStyle(.orange)
                    }
                    if let allergens = food.allergens, !allergens.isEmpty {
                        Label("\(allergens.count) allergens", systemImage: "exclamationmark.triangle.fill")
                            .font(.caption2)
                            .foregroundStyle(.red)
                    }
                    // US-230: expiry chip — red dot for ≤3 days, full red
                    // 'Expired' chip when past, otherwise the days-until.
                    if let days = food.daysUntilExpiry {
                        ExpiryChip(days: days)
                    }
                }
            }

            Spacer()

            HStack(spacing: 4) {
                Button {
                    adjust(by: -1)
                } label: {
                    Image(systemName: "minus.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .disabled(displayQuantity <= 0)

                Button {
                    showQuantityAdjust = true
                } label: {
                    VStack(spacing: 0) {
                        Text(displayQuantity.formatted(.number.precision(.fractionLength(0...1))))
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundStyle(stockColor)
                            .monospacedDigit()
                        if let unit = food.unit, !unit.isEmpty {
                            Text(unit)
                                .font(.system(size: 9))
                                .foregroundStyle(.tertiary)
                        }
                    }
                    .frame(minWidth: 36)
                    .padding(.vertical, 2)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 6))
                }
                .buttonStyle(.plain)

                Button {
                    adjust(by: 1)
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
        .sheet(isPresented: $showQuantityAdjust) {
            QuantityAdjustSheet(food: food)
                .presentationDetents([.height(280)])
        }
    }

    private func adjust(by delta: Double) {
        let newQty = max(0, displayQuantity + delta)
        Task {
            try? await appState.updateFood(
                food.id,
                updates: FoodUpdate(quantity: newQty)
            )
        }
    }
}

// MARK: - Quantity Adjust Sheet

struct QuantityAdjustSheet: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss
    let food: Food

    @State private var draft: Double = 0

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Text(food.name)
                    .font(.headline)

                HStack(spacing: 16) {
                    Button {
                        draft = max(0, draft - 1)
                    } label: {
                        Image(systemName: "minus.circle.fill")
                            .font(.system(size: 32))
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)

                    TextField("Qty", value: $draft, format: .number)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.center)
                        .font(.title)
                        .fontWeight(.bold)
                        .frame(width: 100, height: 48)
                        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))

                    Button {
                        draft += 1
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 32))
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }

                HStack(spacing: 8) {
                    ForEach([-5, -2, 2, 5], id: \.self) { delta in
                        Button {
                            draft = max(0, draft + Double(delta))
                        } label: {
                            Text(delta > 0 ? "+\(delta)" : "\(delta)")
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal)

                Button {
                    Task {
                        try? await appState.updateFood(
                            food.id,
                            updates: FoodUpdate(quantity: draft)
                        )
                        dismiss()
                    }
                } label: {
                    Text("Save")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(.tint, in: RoundedRectangle(cornerRadius: 10))
                        .foregroundStyle(.white)
                        .fontWeight(.semibold)
                }
                .buttonStyle(.plain)
                .padding(.horizontal)
            }
            .padding()
            .navigationTitle("Adjust Quantity")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear {
                draft = food.quantity ?? 0
            }
        }
    }
}

// MARK: - Add Food View

struct AddFoodView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss

    @State private var name = ""
    @State private var category: FoodCategory = .protein
    @State private var isSafe = false
    @State private var isTryBite = false
    @State private var allergens = ""
    @State private var isSubmitting = false

    // US-230: optional expiry. Defaults to a sensible per-category window
    // when the user enables it (perishables → +7d, pantry → +30d).
    @State private var hasExpiry = false
    @State private var expiryDate: Date = Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date()

    var body: some View {
        NavigationStack {
            Form {
                Section("Food Details") {
                    TextField("Food name", text: $name)

                    Picker("Category", selection: $category) {
                        ForEach(FoodCategory.allCases, id: \.self) { cat in
                            Text("\(cat.icon) \(cat.displayName)").tag(cat)
                        }
                    }
                    .onChange(of: category) { _, newCategory in
                        // Bump the default forward when the user picks a less
                        // perishable category before enabling the toggle —
                        // they shouldn't see "+7d" while looking at carbs.
                        if !hasExpiry {
                            expiryDate = defaultExpiry(for: newCategory)
                        }
                    }
                }

                Section("Status") {
                    Toggle("Safe Food", isOn: $isSafe)
                    Toggle("Try Bite", isOn: $isTryBite)
                }

                // US-230: collapsed by default — user must opt in to add an
                // expiry. Most pantry items don't need one and we don't want
                // to nag with a date picker for every add.
                Section {
                    Toggle("Track expiry date", isOn: $hasExpiry.animation())

                    if hasExpiry {
                        DatePicker(
                            "Expires on",
                            selection: $expiryDate,
                            in: Date()...,
                            displayedComponents: .date
                        )
                    }
                } header: {
                    Text("Expiry")
                } footer: {
                    if hasExpiry {
                        Text("We'll surface this on the dashboard a few days before expiry and prefer it in AI meal suggestions.")
                            .font(.caption2)
                    }
                }

                Section("Allergens") {
                    TextField("Allergens (comma separated)", text: $allergens)
                        .textInputAutocapitalization(.never)
                }
            }
            .navigationTitle("Add Food")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task { await addFood() }
                    }
                    .disabled(name.isEmpty || isSubmitting)
                }
            }
            .onAppear {
                expiryDate = defaultExpiry(for: category)
            }
        }
    }

    /// Per-category default expiry window — fruit/veg/dairy/protein get the
    /// 7-day perishable default, carbs/snacks get 30. Pure heuristic; users
    /// always edit before saving anyway.
    private func defaultExpiry(for category: FoodCategory) -> Date {
        let days: Int
        switch category {
        case .fruit, .vegetable, .dairy, .protein: days = 7
        case .carb, .snack: days = 30
        }
        return Calendar.current.date(byAdding: .day, value: days, to: Date()) ?? Date()
    }

    private func addFood() async {
        isSubmitting = true
        let allergenList = allergens.isEmpty ? nil :
            allergens.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }

        let food = Food(
            id: UUID().uuidString,
            userId: "",
            name: name,
            category: category.rawValue,
            isSafe: isSafe,
            isTryBite: isTryBite,
            allergens: allergenList,
            expiryDate: hasExpiry ? DateFormatter.isoDate.string(from: expiryDate) : nil
        )

        try? await appState.addFood(food)
        dismiss()
    }
}

// MARK: - Food Detail View

struct FoodDetailView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss
    let food: Food

    @State private var name: String = ""
    @State private var category: FoodCategory = .protein
    @State private var isSafe: Bool = false
    @State private var isTryBite: Bool = false
    @State private var quantity: Double = 0
    @State private var unit: String = "count"

    // US-230
    @State private var hasExpiry: Bool = false
    @State private var expiryDate: Date = Date()

    private let units = ["count", "oz", "lb", "g", "kg", "cups", "tbsp", "tsp", "ml", "l", "servings"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Food Details") {
                    TextField("Name", text: $name)

                    Picker("Category", selection: $category) {
                        ForEach(FoodCategory.allCases, id: \.self) { cat in
                            Text("\(cat.icon) \(cat.displayName)").tag(cat)
                        }
                    }
                }

                Section("Inventory") {
                    HStack {
                        Button {
                            quantity = max(0, quantity - 1)
                        } label: {
                            Image(systemName: "minus.circle.fill")
                                .font(.title3)
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
                                .font(.title3)
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

                Section("Status") {
                    Toggle("Safe Food", isOn: $isSafe)
                    Toggle("Try Bite", isOn: $isTryBite)
                }

                // US-230: same opt-in pattern as AddFoodView so the editor
                // can also set, change, or clear an expiry on existing foods.
                Section {
                    Toggle("Track expiry date", isOn: $hasExpiry.animation())
                    if hasExpiry {
                        DatePicker(
                            "Expires on",
                            selection: $expiryDate,
                            displayedComponents: .date
                        )
                    }
                } header: {
                    Text("Expiry")
                }

                if let allergens = food.allergens, !allergens.isEmpty {
                    Section("Allergens") {
                        ForEach(allergens, id: \.self) { allergen in
                            Label(allergen, systemImage: "exclamationmark.triangle.fill")
                                .foregroundStyle(.red)
                        }
                    }
                }

                Section {
                    Button("Save Changes") {
                        Task {
                            // US-230: only send expiryDate when the toggle is
                            // on. Setting nil via Codable would just omit the
                            // field (encodeIfPresent), so existing values are
                            // preserved when the user leaves the toggle off.
                            // Clearing an existing date via this UI isn't
                            // wired (would need a sentinel-aware encoder); the
                            // workaround is to set it to a far-future date.
                            try? await appState.updateFood(
                                food.id,
                                updates: FoodUpdate(
                                    name: name,
                                    category: category.rawValue,
                                    isSafe: isSafe,
                                    isTryBite: isTryBite,
                                    quantity: quantity,
                                    unit: unit,
                                    expiryDate: hasExpiry
                                        ? DateFormatter.isoDate.string(from: expiryDate)
                                        : nil
                                )
                            )
                            dismiss()
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .navigationTitle("Edit Food")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear {
                name = food.name
                category = FoodCategory(rawValue: food.category) ?? .protein
                isSafe = food.isSafe
                isTryBite = food.isTryBite
                quantity = food.quantity ?? 0
                unit = food.unit ?? "count"
                if let raw = food.expiryDate, let date = DateFormatter.isoDate.date(from: raw) {
                    hasExpiry = true
                    expiryDate = date
                } else {
                    hasExpiry = false
                    expiryDate = Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date()
                }
            }
        }
    }
}

// MARK: - US-230 expiry chip

/// Compact expiry indicator surfaced in the pantry list. Color tier mirrors
/// the AppTheme semantic palette: red for expired, orange for ≤3 days,
/// muted secondary for everything else (only shown when ≤7 days remain so
/// rows don't get cluttered with months-away badges).
struct ExpiryChip: View {
    let days: Int

    private var label: String {
        if days < 0 { return "Expired" }
        if days == 0 { return "Today" }
        if days == 1 { return "1 day" }
        return "\(days)d"
    }

    private var color: Color {
        if days < 0 { return .red }
        if days <= 3 { return .orange }
        return .secondary
    }

    private var icon: String {
        if days < 0 { return "xmark.circle.fill" }
        if days <= 3 { return "circle.fill" }
        return "clock"
    }

    var body: some View {
        // Hide far-future expiries entirely — only surface what the user
        // can actually act on this week. Shaving the noise here keeps the
        // pantry row visually clean for the 90% of foods that aren't urgent.
        if days <= 7 {
            Label(label, systemImage: icon)
                .font(.caption2)
                .foregroundStyle(color)
                .accessibilityLabel(days < 0
                                    ? "Expired"
                                    : days == 0
                                        ? "Expires today"
                                        : "Expires in \(days) day\(days == 1 ? "" : "s")")
        }
    }
}

#Preview {
    NavigationStack {
        PantryView()
    }
    .environmentObject(AppState())
}
