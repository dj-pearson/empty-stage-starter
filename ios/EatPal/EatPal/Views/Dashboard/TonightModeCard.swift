import SwiftUI

/// US-293: Dashboard panic-button card. When it's late afternoon/evening
/// AND no dinner is planned, this is the loudest thing on the screen.
/// Otherwise it shows as a small "Need ideas for tonight?" affordance.
struct TonightModeCard: View {
    @EnvironmentObject var appState: AppState
    @State private var showingSheet = false

    private var showPanic: Bool {
        TonightModeService.shouldShowPanicCta(planEntries: appState.planEntries)
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
            HStack(spacing: 8) {
                Image(systemName: "flame.fill")
                    .font(.title2)
                    .foregroundStyle(.orange)
                Text("Tonight Mode")
                    .font(.caption.bold())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.orange.opacity(0.15), in: Capsule())
                    .foregroundStyle(.orange)
            }

            Text("Dinner in 20 minutes.")
                .font(.title2.bold())
            Text("No plan? We'll pick 3 things you can cook with what you have right now.")
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
        .background(
            LinearGradient(
                colors: [Color.orange.opacity(0.18), Color.pink.opacity(0.08)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 16)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(.orange.opacity(0.3), lineWidth: 1)
        )
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
