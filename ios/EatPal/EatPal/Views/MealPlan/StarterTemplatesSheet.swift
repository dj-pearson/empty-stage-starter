import SwiftUI

/// US-235: Browser + apply UI for the bundled starter meal-plan templates.
struct StarterTemplatesSheet: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss
    let weekStart: Date

    @State private var templates: [StarterMealPlanService.StarterTemplate] = []
    @State private var selectedTemplate: StarterMealPlanService.StarterTemplate?

    var body: some View {
        NavigationStack {
            List {
                if templates.isEmpty {
                    Section {
                        ContentUnavailableView(
                            "No starter templates",
                            systemImage: "tray",
                            description: Text("Starter templates couldn't be loaded.")
                        )
                    }
                } else {
                    Section {
                        ForEach(templates) { template in
                            Button {
                                selectedTemplate = template
                            } label: {
                                StarterTemplateRow(template: template)
                            }
                            .buttonStyle(.plain)
                        }
                    } footer: {
                        Text("Curated by EatPal — apply one and tweak from there.")
                            .font(.caption2)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Start from a template")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .sheet(item: $selectedTemplate) { template in
                StarterTemplateDetailSheet(
                    template: template,
                    weekStart: weekStart
                ) {
                    selectedTemplate = nil
                    dismiss()
                }
                .environmentObject(appState)
            }
            .onAppear {
                templates = StarterMealPlanService.allTemplates()
            }
        }
        .presentationDetents([.large])
    }
}

private struct StarterTemplateRow: View {
    let template: StarterMealPlanService.StarterTemplate

    private var ageLabel: String? {
        guard let lo = template.ageRangeMin, let hi = template.ageRangeMax else { return nil }
        return "Ages \(lo)–\(hi)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(template.name)
                    .font(.headline)
                Spacer()
                Text("Curated")
                    .font(.caption2)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.green.opacity(0.15), in: Capsule())
                    .foregroundStyle(.green)
            }

            Text(template.blurb)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            HStack(spacing: 6) {
                if let ageLabel {
                    Label(ageLabel, systemImage: "person.fill")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Label("\(template.meals.count) meals", systemImage: "calendar")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

private struct StarterTemplateDetailSheet: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss
    let template: StarterMealPlanService.StarterTemplate
    let weekStart: Date
    let onApplied: () -> Void

    @State private var isApplying = false

    private var conflicts: [(foodName: String, allergens: [String])] {
        guard let kidId = appState.activeKidId else { return [] }
        return StarterMealPlanService.conflictPreview(
            template,
            kidId: kidId,
            appState: appState
        )
    }

    private var groupedByDay: [(dayIndex: Int, meals: [StarterMealPlanService.StarterMeal])] {
        let dict = Dictionary(grouping: template.meals, by: { $0.dayIndex })
        return dict.keys.sorted().map { day in
            let sorted = (dict[day] ?? []).sorted { $0.mealSlot < $1.mealSlot }
            return (day, sorted)
        }
    }

    private static let dayNameFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "EEEE"
        return f
    }()

    private func dayName(_ index: Int) -> String {
        let date = Calendar.current.date(byAdding: .day, value: index, to: weekStart) ?? weekStart
        return Self.dayNameFormatter.string(from: date)
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(template.blurb)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } header: {
                    Text(template.name)
                }

                if !conflicts.isEmpty {
                    Section {
                        ForEach(conflicts, id: \.foodName) { row in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.foodName).font(.subheadline)
                                Text("Allergen: \(row.allergens.joined(separator: ", "))")
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            }
                        }
                    } header: {
                        Label(
                            "\(conflicts.count) meal\(conflicts.count == 1 ? "" : "s") will be skipped",
                            systemImage: "exclamationmark.triangle.fill"
                        )
                    } footer: {
                        Text("Conflicting foods are already in your pantry with allergens this child reacts to.")
                            .font(.caption2)
                    }
                }

                ForEach(groupedByDay, id: \.dayIndex) { day in
                    Section(dayName(day.dayIndex)) {
                        ForEach(day.meals, id: \.self) { meal in
                            HStack(spacing: 8) {
                                Image(systemName: MealSlot(rawValue: meal.mealSlot)?.icon ?? "fork.knife")
                                    .foregroundStyle(.green)
                                    .frame(width: 22)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(MealSlot(rawValue: meal.mealSlot)?.displayName ?? meal.mealSlot)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    Text(meal.foodName)
                                        .font(.subheadline)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Apply template")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Back") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isApplying ? "Applying…" : "Apply") {
                        Task { await apply() }
                    }
                    .disabled(appState.activeKidId == nil || isApplying)
                }
            }
        }
    }

    private func apply() async {
        guard let kidId = appState.activeKidId else { return }
        isApplying = true
        defer { isApplying = false }

        do {
            let result = try await StarterMealPlanService.apply(
                template,
                weekStart: weekStart,
                kidId: kidId,
                appState: appState
            )
            HapticManager.success()
            let allergenSuffix = result.allergenSkipCount > 0
                ? " — \(result.allergenSkipCount) skipped (\(result.allergenSkips.joined(separator: ", ")))"
                : ""
            ToastManager.shared.success(
                "Applied \(template.name)",
                message: "\(result.entriesCreated) meals · \(result.foodsCreated) new foods\(allergenSuffix)"
            )
            onApplied()
        } catch {
            HapticManager.error()
            ToastManager.shared.error("Couldn't apply template", message: error.localizedDescription)
        }
    }
}
