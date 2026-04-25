import SwiftUI

/// US-244: Multi-line text → bulk Food creation.
/// Live-parsed preview rows that the user can edit (category) before
/// committing in one batched create call.
struct BulkAddFoodSheet: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss

    @State private var rawText: String = ""
    @State private var rows: [FoodBulkParser.ParsedRow] = []
    @State private var isSubmitting = false
    @State private var lastAddedIds: [String] = []
    @State private var showUndo = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextEditor(text: $rawText)
                        .frame(minHeight: 140)
                        .onChange(of: rawText) { _, newValue in
                            rows = FoodBulkParser.parse(newValue)
                        }
                        .accessibilityLabel("Paste a list of foods")
                } header: {
                    Text("Paste foods (one per line)")
                } footer: {
                    Text("Examples: `2 cups milk`, `broccoli, vegetable`, `chicken breast`. Category is auto-detected and editable below.")
                        .font(.caption2)
                }

                if !rows.isEmpty {
                    Section {
                        ForEach($rows) { $row in
                            HStack(spacing: 8) {
                                Text(row.category.icon)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(row.name)
                                        .font(.subheadline)
                                    if let qty = row.quantity {
                                        let unit = row.unit ?? ""
                                        Text("\(formatNumber(qty)) \(unit)".trimmingCharacters(in: .whitespaces))
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                Spacer()
                                Picker("", selection: $row.category) {
                                    ForEach(FoodCategory.allCases, id: \.self) { cat in
                                        Text(cat.displayName).tag(cat)
                                    }
                                }
                                .labelsHidden()
                            }
                        }
                        .onDelete { offsets in
                            rows.remove(atOffsets: offsets)
                        }
                    } header: {
                        Text("\(rows.count) item\(rows.count == 1 ? "" : "s") to add")
                    }
                }

                if showUndo, !lastAddedIds.isEmpty {
                    Section {
                        Button(role: .destructive) {
                            Task { await undoLastAdd() }
                        } label: {
                            Label(
                                "Undo last add (\(lastAddedIds.count) food\(lastAddedIds.count == 1 ? "" : "s"))",
                                systemImage: "arrow.uturn.backward"
                            )
                        }
                    }
                }
            }
            .navigationTitle("Bulk add")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSubmitting ? "Adding…" : "Add \(rows.count)") {
                        Task { await commit() }
                    }
                    .disabled(rows.isEmpty || isSubmitting)
                }
            }
        }
    }

    private func formatNumber(_ value: Double) -> String {
        if value.rounded() == value {
            return String(Int(value))
        }
        return String(format: "%.2f", value)
    }

    private func commit() async {
        guard !rows.isEmpty else { return }

        isSubmitting = true
        defer { isSubmitting = false }

        var added: [String] = []
        for row in rows {
            let food = Food(
                id: UUID().uuidString,
                userId: "",
                name: row.name,
                category: row.category.rawValue,
                isSafe: false,
                isTryBite: false,
                quantity: row.quantity,
                unit: row.unit
            )
            do {
                try await appState.addFood(food)
                added.append(food.id)
            } catch {
                continue
            }
        }

        HapticManager.success()
        lastAddedIds = added
        showUndo = !added.isEmpty
        ToastManager.shared.success(
            "Added \(added.count) food\(added.count == 1 ? "" : "s")",
            message: "Tap Done to close, or undo below."
        )

        // Clear the input + parsed rows so the user can paste another batch.
        rawText = ""
        rows = []
    }

    private func undoLastAdd() async {
        let ids = lastAddedIds
        lastAddedIds = []
        showUndo = false

        for id in ids {
            try? await appState.deleteFood(id)
        }

        HapticManager.warning()
        ToastManager.shared.info("Undone", message: "Removed \(ids.count) food\(ids.count == 1 ? "" : "s").")
    }
}
