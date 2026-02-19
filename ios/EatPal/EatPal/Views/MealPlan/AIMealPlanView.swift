import SwiftUI

struct AIMealPlanView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss
    @StateObject private var aiService = AIMealService.shared

    let date: Date

    private var activeKid: Kid? {
        guard let kidId = appState.activeKidId else { return nil }
        return appState.kids.first { $0.id == kidId }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    // Context
                    VStack(spacing: 8) {
                        if let kid = activeKid {
                            Label("Suggestions for \(kid.name)", systemImage: "person.circle.fill")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        Text(DateFormatter.fullDisplay.string(from: date))
                            .font(.headline)
                    }
                    .padding()

                    // Generate Button
                    if aiService.suggestions.isEmpty && !aiService.isLoading {
                        Button {
                            Task { await generateSuggestions() }
                        } label: {
                            Label("Generate Suggestions", systemImage: "wand.and.stars")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding()
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.green)
                        .padding(.horizontal)
                    }

                    // Loading
                    if aiService.isLoading {
                        VStack(spacing: 12) {
                            ProgressView()
                                .scaleEffect(1.2)
                            Text("Generating meal ideas...")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 40)
                    }

                    // Error
                    if let error = aiService.errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                            .padding(.horizontal)
                    }

                    // Suggestions
                    if !aiService.suggestions.isEmpty {
                        ForEach(aiService.suggestions) { suggestion in
                            SuggestionCard(suggestion: suggestion) {
                                Task { await addSuggestionToPlan(suggestion) }
                            }
                        }
                        .padding(.horizontal)

                        // Add All button
                        Button {
                            Task { await addAllSuggestions() }
                        } label: {
                            Label("Add All to Plan", systemImage: "plus.circle.fill")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding()
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.green)
                        .padding(.horizontal)

                        // Regenerate
                        Button {
                            Task { await generateSuggestions() }
                        } label: {
                            Label("Regenerate", systemImage: "arrow.clockwise")
                                .font(.subheadline)
                        }
                        .padding(.top, 4)
                    }
                }
                .padding(.vertical)
            }
            .navigationTitle("AI Meal Plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
        .onDisappear {
            aiService.clearSuggestions()
        }
    }

    private func generateSuggestions() async {
        guard let kid = activeKid else { return }

        let recentEntries = appState.planEntries
            .sorted { ($0.date) > ($1.date) }
            .prefix(21)

        await aiService.generateSuggestions(
            kid: kid,
            date: date,
            foods: appState.foods,
            recentEntries: Array(recentEntries),
            allFoods: appState.foods
        )
    }

    private func addSuggestionToPlan(_ suggestion: AIMealService.MealSuggestion) async {
        guard let kidId = appState.activeKidId else { return }

        let foodId = suggestion.foodId ?? ""
        let entry = PlanEntry(
            id: UUID().uuidString,
            userId: "",
            kidId: kidId,
            date: DateFormatter.isoDate.string(from: date),
            mealSlot: suggestion.mealSlot,
            foodId: foodId
        )
        try? await appState.addPlanEntry(entry)
        HapticManager.success()
    }

    private func addAllSuggestions() async {
        for suggestion in aiService.suggestions {
            await addSuggestionToPlan(suggestion)
        }
        let toast = ToastManager.shared
        toast.success("All added", message: "\(aiService.suggestions.count) meals added to plan.")
        dismiss()
    }
}

// MARK: - Suggestion Card

struct SuggestionCard: View {
    let suggestion: AIMealService.MealSuggestion
    let onAdd: () -> Void

    private var slotDisplay: String {
        MealSlot(rawValue: suggestion.mealSlot)?.displayName ?? suggestion.mealSlot.capitalized
    }

    private var slotIcon: String {
        MealSlot(rawValue: suggestion.mealSlot)?.icon ?? "fork.knife"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: slotIcon)
                    .foregroundStyle(.green)
                Text(slotDisplay)
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(.secondary)
                Spacer()
            }

            Text(suggestion.foodName)
                .font(.headline)

            Text(suggestion.reasoning)
                .font(.caption)
                .foregroundStyle(.secondary)

            if let note = suggestion.nutritionNote, !note.isEmpty {
                Label(note, systemImage: "leaf.fill")
                    .font(.caption2)
                    .foregroundStyle(.green)
            }

            Button(action: onAdd) {
                Label("Add to Plan", systemImage: "plus.circle")
                    .font(.subheadline)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .tint(.green)
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}
