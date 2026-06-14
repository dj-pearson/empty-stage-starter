import SwiftUI

struct RootView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    // US-380: server-driven force-update gate (fails open).
    @StateObject private var forceUpdate = ForceUpdateService.shared

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
