import SwiftUI

/// Sort options for food lists.
enum FoodSortOption: String, CaseIterable {
    case nameAsc = "Name (A–Z)"
    case nameDesc = "Name (Z–A)"
    case categoryAsc = "Category (A–Z)"
    case newestFirst = "Newest First"
    case oldestFirst = "Oldest First"
}

/// Advanced search & filter sheet for the pantry.
struct SearchFilterView: View {
    @Binding var selectedCategories: Set<FoodCategory>
    @Binding var selectedAllergens: Set<String>
    @Binding var safeOnly: Bool
    @Binding var tryBiteOnly: Bool
    @Binding var sortOption: FoodSortOption
    @Environment(\.dismiss) private var dismiss

    let availableAllergens: [String]

    private let commonAllergens = [
        "Milk", "Eggs", "Peanuts", "Tree Nuts", "Wheat",
        "Soy", "Fish", "Shellfish", "Sesame"
    ]

    var body: some View {
        NavigationStack {
            Form {
                // Sort
                Section("Sort By") {
                    Picker("Sort", selection: $sortOption) {
                        ForEach(FoodSortOption.allCases, id: \.self) { option in
                            Text(option.rawValue).tag(option)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }

                // Status filters
                Section("Status") {
                    Toggle("Safe Foods Only", isOn: $safeOnly)
                    Toggle("Try Bite Only", isOn: $tryBiteOnly)
                }

                // Category filters
                Section("Categories") {
                    ForEach(FoodCategory.allCases, id: \.self) { category in
                        Button {
                            if selectedCategories.contains(category) {
                                selectedCategories.remove(category)
                            } else {
                                selectedCategories.insert(category)
                            }
                        } label: {
                            HStack {
                                Text("\(category.icon) \(category.displayName)")
                                    .foregroundStyle(.primary)
                                Spacer()
                                if selectedCategories.contains(category) {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(.green)
                                }
                            }
                        }
                    }
                }

                // Allergen filters
                Section("Exclude Allergens") {
                    let allAllergens = mergedAllergens
                    if allAllergens.isEmpty {
                        Text("No allergens found in your pantry.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(allAllergens, id: \.self) { allergen in
                            Button {
                                if selectedAllergens.contains(allergen) {
                                    selectedAllergens.remove(allergen)
                                } else {
                                    selectedAllergens.insert(allergen)
                                }
                            } label: {
                                HStack {
                                    Image(systemName: "exclamationmark.triangle.fill")
                                        .foregroundStyle(.orange)
                                        .font(.caption)
                                    Text(allergen)
                                        .foregroundStyle(.primary)
                                    Spacer()
                                    if selectedAllergens.contains(allergen) {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(.green)
                                    }
                                }
                            }
                        }
                    }
                }

                // Reset
                Section {
                    Button("Reset All Filters", role: .destructive) {
                        selectedCategories.removeAll()
                        selectedAllergens.removeAll()
                        safeOnly = false
                        tryBiteOnly = false
                        sortOption = .nameAsc
                    }
                }
            }
            .navigationTitle("Filter & Sort")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private var mergedAllergens: [String] {
        var all = Set(commonAllergens)
        all.formUnion(availableAllergens)
        return all.sorted()
    }
}

/// Applies advanced filters and sorting to a food array.
enum FoodFilterEngine {
    static func apply(
        foods: [Food],
        searchText: String,
        categories: Set<FoodCategory>,
        excludeAllergens: Set<String>,
        safeOnly: Bool,
        tryBiteOnly: Bool,
        sortOption: FoodSortOption
    ) -> [Food] {
        var result = foods

        // Search
        if !searchText.isEmpty {
            let query = searchText.lowercased()
            result = result.filter { food in
                food.name.lowercased().contains(query) ||
                food.category.lowercased().contains(query) ||
                (food.aisle?.lowercased().contains(query) ?? false) ||
                (food.allergens?.contains { $0.lowercased().contains(query) } ?? false)
            }
        }

        // Category filter
        if !categories.isEmpty {
            result = result.filter { food in
                guard let cat = FoodCategory(rawValue: food.category) else { return false }
                return categories.contains(cat)
            }
        }

        // Status filters
        if safeOnly {
            result = result.filter(\.isSafe)
        }
        if tryBiteOnly {
            result = result.filter(\.isTryBite)
        }

        // Allergen exclusion
        if !excludeAllergens.isEmpty {
            result = result.filter { food in
                guard let allergens = food.allergens else { return true }
                let lowered = Set(allergens.map { $0.lowercased() })
                let excluded = Set(excludeAllergens.map { $0.lowercased() })
                return lowered.isDisjoint(with: excluded)
            }
        }

        // Sort
        switch sortOption {
        case .nameAsc:
            result.sort { $0.name.localizedCompare($1.name) == .orderedAscending }
        case .nameDesc:
            result.sort { $0.name.localizedCompare($1.name) == .orderedDescending }
        case .categoryAsc:
            result.sort {
                if $0.category == $1.category {
                    return $0.name.localizedCompare($1.name) == .orderedAscending
                }
                return $0.category < $1.category
            }
        case .newestFirst:
            result.sort { ($0.createdAt ?? "") > ($1.createdAt ?? "") }
        case .oldestFirst:
            result.sort { ($0.createdAt ?? "") < ($1.createdAt ?? "") }
        }

        return result
    }
}

#Preview {
    SearchFilterView(
        selectedCategories: .constant([]),
        selectedAllergens: .constant([]),
        safeOnly: .constant(false),
        tryBiteOnly: .constant(false),
        sortOption: .constant(.nameAsc),
        availableAllergens: ["Milk", "Eggs", "Peanuts"]
    )
}
