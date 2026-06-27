import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var deepLinkHandler: DeepLinkHandler
    // US-373: Dashboard ("Home") is now the default landing tab.
    @State private var selectedTab: Tab = .home
    /// US-405: navigation path for the More tab so deep links / notification
    /// taps can push the right sub-screen (kid profile, quiz, settings, …).
    @State private var morePath: [MoreRoute] = []
    /// US-430: guard the full data load + realtime re-subscribe so it runs once
    /// per session, not every time `.task` re-attaches (background return,
    /// force-update gate toggle, auth flip). The view is recreated on a new
    /// session, which resets this flag and re-loads.
    @State private var didLoad = false

    enum Tab: String, CaseIterable {
        // US-373: Home (Dashboard) promoted to a primary tab; Recipes moved
        // into the More menu to stay within the 5-tab budget.
        case home
        case planner
        case pantry
        case grocery
        case more

        var title: String {
            switch self {
            case .home: return "Home"
            case .planner: return "Planner"
            case .pantry: return "Pantry"
            case .grocery: return "Grocery"
            case .more: return "More"
            }
        }

        var icon: String {
            switch self {
            case .home: return "square.grid.2x2.fill"
            case .planner: return "calendar"
            case .pantry: return "refrigerator.fill"
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
            // US-430: only run the full load once per session.
            guard !didLoad else { return }
            didLoad = true
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
            // US-373: Dashboard is now its own primary tab.
            selectedTab = .home
            morePath = []
        case .pantry:
            selectedTab = .pantry
        case .mealPlan:
            selectedTab = .planner
        case .recipes, .recipeImport:
            // US-373: Recipes now lives under More.
            selectedTab = .more
            morePath = [.recipes]
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
        case .foodTracker:
            // US-462: route the remaining Tools onto the More tab's path.
            selectedTab = .more
            morePath = [.foodTracker]
        case .insights:
            selectedTab = .more
            morePath = [.insights]
        case .aiCoach:
            selectedTab = .more
            morePath = [.aiCoach]
        }
        // AC4: clear so the identical link fires again next time.
        deepLinkHandler.clearDestination()
    }

    @ViewBuilder
    private func tabContent(for tab: Tab) -> some View {
        switch tab {
        case .home:
            NavigationStack {
                DashboardHomeView()
            }
        case .planner:
            NavigationStack {
                MealPlanView()
            }
        case .pantry:
            NavigationStack {
                PantryView()
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
