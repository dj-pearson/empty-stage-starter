import SwiftUI

/// Shows product information after a successful barcode scan.
/// The user can adjust details before adding the food to their pantry.
struct ScannedProductView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss

    let barcode: String
    @State private var isLoading = true
    @State private var product: BarcodeService.ProductResult?
    @State private var lookupFailed = false

    // Editable fields (pre-filled from lookup)
    @State private var name = ""
    @State private var category: FoodCategory = .snack
    @State private var isSafe = false
    @State private var isTryBite = false
    @State private var allergens = ""
    @State private var isSubmitting = false

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    VStack(spacing: 16) {
                        ProgressView()
                        Text("Looking up barcode...")
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    Form {
                        if lookupFailed {
                            Section {
                                Label(
                                    "Product not found in database. Enter details manually.",
                                    systemImage: "exclamationmark.circle"
                                )
                                .font(.callout)
                                .foregroundStyle(.orange)
                            }
                        }

                        Section("Product Details") {
                            TextField("Food name", text: $name)

                            Picker("Category", selection: $category) {
                                ForEach(FoodCategory.allCases, id: \.self) { cat in
                                    Text("\(cat.icon) \(cat.displayName)").tag(cat)
                                }
                            }

                            LabeledContent("Barcode") {
                                Text(barcode)
                                    .foregroundStyle(.secondary)
                                    .font(.caption)
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

                        if let nutrition = product?.nutritionInfo,
                           nutrition.calories != nil {
                            Section("Nutrition (per 100g)") {
                                nutritionRow("Calories", value: nutrition.calories, unit: "kcal")
                                nutritionRow("Protein", value: nutrition.protein, unit: "g")
                                nutritionRow("Carbs", value: nutrition.carbs, unit: "g")
                                nutritionRow("Fat", value: nutrition.fat, unit: "g")
                                nutritionRow("Fiber", value: nutrition.fiber, unit: "g")
                                nutritionRow("Sugar", value: nutrition.sugar, unit: "g")
                            }
                        }

                        Section {
                            Button {
                                Task { await addFood() }
                            } label: {
                                HStack {
                                    Spacer()
                                    if isSubmitting {
                                        ProgressView()
                                            .tint(.white)
                                    }
                                    Text("Add to Pantry")
                                        .fontWeight(.semibold)
                                    Spacer()
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(.green)
                            .disabled(name.isEmpty || isSubmitting)
                            .listRowBackground(Color.clear)
                            .listRowInsets(EdgeInsets())
                        }
                    }
                }
            }
            .navigationTitle("Scanned Product")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .task {
                await lookupBarcode()
            }
        }
    }

    // MARK: - Helpers

    @ViewBuilder
    private func nutritionRow(_ label: String, value: Double?, unit: String) -> some View {
        if let value {
            LabeledContent(label) {
                Text(String(format: "%.1f %@", value, unit))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func lookupBarcode() async {
        isLoading = true
        do {
            if let result = try await BarcodeService.lookup(barcode: barcode) {
                product = result
                name = result.name
                category = FoodCategory(rawValue: result.category) ?? .snack
                allergens = result.allergens.joined(separator: ", ")
            } else {
                lookupFailed = true
            }
        } catch {
            lookupFailed = true
        }
        isLoading = false
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
            barcode: barcode
        )

        try? await appState.addFood(food)
        dismiss()
    }
}

#Preview {
    ScannedProductView(barcode: "5000159484695")
        .environmentObject(AppState())
}
