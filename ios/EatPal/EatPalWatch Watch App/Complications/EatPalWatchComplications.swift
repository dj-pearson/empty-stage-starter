import WidgetKit
import SwiftUI

/// US-237: WidgetKit-based complications for the EatPal watch app.
///
/// Two complications:
/// - "Tonight" (Modular Small / Corner / Inline): tonight's dinner name
/// - "Grocery" (Modular Large / Rectangular): X / Y items remaining
///
/// Both read the same cached `WatchSnapshot` written by `WatchSessionStore`
/// so they stay in sync with the in-app screens.
@main
struct EatPalWatchComplicationsBundle: WidgetBundle {
    var body: some Widget {
        TonightComplication()
        GroceryComplication()
    }
}

// MARK: - Snapshot loader

private enum SnapshotLoader {
    static let cacheKey = "EatPal.watch.snapshot"

    static func load() -> WatchSnapshot {
        guard let data = UserDefaults.standard.data(forKey: cacheKey),
              let decoded = try? JSONDecoder().decode(WatchSnapshot.self, from: data)
        else {
            return .empty
        }
        return decoded
    }
}

// MARK: - Tonight complication

struct TonightEntry: TimelineEntry {
    let date: Date
    let dinnerName: String?
}

struct TonightProvider: TimelineProvider {
    func placeholder(in context: Context) -> TonightEntry {
        TonightEntry(date: Date(), dinnerName: "Spaghetti")
    }

    func getSnapshot(in context: Context, completion: @escaping (TonightEntry) -> Void) {
        completion(buildEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TonightEntry>) -> Void) {
        let entry = buildEntry()
        // Refresh every 30 minutes — the snapshot itself updates more often
        // via the iPhone push, but the complication should refresh on a
        // cadence even when no push has arrived (e.g. day rollover).
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func buildEntry() -> TonightEntry {
        let snapshot = SnapshotLoader.load()
        let dinner = snapshot.meals.first { $0.slot == "dinner" }
        return TonightEntry(date: Date(), dinnerName: dinner?.name)
    }
}

struct TonightComplication: Widget {
    let kind: String = "EatPalTonightComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TonightProvider()) { entry in
            TonightView(entry: entry)
        }
        .configurationDisplayName("Tonight")
        .description("Shows tonight's planned dinner.")
        .supportedFamilies([
            .accessoryCorner,
            .accessoryCircular,
            .accessoryInline,
            .accessoryRectangular,
        ])
    }
}

struct TonightView: View {
    let entry: TonightEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .accessoryInline:
            Text(entry.dinnerName.map { "Dinner: \($0)" } ?? "No dinner planned")
        case .accessoryCircular, .accessoryCorner:
            Image(systemName: "fork.knife.circle.fill")
                .font(.title3)
        default:
            VStack(alignment: .leading, spacing: 2) {
                Text("Tonight")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(entry.dinnerName ?? "—")
                    .font(.headline)
                    .lineLimit(1)
            }
        }
    }
}

// MARK: - Grocery complication

struct GroceryEntry: TimelineEntry {
    let date: Date
    let remaining: Int
    let total: Int
}

struct GroceryProvider: TimelineProvider {
    func placeholder(in context: Context) -> GroceryEntry {
        GroceryEntry(date: Date(), remaining: 5, total: 12)
    }

    func getSnapshot(in context: Context, completion: @escaping (GroceryEntry) -> Void) {
        completion(buildEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<GroceryEntry>) -> Void) {
        let entry = buildEntry()
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func buildEntry() -> GroceryEntry {
        let snapshot = SnapshotLoader.load()
        let total = snapshot.totalGroceryCount
        let remaining = snapshot.grocery.count
        return GroceryEntry(date: Date(), remaining: remaining, total: total)
    }
}

struct GroceryComplication: Widget {
    let kind: String = "EatPalGroceryComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GroceryProvider()) { entry in
            GroceryView(entry: entry)
        }
        .configurationDisplayName("Grocery")
        .description("Shows how many items are left on your grocery list.")
        .supportedFamilies([
            .accessoryCorner,
            .accessoryCircular,
            .accessoryInline,
            .accessoryRectangular,
        ])
    }
}

struct GroceryView: View {
    let entry: GroceryEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .accessoryInline:
            Text("Grocery: \(entry.remaining) / \(entry.total)")
        case .accessoryCircular, .accessoryCorner:
            VStack(spacing: 0) {
                Image(systemName: "cart.fill")
                    .font(.caption2)
                Text("\(entry.remaining)")
                    .font(.caption2)
                    .fontWeight(.semibold)
            }
        default:
            VStack(alignment: .leading, spacing: 2) {
                Text("Grocery")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text("\(entry.remaining) of \(entry.total) left")
                    .font(.headline)
            }
        }
    }
}
