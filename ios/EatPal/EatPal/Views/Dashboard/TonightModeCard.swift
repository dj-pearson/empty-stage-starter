import SwiftUI

/// US-293: Dashboard dinner card. When it's late afternoon/evening AND a
/// kid has no dinner planned, it's the prominent card on the screen.
/// Otherwise it shows as a small "Need ideas for tonight?" affordance.
///
/// The copy is deliberately calm. "Dinner in 20 minutes." under a flame read
/// as a countdown from 4pm onward, and that 5pm anxiety is exactly what
/// spills onto a child who struggles at the table.
struct TonightModeCard: View {
    @EnvironmentObject var appState: AppState
    @State private var showingSheet = false
    /// Re-read once a minute so a screen left open at 3:59pm switches over
    /// at 4pm, and back at 8pm, without waiting for some other re-render.
    @State private var now = Date()
    private let tick = Timer.publish(every: 60, on: .main, in: .common).autoconnect()

    private var showPanic: Bool {
        // Per kid: one child's dinner no longer hides the card while a
        // sibling has nothing planned.
        TonightModeService.shouldShowPanicCta(
            now: now,
            planEntries: appState.planEntries,
            kidIds: appState.kids.map(\.id)
        )
    }

    /// Kids with nothing planned for dinner today, for the card's copy.
    private var kidsWithoutDinner: [Kid] {
        let today = TonightModeService.todayIso(now)
        return appState.kids.filter { kid in
            !appState.planEntries.contains {
                $0.kidId == kid.id && $0.date == today && $0.mealSlot.lowercased() == "dinner"
            }
        }
    }

    var body: some View {
        Group {
            if appState.kids.isEmpty || appState.recipes.isEmpty {
                EmptyView()
            } else if showPanic {
                panicCard
            } else {
                inlineButton
            }
        }
        .onReceive(tick) { now = $0 }
        .sheet(isPresented: $showingSheet, onDismiss: trackDismissed) {
            TonightSuggestionsSheet()
                .environmentObject(appState)
        }
        .onChange(of: showPanic) { _, newValue in
            if newValue {
                AnalyticsService.track(.tonightModeCardShown(planEmpty: true))
            }
        }
        .onAppear {
            if showPanic {
                AnalyticsService.track(.tonightModeCardShown(planEmpty: true))
            }
        }
    }

    private var panicCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Dinner tonight", systemImage: "fork.knife")
                .font(.caption.bold())
                .foregroundStyle(.orange)

            Text(headline)
                .font(.title3.bold())
            Text("Here are 3 easy ideas from what's in your pantry, checked against everyone's allergies.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            Button {
                AnalyticsService.track(.tonightModeOpened(via: "panic_cta"))
                showingSheet = true
            } label: {
                Label("Help me with dinner", systemImage: "fork.knife")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
            }
            .buttonStyle(.borderedProminent)
            .tint(.orange)
            .accessibilityHint("Open Tonight Mode dinner suggestions")
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 16))
    }

    private var headline: String {
        let missing = kidsWithoutDinner
        if missing.isEmpty || missing.count == appState.kids.count {
            return "No dinner planned yet"
        }
        let names = missing.map(\.name).joined(separator: ", ")
        return "No dinner planned yet for \(names)"
    }

    private var inlineButton: some View {
        Button {
            AnalyticsService.track(.tonightModeOpened(via: "always_button"))
            showingSheet = true
        } label: {
            Label("Need ideas for tonight?", systemImage: "clock")
                .font(.subheadline)
        }
        .buttonStyle(.bordered)
        .accessibilityHint("Open Tonight Mode dinner suggestions")
    }

    private func trackDismissed() {
        // No-op for now; suggestion-chosen events fire from inside the sheet.
    }
}

#Preview {
    TonightModeCard()
        .environmentObject(AppState())
        .padding()
}
