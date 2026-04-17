import SwiftUI
import TipKit

struct PantryView: View {
    @EnvironmentObject var appState: AppState
    @State private var searchText = ""
    @State private var selectedCategory: FoodCategory?
    @State private var filterMode: PantryFilter = .all
    @State private var showingAddFood = false
    @State private var showingScanner = false
    @State private var scannedBarcode: ScannedBarcodeItem?
    @State private var selectedFood: Food?
    @State private var showingFilters = false
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
                            FoodRowView(food: food)
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    selectedFood = food
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
                                .swipeActions(edge: .leading, allowsFullSwipe: true) {
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
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
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
                                .contextMenu {
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
                    } header: {
                        let cat = FoodCategory(rawValue: category)
                        Text("\(cat?.icon ?? "") \(cat?.displayName ?? category) (\(foods.count))")
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Pantry")
        .searchable(text: $searchText, prompt: "Search foods...")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                HStack(spacing: 12) {
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

                    Button {
                        showingAddFood = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add food")
                }
            }
        }
        .sheet(isPresented: $showingAddFood) {
            AddFoodView()
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
                }

                Section("Status") {
                    Toggle("Safe Food", isOn: $isSafe)
                    Toggle("Try Bite", isOn: $isTryBite)
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
        }
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
            allergens: allergenList
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
                            try? await appState.updateFood(
                                food.id,
                                updates: FoodUpdate(
                                    name: name,
                                    category: category.rawValue,
                                    isSafe: isSafe,
                                    isTryBite: isTryBite,
                                    quantity: quantity,
                                    unit: unit
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
            }
        }
    }
}

#Preview {
    NavigationStack {
        PantryView()
    }
    .environmentObject(AppState())
}
