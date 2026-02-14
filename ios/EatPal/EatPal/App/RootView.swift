import SwiftUI

struct RootView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false

    var body: some View {
        Group {
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
                } else {
                    OnboardingView()
                }
            }
        }
        .animation(AppTheme.Animation.standard, value: authViewModel.authState)
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
