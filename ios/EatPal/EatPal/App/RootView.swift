import SwiftUI

struct RootView: View {
    @EnvironmentObject var authViewModel: AuthViewModel

    var body: some View {
        Group {
            switch authViewModel.authState {
            case .loading:
                LaunchScreenView()
            case .unauthenticated:
                AuthView()
            case .authenticated:
                MainTabView()
            }
        }
        .animation(.easeInOut(duration: 0.3), value: authViewModel.authState)
    }
}

struct LaunchScreenView: View {
    var body: some View {
        ZStack {
            Color(.systemBackground)
                .ignoresSafeArea()

            VStack(spacing: 16) {
                Image(systemName: "fork.knife.circle.fill")
                    .font(.system(size: 72))
                    .foregroundStyle(.green)

                Text("EatPal")
                    .font(.largeTitle)
                    .fontWeight(.bold)

                ProgressView()
                    .tint(.green)
            }
        }
    }
}

#Preview {
    RootView()
        .environmentObject(AuthViewModel())
        .environmentObject(AppState())
}
