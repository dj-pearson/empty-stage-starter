import ActivityKit
import SwiftUI
import WidgetKit

/// US-145: Live Activity UI for the grocery-trip. Rendered by the widget
/// extension on the Lock Screen and inside the Dynamic Island while an
/// active `GroceryTripAttributes` activity exists.
struct GroceryTripLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GroceryTripAttributes.self) { context in
            // Lock Screen / banner layout
            LockScreenView(context: context)
                .activityBackgroundTint(Color.green.opacity(0.1))
                .activitySystemActionForegroundColor(.green)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded
                DynamicIslandExpandedRegion(.leading) {
                    Label {
                        Text(context.attributes.listTitle)
                            .font(.caption)
                            .fontWeight(.medium)
                            .lineLimit(1)
                    } icon: {
                        Image(systemName: "cart.fill")
                            .foregroundStyle(.green)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(context.state.checkedCount)/\(context.state.totalCount)")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .monospacedDigit()
                }
                DynamicIslandExpandedRegion(.center) {
                    if !context.state.lastCheckedName.isEmpty {
                        Text("Just added: \(context.state.lastCheckedName)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ProgressView(value: context.state.progress)
                        .tint(.green)
                }
            } compactLeading: {
                Image(systemName: "cart.fill")
                    .foregroundStyle(.green)
            } compactTrailing: {
                Text("\(context.state.checkedCount)/\(context.state.totalCount)")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .monospacedDigit()
            } minimal: {
                Image(systemName: "cart.fill")
                    .foregroundStyle(.green)
            }
            .widgetURL(URL(string: "eatpal://openGroceryList"))
        }
    }
}

private struct LockScreenView: View {
    let context: ActivityViewContext<GroceryTripAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label {
                    Text(context.attributes.listTitle)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                } icon: {
                    Image(systemName: "cart.fill")
                        .foregroundStyle(.green)
                }

                Spacer()

                Text("\(context.state.checkedCount)/\(context.state.totalCount)")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .monospacedDigit()
                    .foregroundStyle(.green)
            }

            ProgressView(value: context.state.progress)
                .tint(.green)

            if !context.state.lastCheckedName.isEmpty {
                Text("Just added: \(context.state.lastCheckedName)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            } else if context.state.isComplete {
                Label("All done!", systemImage: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.green)
            } else {
                Text("Started \(context.attributes.startedAt, style: .relative)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding()
    }
}
