import SwiftUI

/// US-237: Grocery checklist on the wrist. Tap to check (sends a message
/// back to the iPhone, which writes to Supabase via the existing path).
struct GroceryWatchView: View {
    @EnvironmentObject var sessionStore: WatchSessionStore

    private var groupedByCategory: [(String, [WatchSnapshot.GroceryRow])] {
        Dictionary(grouping: sessionStore.snapshot.grocery, by: { $0.category })
            .sorted { $0.key < $1.key }
    }

    private var summary: String {
        let snap = sessionStore.snapshot
        if snap.grocery.isEmpty {
            return "All done — \(snap.checkedGroceryCount) checked off."
        }
        return "\(snap.grocery.count) of \(snap.totalGroceryCount) left"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text("Grocery")
                    .font(.title3)
                    .fontWeight(.bold)
                    .padding(.horizontal)

                Text(summary)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)

                ForEach(groupedByCategory, id: \.0) { category, items in
                    Section {
                        ForEach(items) { item in
                            Button {
                                // Long-haptic + immediate visual remove.
                                WKInterfaceDevice.current().play(.success)
                                sessionStore.toggleGrocery(item)
                            } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: "circle")
                                        .foregroundStyle(.green)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(item.name)
                                            .font(.caption)
                                            .lineLimit(1)
                                        Text("\(item.quantity, specifier: "%g") \(item.unit)")
                                            .font(.system(size: 9))
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Color.gray.opacity(0.15), in: RoundedRectangle(cornerRadius: 8))
                            }
                            .buttonStyle(.plain)
                            .padding(.horizontal, 8)
                            .accessibilityLabel("Buy \(item.name), \(item.quantity, specifier: "%g") \(item.unit)")
                            .accessibilityHint("Tap to mark as bought")
                        }
                    } header: {
                        Text(category.capitalized)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal)
                    }
                }

                if sessionStore.snapshot.grocery.isEmpty {
                    VStack(spacing: 6) {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.system(size: 24))
                            .foregroundStyle(.green)
                        Text("All done!")
                            .font(.caption)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 20)
                }
            }
        }
        .navigationTitle("Grocery")
    }
}
