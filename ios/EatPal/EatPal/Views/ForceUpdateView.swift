import SwiftUI
import UIKit

/// US-380: blocking update screen shown when the installed build is below the
/// server-provided minimum. There is intentionally no dismiss — the only path
/// forward is updating from the App Store.
struct ForceUpdateView: View {
    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: AppTheme.Spacing.lg) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 72))
                    .foregroundStyle(AppTheme.Colors.primary)
                    .accessibilityHidden(true)

                Text("Update Required")
                    .font(.title)
                    .fontWeight(.bold)

                Text("This version of EatPal is no longer supported. Please update to the latest version to keep your data safe and in sync.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                Button {
                    if let url = ForceUpdateService.shared.appStoreURL {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    Text("Update on the App Store")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(AppTheme.Colors.primary)
                .padding(.horizontal, 32)
            }
        }
        .accessibilityElement(children: .contain)
    }
}

#Preview {
    ForceUpdateView()
}
