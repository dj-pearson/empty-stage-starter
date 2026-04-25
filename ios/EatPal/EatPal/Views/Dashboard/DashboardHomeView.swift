import SwiftUI

struct DashboardHomeView: View {
    @EnvironmentObject var appState: AppState
    @State private var showingScanner = false
    @State private var showingAddFood = false
    @State private var scannedBarcode: ScannedBarcodeItem?

    /// US-240: First active kid that has neither a saved pickinessLevel nor
    /// strategies — these are the parents who will benefit most from the quiz.
    /// Returns nil once everyone has a profile set up.
    private var kidNeedingQuiz: Kid? {
        appState.kids.first { kid in
            let noPickiness = (kid.pickinessLevel ?? "").isEmpty
            let noStrategies = (kid.helpfulStrategies ?? []).isEmpty
            return noPickiness && noStrategies
        }
    }

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

                // US-240: Quiz nudge card for kids without a pickiness profile.
                // Auto-hides once they've taken the quiz so it doesn't nag.
                if let kid = kidNeedingQuiz {
                    PickyEaterQuizNudgeCard(kid: kid)
                }

                // Quick Stats
                QuickStatsGrid()

                // Quick Actions
                QuickActionsSection(
                    onAddFood: { showingAddFood = true },
                    onScanBarcode: { showingScanner = true }
                )
            }
            .padding()
        }
        .navigationTitle("Dashboard")
        .refreshable {
            await appState.loadAllData()
        }
        .fullScreenCover(isPresented: $showingScanner) {
            UnifiedScannerView(
                initialMode: .barcode,
                allowModeSwitching: false
            ) { result in
                if case .barcode(let code) = result {
                    scannedBarcode = ScannedBarcodeItem(code: code)
                }
            }
        }
        .sheet(isPresented: $showingAddFood) {
            AddFoodView()
        }
        .sheet(item: $scannedBarcode) { item in
            ScannedProductView(barcode: item.code)
        }
    }
}

/// Wrapper to make a scanned barcode identifiable for sheet presentation.
struct ScannedBarcodeItem: Identifiable {
    let id = UUID()
    let code: String
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
            DashboardStatCard(
                title: "Foods",
                value: "\(appState.foods.count)",
                icon: "leaf.fill",
                color: .green
            )
            DashboardStatCard(
                title: "Safe Foods",
                value: "\(appState.safeFoods.count)",
                icon: "checkmark.shield.fill",
                color: .blue
            )
            DashboardStatCard(
                title: "Recipes",
                value: "\(appState.recipes.count)",
                icon: "book.fill",
                color: .orange
            )
            DashboardStatCard(
                title: "Grocery Items",
                value: "\(appState.groceryItems.filter { !$0.checked }.count)",
                icon: "cart.fill",
                color: .purple
            )
        }
    }
}

struct DashboardStatCard: View {
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
    var onAddFood: () -> Void = {}
    var onScanBarcode: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Quick Actions")
                .font(.headline)

            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible()),
                GridItem(.flexible()),
            ], spacing: 12) {
                QuickActionButton(title: "Add Food", icon: "plus.circle.fill", color: .green, action: onAddFood)
                QuickActionButton(title: "Scan Barcode", icon: "barcode.viewfinder", color: .blue, action: onScanBarcode)
                QuickActionButton(title: "New Recipe", icon: "book.fill", color: .orange, action: {})
            }
        }
    }
}

struct QuickActionButton: View {
    let title: String
    let icon: String
    let color: Color
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
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
        .buttonStyle(.plain)
    }
}

// MARK: - Picky Eater Quiz Nudge (US-240)

/// Dashboard prompt shown when an active kid has no pickiness profile yet.
/// One tap opens the quiz pre-targeted to that kid; the result screen then
/// offers an "Apply to <name>" button that persists the personality result.
private struct PickyEaterQuizNudgeCard: View {
    let kid: Kid
    @State private var showingQuiz = false

    var body: some View {
        Button {
            showingQuiz = true
        } label: {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(Color.pink.opacity(0.18))
                        .frame(width: 48, height: 48)
                    Image(systemName: "questionmark.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.pink)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("Discover \(kid.name)'s eating style")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(.primary)
                    Text("8 questions • personalized strategies")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding()
            .background(
                LinearGradient(
                    colors: [Color.pink.opacity(0.08), Color.purple.opacity(0.05)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: RoundedRectangle(cornerRadius: 12)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(Color.pink.opacity(0.2), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showingQuiz) {
            PickyEaterQuizView(kid: kid)
        }
        .accessibilityLabel("Discover \(kid.name)'s eating style — take the picky-eater quiz")
    }
}

#Preview {
    NavigationStack {
        DashboardHomeView()
    }
    .environmentObject(AppState())
}
