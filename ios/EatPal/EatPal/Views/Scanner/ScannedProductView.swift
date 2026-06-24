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
    // US-421: a thrown error (offline / server / decode) is NOT the same as a
    // clean "not found" — surface it as retryable rather than telling the user
    // the product doesn't exist.
    @State private var lookupErrored = false

    // Editable fields (pre-filled from lookup)
    @State private var name = ""
    @State private var category: FoodCategory = .snack
    @State private var isSafe = false
    @State private var isTryBite = false
    @State private var allergens = ""
    @State private var isSubmitting = false
    // US-389: when a scan matches an existing pantry item, offer update vs add-new.
    @State private var duplicateMatch: Food?
    @State private var pendingFood: Food?
    // US-391: editable barcode so the user can correct a misread / type one in
    // and re-run the same lookup pipeline.
    @State private var currentBarcode: String = ""

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
                        if lookupErrored {
                            // US-421: transient/connection failure — retryable,
                            // don't claim the product doesn't exist.
                            Section {
                                Label(
                                    "Couldn't reach the lookup service. Check your connection and retry, or enter details manually.",
                                    systemImage: "wifi.exclamationmark"
                                )
                                .font(.callout)
                                .foregroundStyle(.orange)
                            }
                        } else if lookupFailed {
                            Section {
                                Label(
                                    "Product not found in database. Enter details manually, or correct the barcode and retry.",
                                    systemImage: "exclamationmark.circle"
                                )
                                .font(.callout)
                                .foregroundStyle(.orange)
                            }
                        }

                        if lookupFailed || lookupErrored {
                            // US-391: type/correct the barcode and re-run the
                            // same lookup pipeline, or fill details manually.
                            Section("Retry lookup") {
                                TextField("Type barcode", text: $currentBarcode)
                                    .keyboardType(.numberPad)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()

                                Button {
                                    Task { await lookupBarcode() }
                                } label: {
                                    Label("Retry lookup", systemImage: "arrow.clockwise")
                                }
                                .disabled(currentBarcode.trimmingCharacters(in: .whitespaces).isEmpty || isLoading)
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
            // US-389: dedup prompt when the scanned product already exists.
            .confirmationDialog(
                "Already in pantry",
                isPresented: Binding(
                    get: { duplicateMatch != nil },
                    set: { if !$0 { duplicateMatch = nil } }
                ),
                presenting: duplicateMatch
            ) { existing in
                Button("Update existing quantity") {
                    Task {
                        try? await appState.incrementFoodQuantity(existing.id, by: 1, unit: existing.unit)
                        dismiss()
                    }
                }
                Button("Add as new") {
                    if let pendingFood {
                        Task {
                            try? await appState.addFood(pendingFood)
                            dismiss()
                        }
                    }
                }
                Button("Cancel", role: .cancel) { duplicateMatch = nil }
            } message: { existing in
                Text("\(existing.name) is already in your pantry. Update its quantity or add a separate entry?")
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
        // US-391: seed the editable barcode from the scanned value on first run.
        if currentBarcode.isEmpty { currentBarcode = barcode }
        let code = currentBarcode.trimmingCharacters(in: .whitespaces)
        guard !code.isEmpty else { lookupFailed = true; return }

        isLoading = true
        lookupFailed = false
        lookupErrored = false
        do {
            if let result = try await BarcodeService.lookup(barcode: code) {
                product = result
                name = result.name
                category = FoodCategory(rawValue: result.category) ?? .snack
                allergens = result.allergens.joined(separator: ", ")
            } else {
                // Clean nil = the service answered and has no such product.
                lookupFailed = true
            }
        } catch {
            // US-421: a thrown error is transient/connectivity, not "not found".
            lookupErrored = true
        }
        isLoading = false
    }

    private func addFood() async {
        isSubmitting = true
        let allergenList = allergens.isEmpty ? nil :
            allergens.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }

        // US-230: barcode-scanned items get a sensible default expiry based
        // on category — perishables 7d, pantry 30d. The user can edit later
        // in FoodDetailView; this just removes the friction of opening that
        // editor right after a scan to set "produce expires next week".
        let defaultExpiryDays: Int = {
            switch category {
            case .fruit, .vegetable, .dairy, .protein: return 7
            case .carb, .snack: return 30
            }
        }()
        let expiryISO: String? = Calendar.current
            .date(byAdding: .day, value: defaultExpiryDays, to: Date())
            .map { DateFormatter.isoDate.string(from: $0) }

        // US-391: persist the effective (possibly user-corrected) barcode.
        let effectiveBarcode = currentBarcode.isEmpty ? barcode : currentBarcode

        let food = Food(
            id: UUID().uuidString,
            userId: "",
            name: name,
            category: category.rawValue,
            isSafe: isSafe,
            isTryBite: isTryBite,
            allergens: allergenList,
            barcode: effectiveBarcode,
            expiryDate: expiryISO
        )

        // US-389: a barcode (or name) match means this product is already in
        // the pantry — offer update-vs-add-new instead of silently inserting
        // a duplicate. Applies to the manual-entry (lookup-failed) path too,
        // which dedupes on name since it has no barcode match.
        if let existing = appState.existingPantryFood(name: name, barcode: effectiveBarcode) {
            duplicateMatch = existing
            pendingFood = food
            isSubmitting = false
            return
        }

        try? await appState.addFood(food)
        isSubmitting = false
        dismiss()
    }
}

#Preview {
    ScannedProductView(barcode: "5000159484695")
        .environmentObject(AppState())
}
