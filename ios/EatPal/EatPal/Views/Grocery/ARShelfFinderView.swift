import SwiftUI
import VisionKit

/// US-277: AR-style live shelf finder. Walk down a grocery aisle, hold
/// up the phone, and every product whose barcode is on the user's
/// grocery list — or in their saved smart-add preferences — gets a
/// SwiftUI chip overlaid in real time.
///
/// Two chip flavors:
///   - **Green "In your list — tap to check"** when the barcode matches
///     an unchecked grocery item.
///   - **Blue "Saved product — tap to add"** when the barcode matches
///     a `user_product_preferences` row but isn't on the active list.
///
/// Tapping check toggles the grocery item; tapping add silently adds
/// it via SmartProductService.resolve so the user keeps walking.
///
/// Privacy: nothing leaves the device — no images uploaded, only
/// counts in the analytics breadcrumbs.
struct ARShelfFinderView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var trackedBarcodes: [ARShelfScannerRepresentable.TrackedBarcode] = []
    @State private var lastError: String?
    /// Index of all known preferences keyed by barcode. Loaded once on
    /// appear; the resolver itself does the lookup, but for the chip
    /// we want a synchronous "is this barcode something the user
    /// cares about?" check on every camera tick.
    @State private var prefsByBarcode: [String: UserProductPreference] = [:]

    /// Throttle the haptic feedback so we don't buzz the user's pocket
    /// every camera tick when 5 chips are visible. Tracks the last id
    /// we celebrated.
    @State private var lastHapticId: UUID?

    var body: some View {
        ZStack {
            // Camera live feed + barcode tracking. Falls back to a
            // friendly message on devices that can't run the scanner.
            if #available(iOS 17.0, *), DataScannerViewController.isSupported {
                ARShelfScannerRepresentable(
                    onBarcodes: { newBarcodes in
                        trackedBarcodes = newBarcodes
                        if let first = newBarcodes.first, first.id != lastHapticId {
                            HapticManager.lightImpact()
                            lastHapticId = first.id
                        }
                    },
                    onError: { error in
                        lastError = error.localizedDescription
                    }
                )
                .ignoresSafeArea()
            } else {
                unsupportedHardware
            }

            // Chip overlay. SwiftUI lays each chip at the barcode's
            // bounding rect midpoint; the chip's intrinsic size grows
            // with the label rather than the box so the text stays
            // readable even on tiny barcodes.
            GeometryReader { _ in
                ForEach(trackedBarcodes) { barcode in
                    if let chip = chip(for: barcode) {
                        ARShelfChip(label: chip.label, color: chip.color, action: chip.action)
                            .position(x: barcode.boundingRect.midX, y: barcode.boundingRect.midY)
                            .accessibilityLabel(chip.accessibilityLabel)
                    }
                }
            }

            // Top toolbar — close + scan count. Mirrors the existing
            // ShoppingModeView's "translucent bar over the camera"
            // pattern.
            VStack {
                HStack {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title2)
                            .foregroundStyle(.white, .black.opacity(0.6))
                    }
                    Spacer()
                    Text(headerTitle)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(.black.opacity(0.55), in: Capsule())
                }
                .padding(.horizontal)
                .padding(.top, 12)
                Spacer()
                if let lastError {
                    Label(lastError, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(.red.opacity(0.7), in: RoundedRectangle(cornerRadius: 8))
                        .padding(.bottom, 32)
                }
            }
        }
        .task { await loadPreferences() }
        .onAppear { AnalyticsService.track(.arShelfFinderOpened) }
    }

    private var headerTitle: String {
        let onListCount = trackedBarcodes.filter { matchType(for: $0.payload) == .onList }.count
        let savedCount = trackedBarcodes.filter { matchType(for: $0.payload) == .saved }.count
        if onListCount + savedCount == 0 {
            return "Point at a product…"
        }
        var parts: [String] = []
        if onListCount > 0 { parts.append("\(onListCount) on list") }
        if savedCount > 0 { parts.append("\(savedCount) saved") }
        return parts.joined(separator: " · ")
    }

    @ViewBuilder
    private var unsupportedHardware: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 12) {
                Image(systemName: "viewfinder.circle")
                    .font(.system(size: 56))
                    .foregroundStyle(.white)
                Text("Live scanner not available")
                    .font(.headline)
                    .foregroundStyle(.white)
                Text("This feature needs an iPhone with iOS 17+ and a high-end camera. Use the regular scanner from Quick Add instead.")
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white.opacity(0.85))
                    .padding(.horizontal, 32)
            }
        }
    }

    // MARK: - Match types

    private enum MatchType {
        case onList   // green — unchecked grocery item
        case saved    // blue — has prefs but not on list
        case unknown  // no chip
    }

    private func matchType(for payload: String) -> MatchType {
        if appState.groceryItems.contains(where: { $0.barcode == payload && !$0.checked }) {
            return .onList
        }
        if prefsByBarcode[payload] != nil {
            return .saved
        }
        return .unknown
    }

    // MARK: - Chip rendering

    private struct ChipSpec {
        let label: String
        let color: Color
        let action: () -> Void
        let accessibilityLabel: String
    }

    private func chip(for barcode: ARShelfScannerRepresentable.TrackedBarcode) -> ChipSpec? {
        switch matchType(for: barcode.payload) {
        case .onList:
            // Surface the matching grocery item's name so the user can
            // verify the camera matched the right thing before tapping.
            let item = appState.groceryItems.first(where: { $0.barcode == barcode.payload && !$0.checked })
            let name = item?.name ?? "On your list"
            return ChipSpec(
                label: "✓ \(name)",
                color: .green,
                action: { Task { await checkOff(barcode: barcode.payload) } },
                accessibilityLabel: "Check off \(name)"
            )
        case .saved:
            let pref = prefsByBarcode[barcode.payload]
            let name = pref?.name ?? "Saved product"
            return ChipSpec(
                label: "+ \(name)",
                color: .blue,
                action: { Task { await silentAdd(barcode: barcode.payload, fallbackName: name) } },
                accessibilityLabel: "Add \(name) to grocery list"
            )
        case .unknown:
            return nil
        }
    }

    // MARK: - Actions

    private func checkOff(barcode: String) async {
        guard let item = appState.groceryItems.first(where: { $0.barcode == barcode && !$0.checked }) else { return }
        do {
            try await appState.toggleGroceryItem(item.id)
            HapticManager.success()
            AnalyticsService.track(.arShelfChipTapped(action: "check"))
        } catch {
            // toggleGroceryItem already surfaces a toast.
        }
    }

    private func silentAdd(barcode: String, fallbackName: String) async {
        // Resolver does the heavy lifting — household / user prefs win
        // over the keyword classifier for unit + aisle.
        let resolved = await SmartProductService.shared.resolve(name: fallbackName, barcode: barcode)
        let item = GroceryItem(
            id: UUID().uuidString,
            userId: "",
            name: resolved.name.isEmpty ? fallbackName : resolved.name,
            category: resolved.category.rawValue,
            quantity: resolved.quantity,
            unit: resolved.unit,
            checked: false,
            barcode: barcode,
            brandPreference: resolved.brand,
            priority: "medium",
            addedVia: "ar_shelf_finder",
            aisleSection: resolved.aisleSection.rawValue
        )
        do {
            try await appState.addGroceryItem(item)
            HapticManager.success()
            AnalyticsService.track(.arShelfChipTapped(action: "add"))
        } catch { }
    }

    // MARK: - Loaders

    private func loadPreferences() async {
        let prefs = await SmartProductService.shared.fetchAllPreferences()
        var byBarcode: [String: UserProductPreference] = [:]
        for pref in prefs {
            if let bc = pref.barcode, !bc.isEmpty {
                byBarcode[bc] = pref
            }
        }
        prefsByBarcode = byBarcode
    }
}

/// US-277: A chip that floats over a barcode in the AR shelf finder.
/// Tap fires the supplied action; the visual is just a colored capsule
/// with a system-image-prefixed label.
private struct ARShelfChip: View {
    let label: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.callout.weight(.semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(color, in: Capsule())
                .overlay(
                    Capsule()
                        .stroke(.white.opacity(0.35), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.35), radius: 4, x: 0, y: 2)
        }
        .buttonStyle(.plain)
    }
}
