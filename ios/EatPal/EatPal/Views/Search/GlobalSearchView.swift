import SwiftUI

/// US-461: app-wide search surface launched from the Dashboard. Unlike the
/// per-tab `.searchable` fields, this looks across foods, recipes, grocery
/// items, and planned meals at once and deep-links each result to the right
/// place. Presented as a sheet so jumping to another tab (grocery / planner)
/// can dismiss cleanly.
struct GlobalSearchView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var query = ""
    /// Recent queries (most-recent-first JSON array) so an empty field still
    /// offers a one-tap way back to a previous search.
    @AppStorage("globalSearch.recents") private var recentsRaw = "[]"

    private let maxRecents = 8

    private var trimmedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var results: GlobalSearch.Results {
        GlobalSearch.run(
            query: query,
            foods: appState.foods,
            recipes: appState.recipes,
            grocery: appState.groceryItems,
            planEntries: appState.planEntries,
            resolvePlanTitle: planTitle(for:)
        )
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Search")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                    }
                }
                .searchable(
                    text: $query,
                    placement: .navigationBarDrawer(displayMode: .always),
                    prompt: "Foods, recipes, grocery, meals"
                )
                .onSubmit(of: .search) { rememberRecent(trimmedQuery) }
        }
    }

    // MARK: - Content states

    @ViewBuilder
    private var content: some View {
        if trimmedQuery.isEmpty {
            emptyQueryList
        } else if results.isEmpty {
            ContentUnavailableView.search(text: trimmedQuery)
        } else {
            resultsList
        }
    }

    private var emptyQueryList: some View {
        List {
            let recents = recentSearches
            if recents.isEmpty {
                Section {
                    ContentUnavailableView(
                        "Search everything",
                        systemImage: "magnifyingglass",
                        description: Text("Find foods, recipes, grocery items, and planned meals in one place.")
                    )
                }
            } else {
                Section("Recent") {
                    ForEach(recents, id: \.self) { term in
                        Button {
                            query = term
                        } label: {
                            Label(term, systemImage: "clock.arrow.circlepath")
                                .foregroundStyle(.primary)
                        }
                    }
                    Button("Clear recents", role: .destructive) {
                        recentsRaw = "[]"
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var resultsList: some View {
        List {
            if !results.foods.isEmpty {
                Section(header: groupHeader("Foods", count: results.foods.count)) {
                    ForEach(results.foods) { food in
                        NavigationLink {
                            FoodDetailView(food: food)
                        } label: {
                            resultRow(
                                icon: FoodCategory(rawValue: food.category)?.icon ?? "🍽",
                                title: food.name,
                                subtitle: food.category.capitalized
                            )
                        }
                    }
                }
            }

            if !results.recipes.isEmpty {
                Section(header: groupHeader("Recipes", count: results.recipes.count)) {
                    ForEach(results.recipes) { recipe in
                        NavigationLink {
                            RecipeDetailView(recipe: recipe)
                        } label: {
                            resultRow(
                                icon: "📖",
                                title: recipe.name,
                                subtitle: recipeSubtitle(recipe)
                            )
                        }
                    }
                }
            }

            if !results.grocery.isEmpty {
                Section(header: groupHeader("Grocery", count: results.grocery.count)) {
                    ForEach(results.grocery) { item in
                        Button {
                            route(to: .grocery)
                        } label: {
                            resultRow(
                                icon: item.checked ? "✅" : "🛒",
                                title: item.name,
                                subtitle: item.aisle ?? item.category.capitalized
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            if !results.plans.isEmpty {
                Section(header: groupHeader("Planner", count: results.plans.count)) {
                    ForEach(results.plans) { hit in
                        Button {
                            route(to: .mealPlan(date: hit.entry.date))
                        } label: {
                            resultRow(
                                icon: "📅",
                                title: hit.title,
                                subtitle: planSubtitle(hit.entry)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Row builders

    private func groupHeader(_ title: String, count: Int) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text("\(count)")
                .foregroundStyle(.secondary)
        }
    }

    private func resultRow(icon: String, title: String, subtitle: String?) -> some View {
        HStack(spacing: 12) {
            Text(icon)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
        }
    }

    // MARK: - Resolution helpers

    private func planTitle(for entry: PlanEntry) -> String {
        if let recipeId = entry.recipeId,
           let recipe = appState.recipes.first(where: { $0.id == recipeId }) {
            return recipe.name
        }
        if let food = appState.foods.first(where: { $0.id == entry.foodId }) {
            return food.name
        }
        return "Planned meal"
    }

    private func planSubtitle(_ entry: PlanEntry) -> String {
        let slot = MealSlot(rawValue: entry.mealSlot)?.displayName ?? entry.mealSlot.capitalized
        if let date = DateFormatter.isoDate.date(from: entry.date) {
            return "\(slot) · \(DateFormatter.shortDisplay.string(from: date))"
        }
        return slot
    }

    private func recipeSubtitle(_ recipe: Recipe) -> String {
        if let category = recipe.category, !category.isEmpty {
            return category.capitalized
        }
        return recipe.description ?? ""
    }

    // MARK: - Navigation / recents

    /// Switch to another tab via the shared DeepLinkHandler. The instance is
    /// the same singleton MainTabView observes, so setting `activeDestination`
    /// drives the tab switch. Dismiss the sheet first so it animates away to
    /// reveal the destination tab. (View members are MainActor-isolated, so
    /// the @MainActor handler can be set directly.)
    private func route(to destination: DeepLinkHandler.Destination) {
        rememberRecent(trimmedQuery)
        dismiss()
        DeepLinkHandler.shared.activeDestination = destination
    }

    private var recentSearches: [String] {
        guard let data = recentsRaw.data(using: .utf8),
              let list = try? JSONDecoder().decode([String].self, from: data)
        else { return [] }
        return list
    }

    private func rememberRecent(_ term: String) {
        let trimmed = term.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else { return }
        var list = recentSearches.filter { $0.caseInsensitiveCompare(trimmed) != .orderedSame }
        list.insert(trimmed, at: 0)
        list = Array(list.prefix(maxRecents))
        if let data = try? JSONEncoder().encode(list),
           let string = String(data: data, encoding: .utf8) {
            recentsRaw = string
        }
    }
}
