import SwiftUI

struct AIMealPlanView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss
    @StateObject private var aiService = AIMealService.shared
    /// US-243: read the same UserDefault the Budget view writes — when set,
    /// gets passed to the edge function so the LLM prefers cheaper picks.
    @AppStorage("budget.weeklyTarget") private var weeklyTarget: Double = 0

    let date: Date

    /// US-238: optional fridge-detected ingredients passed to the planner.
    /// Set by the FridgePhotoSheet confirmation step; cleared on Close.
    @State private var fridgeIngredients: [String] = []
    @State private var showingFridgeSheet = false

    private var activeKid: Kid? {
        guard let kidId = appState.activeKidId else { return nil }
        return appState.kids.first { $0.id == kidId }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if activeKid == nil {
                        ContentUnavailableView(
                            "No Child Selected",
                            systemImage: "person.crop.circle.badge.plus",
                            description: Text("Add a child profile from the Dashboard to generate personalized meal suggestions.")
                        )
                        .padding(.top, 40)
                    } else {
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
                            VStack(spacing: 10) {
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

                                // US-238: alternate entry — snap a fridge photo,
                                // then generate using whatever the model recognized.
                                Button {
                                    showingFridgeSheet = true
                                } label: {
                                    Label("Plan from fridge photo", systemImage: "refrigerator.fill")
                                        .font(.subheadline)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 8)
                                }
                                .buttonStyle(.bordered)
                                .tint(.blue)
                            }
                            .padding(.horizontal)
                        }

                        // US-238: confirmed-from-fridge ingredients chip strip.
                        // Removable inline so the user can tweak before generating.
                        if !fridgeIngredients.isEmpty {
                            FridgeIngredientsChips(
                                names: fridgeIngredients,
                                onRemove: { name in
                                    fridgeIngredients.removeAll { $0 == name }
                                }
                            )
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

                            // US-238: items the plan needs but the fridge
                            // photo didn't include — one tap to add to grocery.
                            if !missingFromFridge.isEmpty {
                                MissingFromFridgeCard(
                                    missing: missingFromFridge,
                                    onAddToGrocery: { Task { await addMissingToGrocery() } }
                                )
                                .padding(.horizontal)
                            }

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
            .sheet(isPresented: $showingFridgeSheet) {
                FridgePhotoSheet { confirmed in
                    fridgeIngredients = confirmed
                    Task { await generateSuggestions() }
                }
            }
        }
        .onDisappear {
            aiService.clearSuggestions()
            fridgeIngredients = []
        }
    }

    /// US-238: ingredients the plan called for that the fridge photo did
    /// NOT include — i.e. what the user still needs to buy. Match is a
    /// case-insensitive substring against the suggestion's foodName.
    private var missingFromFridge: [AIMealService.MealSuggestion] {
        guard !fridgeIngredients.isEmpty else { return [] }
        let lowered = fridgeIngredients.map { $0.lowercased() }
        return aiService.suggestions.filter { suggestion in
            !lowered.contains { suggestion.foodName.lowercased().contains($0) }
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
            allFoods: appState.foods,
            // US-231: pass recipes + feedback so the prompt picks up
            // loved_meals / refused_meals enrichment when available.
            recipes: appState.recipes,
            feedback: appState.planEntryFeedback,
            // US-243: pass through the budget target so the LLM prefers
            // cheaper meals when one is configured. Zero = unset.
            weeklyBudget: weeklyTarget,
            // US-238: when the fridge sheet was used, the LLM gets a strong
            // signal about what's already on hand.
            availableIngredients: fridgeIngredients.isEmpty ? nil : fridgeIngredients
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

    /// US-238: bulk-create grocery items for everything the plan needs
    /// that the fridge photo didn't already have.
    private func addMissingToGrocery() async {
        var added = 0
        for suggestion in missingFromFridge {
            let item = GroceryItem(
                id: UUID().uuidString,
                userId: "",
                name: suggestion.foodName,
                category: "snack",  // unknown — user can re-categorize later
                quantity: 1,
                unit: "count",
                checked: false,
                addedVia: "ai"
            )
            do {
                try await appState.addGroceryItem(item)
                added += 1
            } catch {
                continue
            }
        }
        if added > 0 {
            ToastManager.shared.success(
                "Added to grocery",
                message: "\(added) item\(added == 1 ? "" : "s") to round out the plan."
            )
        }
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
