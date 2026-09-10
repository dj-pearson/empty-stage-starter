import SwiftUI

struct RootView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var appState: AppState
    @Environment(\.scenePhase) private var scenePhase

    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    // US-380: server-driven force-update gate (fails open).
    @StateObject private var forceUpdate = ForceUpdateService.shared

    /// When the app was last backgrounded, for the staleness check below.
    @State private var backgroundedAt: Date?

    /// How long the app has to have been away before a foreground counts as
    /// "come back to it later" rather than a glance at Messages. Below this,
    /// the realtime socket has almost certainly survived and a refetch is
    /// wasted work.
    private static let staleAfter: TimeInterval = 30

    var body: some View {
        Group {
            if forceUpdate.needsUpdate {
                // US-380: blocks everything below the minimum supported build.
                ForceUpdateView()
            } else {
                switch authViewModel.authState {
                case .loading:
                    LaunchScreenView()
                case .unauthenticated:
                    AuthView()
                case .authenticated:
                    if hasCompletedOnboarding {
                        MainTabView()
                            .withToasts()
                            .withOfflineBanner()
                            .withSyncStatusBanner()
                    } else {
                        OnboardingView()
                    }
                }
            }
        }
        .accessibleAnimation(AppTheme.Animation.standard, value: authViewModel.authState)
        // US-380: check the minimum supported build on launch, before the user
        // gets into the app.
        .task {
            await forceUpdate.checkMinimumVersion()
        }
        // US-490: re-sync subscription entitlements whenever the app returns to
        // the foreground so a renewal or a purchase made on another device is
        // reflected mid-session. Cold-launch sync happens in StoreKitService.init.
        .onChange(of: scenePhase) { _, newPhase in
            switch newPhase {
            case .background:
                backgroundedAt = Date()

            case .active:
                Task { await StoreKitService.shared.refreshEntitlements() }
                // US-494 (M2): also try to drain the offline write queue on
                // foreground; it no-ops when offline or empty.
                Task { await OfflineStore.shared.syncPendingMutations() }
                // US-145: a suspended app runs no timers, so the abandoned-trip
                // check has to happen when it is running again.
                Task { await GroceryTripActivityService.shared.endIfExpired() }
                refreshIfStale()

            default:
                break
            }
        }
    }

    /// Refetches and re-subscribes after the app has been away long enough for
    /// its realtime connection to have died.
    ///
    /// iOS suspends a backgrounded app and its WebSocket to Supabase Realtime
    /// goes with it. Nothing reconnected it, so returning to EatPal after any
    /// real absence showed whatever was on screen an hour ago -- and kept
    /// showing it, because the live channel that was meant to correct it was
    /// dead too. On a household app that is a partner adding three things to
    /// the grocery list and none of them appearing until the app is force
    /// quit.
    ///
    /// `loadAllData` ends by calling `RealtimeService.subscribe`, which tears
    /// down the old channels first, so this one call covers both halves.
    private func refreshIfStale() {
        guard case .authenticated = authViewModel.authState else { return }
        guard let since = backgroundedAt else { return }
        backgroundedAt = nil
        guard Date().timeIntervalSince(since) >= Self.staleAfter else { return }

        Task {
            // Quietly: the user is looking at a screen already, and swapping it
            // for a spinner to fetch data they can already see is worse than
            // letting it update underneath them.
            await appState.loadAllData(showLoadingIndicator: false)
            // US-380: the force-update gate is server-driven and only ran at
            // launch. An app that sits in the background for days would never
            // see a min_ios_build bump.
            await ForceUpdateService.shared.checkMinimumVersion()
        }
    }
}

struct LaunchScreenView: View {
    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: AppTheme.Spacing.lg) {
                Image(systemName: "fork.knife.circle.fill")
                    .font(.system(size: 72))
                    .foregroundStyle(AppTheme.Colors.primary)
                    .accessibilityHidden(true)

                Text("EatPal")
                    .font(.largeTitle)
                    .fontWeight(.bold)

                ProgressView()
                    .tint(AppTheme.Colors.primary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("EatPal is loading")
    }
}

#Preview {
    RootView()
        .environmentObject(AuthViewModel())
        .environmentObject(AppState())
}
