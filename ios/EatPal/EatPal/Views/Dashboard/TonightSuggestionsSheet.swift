import SwiftUI

/// US-293: The picker sheet that opens after tapping the Tonight Mode card.
/// Shows 3 suggestions with per-kid fit, prep minutes, missing-ingredients
/// chip, and a "Cook now" entry into hands-free cook mode.
struct TonightSuggestionsSheet: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @AppStorage("tonightMode.selectedKidIds") private var storedKidIdsRaw: String = ""
    @State private var selectedKidIds: Set<String> = []
    @State private var suggestions: [TonightModeService.Suggestion] = []
    @State private var loading = false
    @State private var loadStartedAt: Date?
    @State private var cookingRecipeId: String?

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Dinner tonight")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Close") { dismiss() }
                    }
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            Task { await reload() }
                        } label: {
                            Image(systemName: "arrow.clockwise")
                        }
                        .disabled(loading)
                        .accessibilityLabel("Refresh suggestions")
                    }
                }
        }
        .sheet(item: cookingRecipeBinding) { recipe in
            TonightCookSheet(recipe: recipe)
        }
        .task {
            initSelection()
            await reload()
        }
    }

    // MARK: - Layout

    @ViewBuilder
    private var content: some View {
        VStack(alignment: .leading, spacing: 12) {
            kidPicker
                .padding(.horizontal)
                .padding(.top, 8)

            if loading && suggestions.isEmpty {
                VStack(spacing: 12) {
                    ForEach(0..<3, id: \.self) { _ in
                        loadingRow
                    }
                }
                .padding(.horizontal)
            } else if suggestions.isEmpty {
                emptyState
                    .padding()
            } else {
                ScrollView {
                    VStack(spacing: 12) {
                        ForEach(Array(suggestions.enumerated()), id: \.element.id) { index, s in
                            SuggestionCard(
                                suggestion: s,
                                rank: index,
                                kids: appState.kids,
                                onCook: { onCook(s, rank: index) },
                                onAddMissing: { onAddMissing(s) }
                            )
                        }
                        if let top = suggestions.first, top.pantryCoveragePct < 0.4 {
                            deliveryFallback(top)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.bottom)
                }
            }
        }
    }

    private var kidPicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Cooking for")
                .font(.caption)
                .foregroundStyle(.secondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(appState.kids) { kid in
                        Toggle(isOn: kidBinding(for: kid.id)) {
                            Text(kid.name)
                                .font(.subheadline.weight(.medium))
                        }
                        .toggleStyle(KidChipToggleStyle())
                    }
                    if !selectedKidIds.isEmpty && selectedKidIds.count < appState.kids.count {
                        Button("All kids") {
                            selectedKidIds = Set(appState.kids.map(\.id))
                            persistSelection()
                            Task { await reload() }
                        }
                        .font(.caption)
                        .padding(.horizontal, 4)
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private var loadingRow: some View {
        RoundedRectangle(cornerRadius: 12)
            .fill(.gray.opacity(0.18))
            .frame(height: 110)
            .redacted(reason: .placeholder)
            .shimmering()
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "fork.knife.circle")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("Nothing matches your pantry yet.")
                .font(.headline)
            Text("Add a few staples or order a quick delivery to get going.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding()
    }

    private func deliveryFallback(_ top: TonightModeService.Suggestion) -> some View {
        HStack {
            Text("Best match still needs \(top.missingIngredients.count) item\(top.missingIngredients.count == 1 ? "" : "s")")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            Button {
                AnalyticsService.track(.tonightDeliveryFallbackChosen)
                dismiss()
            } label: {
                Label("Order missing", systemImage: "cart")
                    .font(.subheadline)
            }
            .buttonStyle(.bordered)
        }
        .padding(12)
        .background(Color.yellow.opacity(0.10), in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Actions

    private func onCook(_ s: TonightModeService.Suggestion, rank: Int) {
        AnalyticsService.track(.tonightSuggestionChosen(
            rank: rank,
            prepMinutes: s.prepMinutes,
            missingCount: s.missingIngredients.count
        ))
        cookingRecipeId = s.recipeId
    }

    private func onAddMissing(_ s: TonightModeService.Suggestion) {
        Task {
            for missing in s.missingIngredients {
                let item = GroceryItem.makeFromMissingIngredient(name: missing.name, sourceRecipeId: s.recipeId)
                try? await appState.addGroceryItem(item)
            }
            AnalyticsService.track(.tonightMissingAddedToGrocery(count: s.missingIngredients.count))
        }
    }

    private func reload() async {
        loading = true
        loadStartedAt = Date()
        let kidIds = selectedKidIds.isEmpty ? appState.kids.map(\.id) : Array(selectedKidIds)
        let result = await TonightModeService.fetchSuggestions(
            appState: appState,
            kidIds: kidIds
        )
        // fetchSuggestions is @MainActor, so we're already back on the
        // main actor — direct @State mutation is safe.
        suggestions = result
        loading = false
        let durationMs = Int(Date().timeIntervalSince(loadStartedAt ?? Date()) * 1000)
        AnalyticsService.track(.tonightModeLoaded(
            resultCount: result.count,
            durationMs: durationMs
        ))
    }

    private func initSelection() {
        let knownIds = Set(appState.kids.map(\.id))
        let stored = storedKidIdsRaw.split(separator: ",").map { String($0) }
        let restored = Set(stored).intersection(knownIds)
        selectedKidIds = restored.isEmpty ? knownIds : restored
    }

    private func persistSelection() {
        storedKidIdsRaw = selectedKidIds.sorted().joined(separator: ",")
    }

    private func kidBinding(for id: String) -> Binding<Bool> {
        Binding(
            get: { selectedKidIds.contains(id) },
            set: { isOn in
                if isOn {
                    selectedKidIds.insert(id)
                } else {
                    selectedKidIds.remove(id)
                    if selectedKidIds.isEmpty {
                        // Empty selection collapses back to "all kids"
                        selectedKidIds = Set(appState.kids.map(\.id))
                    }
                }
                persistSelection()
                Task { await reload() }
            }
        )
    }

    private var cookingRecipeBinding: Binding<Recipe?> {
        Binding(
            get: { appState.recipes.first { $0.id == cookingRecipeId } },
            set: { newValue in cookingRecipeId = newValue?.id }
        )
    }
}

// MARK: - Suggestion row

private struct SuggestionCard: View {
    let suggestion: TonightModeService.Suggestion
    let rank: Int
    let kids: [Kid]
    let onCook: () -> Void
    let onAddMissing: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                hero
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        if rank == 0 {
                            Text("Top pick")
                                .font(.caption2.bold())
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.orange.opacity(0.18), in: Capsule())
                                .foregroundStyle(.orange)
                        }
                        Text(suggestion.name)
                            .font(.headline)
                            .lineLimit(2)
                    }
                    metaRow
                }
            }
            kidFitRow
            actions
        }
        .padding(12)
        .background(.background, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(.gray.opacity(0.18)))
    }

    private var hero: some View {
        Group {
            if let urlString = suggestion.imageUrl, let url = URL(string: urlString) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .empty:    Color.gray.opacity(0.18)
                    case .success(let image): image.resizable().scaledToFill()
                    case .failure:  Image(systemName: "photo").foregroundStyle(.secondary)
                    @unknown default: Color.gray.opacity(0.18)
                    }
                }
            } else {
                Color.gray.opacity(0.18)
                    .overlay(Image(systemName: "fork.knife").foregroundStyle(.secondary))
            }
        }
        .frame(width: 64, height: 64)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var metaRow: some View {
        let pantryPct = Int((suggestion.pantryCoveragePct * 100).rounded())
        let missing = suggestion.missingIngredients.count
        return HStack(spacing: 8) {
            Label("\(suggestion.prepMinutes) min", systemImage: "clock")
            Text("•").foregroundStyle(.secondary)
            Text("\(pantryPct)% in pantry")
            if missing > 0 {
                Text("•").foregroundStyle(.secondary)
                Text("\(missing) missing")
            }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
    }

    private var kidFitRow: some View {
        HStack(spacing: 6) {
            ForEach(suggestion.kidFit) { fit in
                kidChip(for: fit)
            }
            Spacer(minLength: 0)
        }
    }

    private func kidChip(for fit: TonightModeService.KidFit) -> some View {
        let icon: String
        let color: Color
        let reason: String
        switch fit.status {
        case .ok:
            icon = "checkmark.circle.fill"
            color = .green
            reason = "Safe"
        case .warn:
            icon = "exclamationmark.triangle.fill"
            color = .orange
            reason = fit.blockingAversions.isEmpty
                ? "Has soft-blocked food"
                : "Has \(fit.blockingAversions.joined(separator: ", "))"
        case .allergen:
            icon = "xmark.octagon.fill"
            color = .red
            reason = "Contains allergen \(fit.allergenHits.joined(separator: ", "))"
        }
        return HStack(spacing: 4) {
            Image(systemName: icon)
            Text(fit.kidName)
        }
        .font(.caption2)
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(color.opacity(0.18), in: Capsule())
        .foregroundStyle(color)
        .accessibilityLabel("\(fit.kidName): \(reason)")
    }

    private var actions: some View {
        HStack {
            Button(action: onCook) {
                Label("Cook now", systemImage: "fork.knife")
                    .font(.subheadline.bold())
            }
            .buttonStyle(.borderedProminent)
            .tint(.orange)

            if suggestion.missingIngredients.count > 0 {
                Button(action: onAddMissing) {
                    Label("Add \(suggestion.missingIngredients.count)", systemImage: "cart.badge.plus")
                        .font(.subheadline)
                }
                .buttonStyle(.bordered)
            }
            Spacer(minLength: 0)
        }
    }
}

// MARK: - Toggle style

private struct KidChipToggleStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button {
            configuration.isOn.toggle()
        } label: {
            configuration.label
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(
                    configuration.isOn ? Color.accentColor : Color.gray.opacity(0.15),
                    in: Capsule()
                )
                .foregroundStyle(configuration.isOn ? Color.white : Color.primary)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Shimmer placeholder helper

private struct ShimmerModifier: ViewModifier {
    @State private var phase: CGFloat = 0
    func body(content: Content) -> some View {
        content
            .overlay(
                LinearGradient(
                    colors: [.clear, Color.white.opacity(0.4), .clear],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .rotationEffect(.degrees(20))
                .offset(x: phase)
                .blendMode(.plusLighter)
                .mask(content)
            )
            .onAppear {
                withAnimation(.linear(duration: 1.6).repeatForever(autoreverses: false)) {
                    phase = 300
                }
            }
    }
}

private extension View {
    func shimmering() -> some View { modifier(ShimmerModifier()) }
}

// MARK: - GroceryItem helper

private extension GroceryItem {
    static func makeFromMissingIngredient(name: String, sourceRecipeId: String) -> GroceryItem {
        // The iOS GroceryItem model doesn't carry source_recipe_id today;
        // we encode the link in addedVia so it survives the round-trip and
        // can be parsed by future Tonight-Mode follow-ups (e.g. clearing
        // missing chips when these get bought).
        GroceryItem(
            id: UUID().uuidString,
            userId: "",
            householdId: nil,
            groceryListId: nil,
            name: name,
            category: "snack",
            quantity: 1,
            unit: "",
            checked: false,
            notes: nil,
            aisle: nil,
            photoUrl: nil,
            barcode: nil,
            brandPreference: nil,
            priority: nil,
            addedVia: "tonight_mode:\(sourceRecipeId)",
            autoGenerated: false,
            pricePerUnit: nil,
            currency: nil,
            aisleSection: nil,
            createdAt: nil,
            updatedAt: nil
        )
    }
}

#Preview {
    TonightSuggestionsSheet()
        .environmentObject(AppState())
}
