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
    let retryAction: (() -> Void)?

    var body: some View {
        HStack {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.yellow)

            Text(message)
                .font(.subheadline)

            Spacer()

            if let retryAction {
                Button("Retry", action: retryAction)
                    .font(.subheadline)
                    .buttonStyle(.bordered)
            }
        }
        .padding()
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))
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
