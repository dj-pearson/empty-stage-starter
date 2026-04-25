import SwiftUI

/// US-234: Lists every queued mutation with type, target, queue age, and the
/// last error if any. Provides a manual Sync now action and a destructive
/// Clear failed mutations action.
struct PendingChangesSheet: View {
    @Environment(\.dismiss) var dismiss
    @ObservedObject private var store = OfflineStore.shared
    @ObservedObject private var network = NetworkMonitor.shared
    @State private var mutations: [PendingMutation] = []
    @State private var showingClearConfirm = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        Label(network.isConnected ? "Online" : "Offline", systemImage: network.isConnected ? "wifi" : "wifi.slash")
                            .foregroundStyle(network.isConnected ? AppTheme.Colors.primary : AppTheme.Colors.warning)
                        Spacer()
                        if store.isSyncing {
                            ProgressView()
                                .controlSize(.small)
                        }
                    }
                    if let err = store.lastSyncError, !err.isEmpty {
                        Label(err, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(AppTheme.Colors.warning)
                            .font(.caption)
                    }
                } header: {
                    Text("Status")
                }

                if mutations.isEmpty {
                    Section {
                        ContentUnavailableView(
                            "All synced",
                            systemImage: "checkmark.icloud.fill",
                            description: Text("There's nothing waiting to upload.")
                        )
                    }
                } else {
                    Section("\(mutations.count) queued change\(mutations.count == 1 ? "" : "s")") {
                        ForEach(mutations, id: \.id) { mutation in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Image(systemName: iconFor(mutation))
                                        .foregroundStyle(AppTheme.Colors.primary)
                                    Text(titleFor(mutation))
                                        .font(.subheadline)
                                        .fontWeight(.medium)
                                    Spacer()
                                    Text(relativeAge(mutation.createdAt))
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                                Text("id \(short(mutation.entityId))")
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Pending changes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button {
                            Task { await syncNow() }
                        } label: {
                            Label("Sync now", systemImage: "arrow.clockwise.icloud")
                        }
                        .disabled(mutations.isEmpty || store.isSyncing || !network.isConnected)

                        if !mutations.isEmpty {
                            Divider()
                            Button(role: .destructive) {
                                showingClearConfirm = true
                            } label: {
                                Label("Clear queue", systemImage: "trash")
                            }
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .alert("Clear all pending changes?", isPresented: $showingClearConfirm) {
                Button("Clear", role: .destructive) {
                    store.clearAllPendingMutations()
                    refresh()
                    HapticManager.warning()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Queued edits will be discarded. This can't be undone.")
            }
        }
        .onAppear { refresh() }
        .onChange(of: store.pendingMutationCount) { _, _ in refresh() }
    }

    // MARK: - Helpers

    private func refresh() {
        mutations = store.getPendingMutations()
    }

    private func syncNow() async {
        await store.syncPendingMutations()
        refresh()
        if store.pendingMutationCount == 0 {
            HapticManager.success()
            ToastManager.shared.success("All synced")
        } else if let err = store.lastSyncError {
            HapticManager.error()
            ToastManager.shared.error("Sync paused", message: err)
        }
    }

    private func iconFor(_ mutation: PendingMutation) -> String {
        switch mutation.operation {
        case "insert": return "plus.circle.fill"
        case "update": return "pencil.circle.fill"
        case "delete": return "minus.circle.fill"
        default: return "questionmark.circle.fill"
        }
    }

    private func titleFor(_ mutation: PendingMutation) -> String {
        let op = mutation.operation.capitalized
        let table = mutation.table
            .replacingOccurrences(of: "_", with: " ")
            .capitalized
        return "\(op) — \(table)"
    }

    private func short(_ id: String) -> String {
        String(id.prefix(8)) + "…"
    }

    private static let relativeFormatter: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .short
        return f
    }()

    private func relativeAge(_ date: Date) -> String {
        Self.relativeFormatter.localizedString(for: date, relativeTo: Date())
    }
}
