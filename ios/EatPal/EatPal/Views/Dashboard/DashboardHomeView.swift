import SwiftUI

struct DashboardHomeView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Kid Selector
                if !appState.kids.isEmpty {
                    KidSelectorView()
                }

                // Today's Meals Summary
                if let kidId = appState.activeKidId {
                    TodayMealSummaryCard(kidId: kidId)
                }

                // Quick Stats
                QuickStatsGrid()

                // Quick Actions
                QuickActionsSection()
            }
            .padding()
        }
        .navigationTitle("Dashboard")
        .refreshable {
            await appState.loadAllData()
        }
    }
}

// MARK: - Kid Selector

struct KidSelectorView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(appState.kids) { kid in
                    Button {
                        withAnimation { appState.activeKidId = kid.id }
                    } label: {
                        VStack(spacing: 6) {
                            ZStack {
                                Circle()
                                    .fill(appState.activeKidId == kid.id ? Color.green : Color(.systemGray5))
                                    .frame(width: 52, height: 52)

                                Text(String(kid.name.prefix(1)).uppercased())
                                    .font(.title2)
                                    .fontWeight(.bold)
                                    .foregroundStyle(appState.activeKidId == kid.id ? .white : .primary)
                            }

                            Text(kid.name)
                                .font(.caption)
                                .foregroundStyle(appState.activeKidId == kid.id ? .primary : .secondary)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 4)
        }
    }
}

// MARK: - Today's Meal Summary

struct TodayMealSummaryCard: View {
    @EnvironmentObject var appState: AppState
    let kidId: String

    private var todayEntries: [PlanEntry] {
        appState.planEntriesForDate(Date(), kidId: kidId)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Today's Meals")
                    .font(.headline)
                Spacer()
                Text(DateFormatter.shortDisplay.string(from: Date()))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if todayEntries.isEmpty {
                HStack {
                    Image(systemName: "calendar.badge.plus")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                    Text("No meals planned for today")
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
            } else {
                ForEach(MealSlot.allCases, id: \.self) { slot in
                    let entries = todayEntries.filter { $0.mealSlot == slot.rawValue }
                    if !entries.isEmpty {
                        HStack {
                            Image(systemName: slot.icon)
                                .foregroundStyle(.green)
                                .frame(width: 24)

                            Text(slot.displayName)
                                .font(.subheadline)
                                .fontWeight(.medium)

                            Spacer()

                            Text(foodNames(for: entries))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private func foodNames(for entries: [PlanEntry]) -> String {
        entries.compactMap { entry in
            appState.foods.first { $0.id == entry.foodId }?.name
        }.joined(separator: ", ")
    }
}

// MARK: - Quick Stats

struct QuickStatsGrid: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        LazyVGrid(columns: [
            GridItem(.flexible()),
            GridItem(.flexible()),
        ], spacing: 12) {
            StatCard(
                title: "Foods",
                value: "\(appState.foods.count)",
                icon: "leaf.fill",
                color: .green
            )
            StatCard(
                title: "Safe Foods",
                value: "\(appState.safeFoods.count)",
                icon: "checkmark.shield.fill",
                color: .blue
            )
            StatCard(
                title: "Recipes",
                value: "\(appState.recipes.count)",
                icon: "book.fill",
                color: .orange
            )
            StatCard(
                title: "Grocery Items",
                value: "\(appState.groceryItems.filter { !$0.checked }.count)",
                icon: "cart.fill",
                color: .purple
            )
        }
    }
}

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .foregroundStyle(color)
                Spacer()
            }
            Text(value)
                .font(.title)
                .fontWeight(.bold)
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Quick Actions

struct QuickActionsSection: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Quick Actions")
                .font(.headline)

            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible()),
                GridItem(.flexible()),
            ], spacing: 12) {
                QuickActionButton(title: "Add Food", icon: "plus.circle.fill", color: .green)
                QuickActionButton(title: "Scan Barcode", icon: "barcode.viewfinder", color: .blue)
                QuickActionButton(title: "New Recipe", icon: "book.fill", color: .orange)
            }
        }
    }
}

struct QuickActionButton: View {
    let title: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(color)

            Text(title)
                .font(.caption)
                .foregroundStyle(.primary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

#Preview {
    NavigationStack {
        DashboardHomeView()
    }
    .environmentObject(AppState())
}
