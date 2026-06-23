import SwiftUI

struct LoadingView: View {
    let message: String

    init(_ message: String = "Loading...") {
        self.message = message
    }

    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
                .controlSize(.regular)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct EmptyStateView: View {
    let title: String
    let description: String
    let systemImage: String
    let actionTitle: String?
    let action: (() -> Void)?

    init(
        title: String,
        description: String,
        systemImage: String,
        actionTitle: String? = nil,
        action: (() -> Void)? = nil
    ) {
        self.title = title
        self.description = description
        self.systemImage = systemImage
        self.actionTitle = actionTitle
        self.action = action
    }

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: systemImage)
        } description: {
            Text(description)
        } actions: {
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
            }
        }
    }
}

struct ErrorBanner: View {
    let message: String
    var retryAction: (() -> Void)? = nil
    /// US-367: optional dismiss affordance (used by conversion-critical
    /// surfaces like the paywall so the error can be cleared).
    var onDismiss: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 8) {
            // US-367: error styling comes from AppTheme.Colors.danger, not a
            // raw Color.red.
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(AppTheme.Colors.danger)

            Text(message)
                .font(.subheadline)
                .foregroundStyle(.primary)

            Spacer()

            if let retryAction {
                Button("Retry", action: retryAction)
                    .font(.subheadline)
                    .buttonStyle(.bordered)
            }

            if let onDismiss {
                Button {
                    onDismiss()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .accessibilityLabel("Dismiss error")
            }
        }
        .padding()
        .background(AppTheme.Colors.dangerLight, in: RoundedRectangle(cornerRadius: 10))
    }
}

#Preview {
    VStack(spacing: 20) {
        LoadingView()
        EmptyStateView(
            title: "No Foods",
            description: "Add foods to get started",
            systemImage: "leaf.fill",
            actionTitle: "Add Food"
        ) {}
        ErrorBanner(message: "Failed to load data", retryAction: {})
    }
    .padding()
}
