import SwiftUI

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
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    Button(role: .destructive) {
                                        Task { try? await appState.deleteFood(food.id) }
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                                .swipeActions(edge: .leading) {
                                    Button {
                                        Task {
                                            try? await appState.updateFood(
                                                food.id,
                                                updates: FoodUpdate(isSafe: !food.isSafe)
                                            )
                                        }
                                    } label: {
                                        Label(
                                            food.isSafe ? "Unsafe" : "Safe",
                                            systemImage: food.isSafe ? "xmark.shield" : "checkmark.shield"
                                        )
                                    }
                                    .tint(food.isSafe ? .orange : .green)
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
            BarcodeScannerView { barcode in
                scannedBarcode = ScannedBarcodeItem(code: barcode)
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
    let food: Food

    var body: some View {
        HStack(spacing: 12) {
            // Category icon
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

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
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
    @State private var isSafe: Bool = false
    @State private var isTryBite: Bool = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Food Details") {
                    TextField("Name", text: $name)

                    LabeledContent("Category") {
                        let cat = FoodCategory(rawValue: food.category)
                        Text("\(cat?.icon ?? "") \(cat?.displayName ?? food.category)")
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
                                    isSafe: isSafe,
                                    isTryBite: isTryBite
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
                isSafe = food.isSafe
                isTryBite = food.isTryBite
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
