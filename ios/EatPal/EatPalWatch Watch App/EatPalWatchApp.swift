import SwiftUI

/// US-237: watchOS companion entry point.
///
/// Hosts a TabView with two screens (Today + Grocery) and wires up the
/// shared `WatchSessionStore` so both views read the same snapshot.
@main
struct EatPalWatchApp: App {
    @StateObject private var sessionStore = WatchSessionStore.shared

    var body: some Scene {
        WindowGroup {
            RootWatchView()
                .environmentObject(sessionStore)
        }
    }
}
