import SwiftUI

struct RootWatchView: View {
    @EnvironmentObject var sessionStore: WatchSessionStore

    var body: some View {
        if !sessionStore.snapshot.hasReceivedSnapshot {
            EmptyStateView()
        } else {
            TabView {
                TodayView()
                    .tag(0)
                GroceryWatchView()
                    .tag(1)
            }
            .tabViewStyle(.page)
        }
    }
}

/// Shown until the watch receives its first snapshot from the iPhone.
struct EmptyStateView: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "iphone.and.arrow.forward")
                .font(.system(size: 36))
                .foregroundStyle(.green)
            Text("Open EatPal on iPhone")
                .font(.headline)
                .multilineTextAlignment(.center)
            Text("We'll mirror today's meals + grocery list here once the iPhone app is open.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 8)
        }
        .padding()
    }
}
