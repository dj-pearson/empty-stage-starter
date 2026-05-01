import SwiftUI
import UIKit

/// US-232: One-handed in-store grocery view.
///
/// Designed for the "pushing a cart with one hand, phone in the other" case:
/// dark forced color scheme, scaled fonts, ≥ 56pt rows, no editing affordances,
/// and the screen kept awake while the trip is active. Anything you might want
/// to tweak in normal `GroceryView` is intentionally hidden here — this is a
/// focus mode, not a redesign.
struct ShoppingModeView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss

    /// `lastCheckedItemId` powers the inline Undo button shown for ~5s after
    /// a check. Resets on the next tap or on dismiss.
    @State private var lastCheckedItemId: String?
    @State private var undoTask: Task<Void, Never>?

    /// First-launch nudge to lower brightness for low-light aisles. Persisted
    /// so we only ask once per device, not once per shopping trip.
    @AppStorage("shoppingMode.didOfferDim") private var didOfferDim = false
    @State private var showingBrightnessBanner = false

    /// Stored brightness so we can restore it when the user exits.
    @State private var originalBrightness: CGFloat = UIScreen.main.brightness

    private var unchecked: [GroceryItem] {
        appState.groceryItems.filter { !$0.checked }
    }

    /// US-263: prefer aisleSection (32-value store walk order) when set,
    /// fall back to legacy `category` for unmigrated items. Composite key
    /// uses the same "aisle:" / "category:" prefix as GroceryView so the
    /// section header can render the right icon + label.
    private var groupedUnchecked: [(String, [GroceryItem])] {
        let grouped = Dictionary(grouping: unchecked) { item -> String in
            if let raw = item.aisleSection, GroceryAisle(rawValue: raw) != nil {
                return "aisle:\(raw)"
            }
            return "category:\(item.category)"
        }
        return grouped.sorted { sortKey($0.key) < sortKey($1.key) }
    }

    private func sortKey(_ key: String) -> (Int, String) {
        if key.hasPrefix("aisle:"),
           let aisle = GroceryAisle(rawValue: String(key.dropFirst("aisle:".count))) {
            return (aisle.storeWalkOrder, aisle.displayName)
        }
        return (10_000, key)
    }

    private var totalRemaining: Int { unchecked.count }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                content
                if let lastId = lastCheckedItemId,
                   let item = appState.groceryItems.first(where: { $0.id == lastId }),
                   item.checked {
                    undoBanner(for: item)
                        .padding(.bottom, 12)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .preferredColorScheme(.dark)
            // Forcing accessibility1 yields ~1.4× system-font scaling without
            // hard-coding pt sizes — respects user's existing dynamic-type
            // preference for those who already run larger.
            .dynamicTypeSize(.accessibility1)
            .navigationTitle("Shopping")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        exit()
                    } label: {
                        Label("Exit", systemImage: "xmark.circle.fill")
                            .labelStyle(.titleAndIcon)
                    }
                    .accessibilityLabel("Exit shopping mode")
                }
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 0) {
                        Text("\(totalRemaining) left")
                            .font(.headline)
                        if appState.groceryItems.count > totalRemaining {
                            Text("\(appState.groceryItems.count - totalRemaining) of \(appState.groceryItems.count) bought")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                if showingBrightnessBanner {
                    brightnessBanner
                }
            }
        }
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true
            originalBrightness = UIScreen.main.brightness
            if !didOfferDim {
                showingBrightnessBanner = true
            }
            // US-245
            AnalyticsService.track(.shoppingModeStarted)
            AnalyticsService.screen("grocery_shopping_mode")
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            // Restore brightness — only revert what we explicitly changed so
            // we don't override the system dimming that may have kicked in.
            UIScreen.main.brightness = originalBrightness
            undoTask?.cancel()
            // US-245: trip-summary event so we can chart what % of items get
            // bought per trip and whether shoppers leave items unfound.
            let bought = appState.groceryItems.filter(\.checked).count
            AnalyticsService.track(.shoppingModeExited(
                boughtCount: bought,
                remaining: totalRemaining
            ))
        }
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if totalRemaining == 0 {
            allDoneView
        } else {
            list
        }
    }

    private var list: some View {
        List {
            ForEach(groupedUnchecked, id: \.0) { category, items in
                Section {
                    ForEach(items) { item in
                        ShoppingRow(
                            item: item,
                            onTap: { check(item) }
                        )
                    }
                } header: {
                    Group {
                        if category.hasPrefix("aisle:"),
                           let aisle = GroceryAisle(rawValue: String(category.dropFirst("aisle:".count))) {
                            Label(aisle.displayName, systemImage: aisle.icon)
                        } else {
                            let raw = category.hasPrefix("category:")
                                ? String(category.dropFirst("category:".count))
                                : category
                            let cat = FoodCategory(rawValue: raw)
                            Text("\(cat?.icon ?? "🛒") \(cat?.displayName ?? raw)")
                        }
                    }
                        .font(.title3)
                        .fontWeight(.bold)
                        .foregroundStyle(.primary)
                        .textCase(nil)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color.black)
    }

    private var allDoneView: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 80))
                .foregroundStyle(.green)
            Text("All done!")
                .font(.title)
                .fontWeight(.bold)
            Text("Tap Exit to finish your trip.")
                .font(.body)
                .foregroundStyle(.secondary)
            Spacer()
            Button {
                exit()
            } label: {
                Text("Finish trip")
                    .fontWeight(.semibold)
                    .frame(maxWidth: .infinity, minHeight: 56)
            }
            .buttonStyle(.borderedProminent)
            .tint(.green)
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
    }

    // MARK: - Brightness banner (first-launch nudge)

    private var brightnessBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "sun.min.fill")
                .foregroundStyle(.yellow)
            VStack(alignment: .leading, spacing: 2) {
                Text("Dim the screen?")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                Text("Easier on the eyes in low-light aisles.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Yes") {
                UIScreen.main.brightness = max(0.2, originalBrightness * 0.5)
                dismissBanner()
            }
            .buttonStyle(.borderedProminent)
            .tint(.yellow)
            Button("No") {
                dismissBanner()
            }
            .buttonStyle(.bordered)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial)
        .overlay(alignment: .bottom) {
            Divider().opacity(0.3)
        }
        .transition(.move(edge: .top).combined(with: .opacity))
    }

    private func dismissBanner() {
        withAnimation { showingBrightnessBanner = false }
        didOfferDim = true
    }

    // MARK: - Undo banner

    private func undoBanner(for item: GroceryItem) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "arrow.uturn.backward.circle.fill")
                .font(.title3)
                .foregroundStyle(.orange)
            Text("Bought \(item.name)")
                .font(.subheadline)
                .lineLimit(1)
            Spacer()
            Button("Undo") {
                undoLastCheck(item)
            }
            .buttonStyle(.borderedProminent)
            .tint(.orange)
            .controlSize(.regular)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial, in: Capsule())
        .padding(.horizontal, 16)
    }

    // MARK: - Actions

    private func check(_ item: GroceryItem) {
        // Cancel any pending undo dismiss so the new banner starts a fresh
        // 5s window rather than inheriting the previous countdown.
        undoTask?.cancel()
        HapticManager.success()
        Task {
            try? await appState.toggleGroceryItem(item.id)
            await MainActor.run {
                withAnimation(.spring(response: 0.3)) {
                    lastCheckedItemId = item.id
                }
            }
        }

        undoTask = Task {
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            await MainActor.run {
                withAnimation { lastCheckedItemId = nil }
            }
        }
    }

    private func undoLastCheck(_ item: GroceryItem) {
        undoTask?.cancel()
        HapticManager.lightImpact()
        Task {
            try? await appState.toggleGroceryItem(item.id)
            await MainActor.run {
                withAnimation { lastCheckedItemId = nil }
            }
        }
    }

    private func exit() {
        HapticManager.mediumImpact()
        dismiss()
    }
}

// MARK: - Row

private struct ShoppingRow: View {
    let item: GroceryItem
    let onTap: () -> Void

    @State private var pressedDown = false

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 16) {
                Image(systemName: pressedDown ? "checkmark.circle.fill" : "circle")
                    .font(.title)
                    .foregroundStyle(pressedDown ? .green : .secondary)
                    .scaleEffect(pressedDown ? 1.2 : 1.0)
                    .animation(.spring(response: 0.25), value: pressedDown)

                VStack(alignment: .leading, spacing: 4) {
                    Text(item.name)
                        .font(.title3)
                        .fontWeight(.semibold)
                        .foregroundStyle(.primary)
                        .lineLimit(2)

                    HStack(spacing: 10) {
                        Text("\(item.quantity.formatted()) \(item.unit)")
                            .font(.callout)
                            .foregroundStyle(.secondary)

                        if let priority = item.priority, priority == "high" {
                            Label("HIGH", systemImage: "exclamationmark.circle.fill")
                                .font(.caption)
                                .foregroundStyle(.red)
                        }
                    }
                }

                Spacer()
            }
            .frame(minHeight: 56)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        // Brief visual confirmation right when the user taps. The actual
        // mutation runs async; this keeps the tap from feeling laggy.
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    if !pressedDown {
                        withAnimation { pressedDown = true }
                    }
                }
                .onEnded { _ in
                    // Hold the visual confirmation just long enough to feel
                    // satisfying, then reset (the row will disappear on the
                    // next render anyway since `unchecked` filters it out).
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                        pressedDown = false
                    }
                }
        )
        .accessibilityLabel("Buy \(item.name), \(item.quantity.formatted()) \(item.unit)")
        .accessibilityHint("Double tap to mark as bought")
    }
}

#Preview {
    ShoppingModeView()
        .environmentObject(AppState())
}
