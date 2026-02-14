import SwiftUI

@main
struct EatPalApp: App {
    @StateObject private var authViewModel = AuthViewModel()
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authViewModel)
                .environmentObject(appState)
        }
    }
}
