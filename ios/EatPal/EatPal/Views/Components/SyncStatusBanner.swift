import SwiftUI

/// US-234: A subtle inline banner shown when there are pending offline
/// mutations or a sync is in flight. Tapping opens the Pending Changes sheet.
struct SyncStatusBanner: View {
    @ObservedObject private var store = OfflineStore.shared
    @ObservedObject private var network = NetworkMonitor.shared
    @State private var showingPendingSheet = false

    private var shouldShow: Bool {
        store.isSyncing || store.pendingMutationCount > 0 || store.lastSyncError != nil
    }

    private var iconName: String {
        if store.isSyncing { return "arrow.triangle.2.circlepath" }
        if store.lastSyncError != nil { return "exclamationmark.triangle.fill" }
        return "icloud.and.arrow.up"
    }

    private var tint: Color {
        if store.lastSyncError != nil { return AppTheme.Colors.warning }
        return AppTheme.Colors.primary
    }

    private var labelText: String {
        if store.isSyncing {
            return "Syncing changes…"
        }
        if let err = store.lastSyncError, !err.isEmpty {
            return "Sync paused — tap to review"
        }
        let n = store.pendingMutationCount
        return "\(n) pending change\(n == 1 ? "" : "s")"
    }

    var body: some View {
        if shouldShow {
            Button {
                showingPendingSheet = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: iconName)
                        .font(.subheadline)
                        .rotationEffect(.degrees(store.isSyncing ? 360 : 0))
                        .animation(
                            store.isSyncing
                                ? .linear(duration: 1.2).repeatForever(autoreverses: false)
                                : .default,
                            value: store.isSyncing
                        )
                    Text(labelText)
                        .font(.subheadline)
                        .fontWeight(.medium)
                    Spacer()
                    Text(network.isConnected ? "Tap to review" : "Offline")
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(tint.opacity(0.15), in: Capsule())
                }
                .foregroundStyle(tint)
                .padding(.horizontal, AppTheme.Spacing.lg)
                .padding(.vertical, 6)
                .background(tint.opacity(0.08))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(labelText)
            .accessibilityHint("Opens pending changes")
            .sheet(isPresented: $showingPendingSheet) {
                PendingChangesSheet()
            }
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }
}

struct SyncStatusBannerModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .safeAreaInset(edge: .top, spacing: 0) {
                SyncStatusBanner()
            }
    }
}

extension View {
    func withSyncStatusBanner() -> some View {
        modifier(SyncStatusBannerModifier())
    }
}
