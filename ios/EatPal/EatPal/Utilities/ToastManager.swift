import SwiftUI

/// Toast notification type matching web's Sonner patterns.
enum ToastType {
    case success
    case error
    case warning
    case info

    var icon: String {
        switch self {
        case .success: return "checkmark.circle.fill"
        case .error: return "xmark.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        case .info: return "info.circle.fill"
        }
    }

    var color: Color {
        switch self {
        case .success: return AppTheme.Colors.success
        case .error: return AppTheme.Colors.danger
        case .warning: return AppTheme.Colors.warning
        case .info: return AppTheme.Colors.info
        }
    }
}

/// A single toast notification.
struct Toast: Identifiable, Equatable {
    let id = UUID()
    let type: ToastType
    let title: String
    let message: String?
    let duration: TimeInterval

    init(type: ToastType, title: String, message: String? = nil, duration: TimeInterval = 3.0) {
        self.type = type
        self.title = title
        self.message = message
        self.duration = duration
    }

    static func == (lhs: Toast, rhs: Toast) -> Bool {
        lhs.id == rhs.id
    }
}

/// Global toast manager that queues and displays toast notifications.
@MainActor
final class ToastManager: ObservableObject {
    static let shared = ToastManager()

    @Published var currentToast: Toast?
    private var queue: [Toast] = []
    private var dismissTask: Task<Void, Never>?

    private init() {}

    func show(_ toast: Toast) {
        if currentToast != nil {
            queue.append(toast)
        } else {
            present(toast)
        }
    }

    func success(_ title: String, message: String? = nil) {
        show(Toast(type: .success, title: title, message: message))
    }

    func error(_ title: String, message: String? = nil) {
        show(Toast(type: .error, title: title, message: message, duration: 4.0))
    }

    func warning(_ title: String, message: String? = nil) {
        show(Toast(type: .warning, title: title, message: message))
    }

    func info(_ title: String, message: String? = nil) {
        show(Toast(type: .info, title: title, message: message))
    }

    func dismiss() {
        dismissTask?.cancel()
        withAnimation(AppTheme.Animation.standard) {
            currentToast = nil
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            self?.showNext()
        }
    }

    private func present(_ toast: Toast) {
        withAnimation(AppTheme.Animation.spring) {
            currentToast = toast
        }
        dismissTask?.cancel()
        dismissTask = Task {
            try? await Task.sleep(for: .seconds(toast.duration))
            guard !Task.isCancelled else { return }
            dismiss()
        }
    }

    private func showNext() {
        guard !queue.isEmpty else { return }
        let next = queue.removeFirst()
        present(next)
    }
}

// MARK: - Toast View

struct ToastView: View {
    let toast: Toast
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: AppTheme.Spacing.md) {
            Image(systemName: toast.type.icon)
                .font(.title3)
                .foregroundStyle(toast.type.color)

            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                Text(toast.title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(AppTheme.Colors.textPrimary)

                if let message = toast.message {
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(AppTheme.Colors.textSecondary)
                }
            }

            Spacer()

            Button {
                onDismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.caption)
                    .foregroundStyle(AppTheme.Colors.textTertiary)
            }
            .accessibilityLabel("Dismiss notification")
        }
        .padding(.horizontal, AppTheme.Spacing.lg)
        .padding(.vertical, AppTheme.Spacing.md)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.Radius.lg)
                .fill(.ultraThinMaterial)
                .shadow(color: AppTheme.Shadow.md, radius: 8, y: 4)
        )
        .padding(.horizontal, AppTheme.Spacing.lg)
        .transition(.move(edge: .top).combined(with: .opacity))
        .gesture(
            DragGesture(minimumDistance: 20)
                .onEnded { value in
                    if value.translation.height < -20 {
                        onDismiss()
                    }
                }
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(toast.type == .error ? "Error" : toast.type == .success ? "Success" : "Notification"): \(toast.title)")
    }
}

// MARK: - Toast Container Modifier

struct ToastContainerModifier: ViewModifier {
    @ObservedObject var toastManager = ToastManager.shared

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .top) {
                if let toast = toastManager.currentToast {
                    ToastView(toast: toast) {
                        toastManager.dismiss()
                    }
                    .padding(.top, AppTheme.Spacing.xs)
                }
            }
    }
}

extension View {
    func withToasts() -> some View {
        modifier(ToastContainerModifier())
    }
}
