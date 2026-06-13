import SwiftUI
import UIKit

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
    /// US-257: Optional retry closure. When present, the toast renders a
    /// "Retry" button alongside the dismiss control. Running the closure
    /// also dismisses the toast (caller can re-toast on the next failure).
    /// Stored as `@MainActor (Sendable)?` so it lives inside an Equatable
    /// struct without breaking the `id`-based equality below.
    let retry: (@MainActor () async -> Void)?
    /// US-349: label for the action button. Defaults to "Retry" when nil so
    /// existing error-retry call sites are unchanged; success/info toasts can
    /// pass e.g. "Undo".
    let actionLabel: String?

    init(
        type: ToastType,
        title: String,
        message: String? = nil,
        duration: TimeInterval = 3.0,
        actionLabel: String? = nil,
        retry: (@MainActor () async -> Void)? = nil
    ) {
        self.type = type
        self.title = title
        self.message = message
        self.actionLabel = actionLabel
        // Error toasts with retry stay on screen a bit longer — the user
        // needs time to read the title + decide whether to tap Retry.
        if retry != nil && duration < 5 {
            self.duration = 5
        } else {
            self.duration = duration
        }
        self.retry = retry
    }

    /// Equality is identity-based — closures aren't Equatable, and toast
    /// rows are keyed by `id` in the manager queue anyway.
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

    func error(_ title: String, message: String? = nil, retry: (@MainActor () async -> Void)? = nil) {
        show(Toast(type: .error, title: title, message: message, duration: 4.0, retry: retry))
    }

    /// US-247: Show a toast for an `AppError` with consistent title + recovery
    /// hint, and forward the underlying system error to Sentry so we still get
    /// breadcrumbs without leaking the raw description to the user.
    /// US-257: Optional `retry` closure renders a "Retry" button on the toast.
    func show(_ appError: AppError, retry: (@MainActor () async -> Void)? = nil) {
        show(Toast(
            type: appError.telemetryCategory == "offline" ? .warning : .error,
            title: appError.title,
            message: appError.recoveryHint,
            duration: 4.0,
            retry: retry
        ))
        if let underlying = appError.underlying {
            SentryService.capture(underlying, extras: [
                "app_error_category": appError.telemetryCategory
            ])
        }
    }

    /// Convenience that wraps an arbitrary `Error` into an `AppError` first.
    /// Use at catch-sites so we never have to write
    /// `error.localizedDescription` into a toast body again.
    ///
    ///     catch { toast.show(error, as: { .save(entity: "food", underlying: $0) }) }
    /// US-257: pass `retry:` to attach a one-tap re-run for transient failures.
    ///
    ///     catch {
    ///         toast.show(error, as: { .save(entity: "food", underlying: $0) },
    ///                    retry: { try? await appState.addFood(food) })
    ///     }
    func show(_ error: Error, as context: (Error) -> AppError, retry: (@MainActor () async -> Void)? = nil) {
        show(AppError.wrap(error, as: context), retry: retry)
    }

    func warning(_ title: String, message: String? = nil) {
        show(Toast(type: .warning, title: title, message: message))
    }

    func info(_ title: String, message: String? = nil) {
        show(Toast(type: .info, title: title, message: message))
    }

    private var reduceMotion: Bool { UIAccessibility.isReduceMotionEnabled }

    func dismiss() {
        dismissTask?.cancel()
        if reduceMotion {
            currentToast = nil
        } else {
            withAnimation(AppTheme.Animation.standard) {
                currentToast = nil
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            self?.showNext()
        }
    }

    private func present(_ toast: Toast) {
        if reduceMotion {
            currentToast = toast
        } else {
            withAnimation(AppTheme.Animation.spring) {
                currentToast = toast
            }
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

    @State private var isRetrying = false

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

            // US-257: Retry button — only renders when the toast was
            // built with a retry closure. Running it also dismisses the
            // toast so the user gets visual feedback.
            if let retry = toast.retry {
                Button {
                    guard !isRetrying else { return }
                    isRetrying = true
                    Task { @MainActor in
                        await retry()
                        onDismiss()
                    }
                } label: {
                    if isRetrying {
                        ProgressView()
                            .controlSize(.small)
                            .frame(width: 14, height: 14)
                    } else {
                        Text(toast.actionLabel ?? "Retry")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(toast.type.color)
                    }
                }
                .disabled(isRetrying)
                .accessibilityLabel(toast.actionLabel ?? "Retry")
            }

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
