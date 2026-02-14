import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedTab: Tab = .planner

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
        }
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
            NavigationStack {
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
