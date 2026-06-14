import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var deepLinkHandler: DeepLinkHandler
    @State private var selectedTab: Tab = .planner
    /// US-405: navigation path for the More tab so deep links / notification
    /// taps can push the right sub-screen (kid profile, quiz, settings, …).
    @State private var morePath: [MoreRoute] = []

    enum Tab: String, CaseIterable {
        case planner
        case pantry
        case recipes
        case grocery
        case more

        var title: String {
            switch self {
            case .planner: return "Planner"
            case .pantry: return "Pantry"
            case .recipes: return "Recipes"
            case .grocery: return "Grocery"
            case .more: return "More"
            }
        }

        var icon: String {
            switch self {
            case .planner: return "calendar"
            case .pantry: return "refrigerator.fill"
            case .recipes: return "book.fill"
            case .grocery: return "cart.fill"
            case .more: return "ellipsis.circle.fill"
            }
        }
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            ForEach(Tab.allCases, id: \.self) { tab in
                tabContent(for: tab)
                    .tabItem {
                        Label(tab.title, systemImage: tab.icon)
                    }
                    .tag(tab)
            }
        }
        .tint(.green)
        .task {
            await appState.loadAllData()
            // US-245: First screen view of the session.
            AnalyticsService.screen("tab_\(selectedTab.rawValue)")
        }
        .onChange(of: selectedTab) { _, newTab in
            // US-245: One screen-view event per tab switch so funnels reflect
            // actual user navigation rather than just startup.
            AnalyticsService.screen("tab_\(newTab.rawValue)")
        }
        // US-405: route deep links / notification taps to the correct tab and
        // (for More sub-screens) push the right view, then clear so the same
        // link re-triggers next time.
        .onChange(of: deepLinkHandler.activeDestination) { _, destination in
            guard let destination else { return }
            route(to: destination)
        }
        .onAppear {
            if let destination = deepLinkHandler.activeDestination {
                route(to: destination)
            }
        }
    }

    /// Maps a parsed `DeepLinkHandler.Destination` onto tab selection and the
    /// More-tab navigation path. Import destinations are handled elsewhere
    /// (EatPalApp drains the queues) so they only need the tab switch.
    private func route(to destination: DeepLinkHandler.Destination) {
        switch destination {
        case .dashboard:
            selectedTab = .more
            morePath = [.dashboard]
        case .pantry:
            selectedTab = .pantry
        case .mealPlan:
            selectedTab = .planner
        case .recipes, .recipeImport:
            selectedTab = .recipes
        case .grocery, .groceryImport:
            selectedTab = .grocery
        case .scanner:
            // No standalone scanner screen; the barcode scanner lives on the
            // Pantry tab. Route there so the user can scan.
            selectedTab = .pantry
        case .kidProfile(let id):
            selectedTab = .more
            morePath = [.kidProfile(id: id)]
        case .quiz:
            selectedTab = .more
            morePath = [.quiz]
        case .foodChaining:
            selectedTab = .more
            morePath = [.foodChaining]
        case .settings:
            selectedTab = .more
            morePath = [.settings]
        case .progress:
            selectedTab = .more
            morePath = [.progress]
        }
        // AC4: clear so the identical link fires again next time.
        deepLinkHandler.clearDestination()
    }

    @ViewBuilder
    private func tabContent(for tab: Tab) -> some View {
        switch tab {
        case .planner:
            NavigationStack {
                MealPlanView()
            }
        case .pantry:
            NavigationStack {
                PantryView()
            }
        case .recipes:
            NavigationStack {
                RecipesView()
            }
        case .grocery:
            NavigationStack {
                GroceryView()
            }
        case .more:
            NavigationStack(path: $morePath) {
                MoreView()
            }
        }
    }
}

#Preview {
    MainTabView()
        .environmentObject(AppState())
        .environmentObject(AuthViewModel())
}
