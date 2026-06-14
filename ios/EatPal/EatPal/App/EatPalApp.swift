import SwiftUI
import TipKit

@main
struct EatPalApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var authViewModel = AuthViewModel()
    @StateObject private var appState = AppState()
    @StateObject private var deepLinkHandler = DeepLinkHandler.shared

    init() {
        // Sentry (US-151): must initialise before anything that might crash
        // so early failures are captured. No-op in DEBUG / when DSN missing.
        SentryService.configure()

        // TipKit: register gesture-discovery tips (US-138).
        // Uses default datastore. Tips are silent when their rules evaluate to false.
        try? Tips.configure([
            .displayFrequency(.immediate),
            .datastoreLocation(.applicationDefault)
        ])
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authViewModel)
                .environmentObject(appState)
                .environmentObject(deepLinkHandler)
                .onOpenURL { url in
                    deepLinkHandler.handle(url: url)
                }
                // US-296 (Tier 1): when a `eatpal://grocery/import?text=…` URL
                // lands, DeepLinkHandler has already enqueued the parsed lines.
                // Kick the drain immediately so the user sees their items
                // without waiting for the next loadAllData() tick.
                .onReceive(deepLinkHandler.$activeDestination) { destination in
                    if case .groceryImport = destination {
                        Task { await appState.drainPendingGroceryImports() }
                    }
                    // US-309: eatpal://recipe/import lands with the parsed
                    // recipe already enqueued by DeepLinkHandler. Kick the
                    // drain immediately so the recipe appears in /recipes
                    // without waiting for the next loadAllData() tick.
                    if case .recipeImport = destination {
                        Task { await appState.drainPendingRecipeImports() }
                    }
                }
                .task {
                    // US-237: hand AppState to the WatchConnectivity service
                    // once it's ready. Idempotent — re-activation is cheap.
                    WatchConnectivityService.shared.start(appState: appState)

                    // US-403/US-404: (re)schedule enabled daily reminders on
                    // launch so persisted toggles actually fire, and so
                    // reminders resume automatically once a mute window passes.
                    await NotificationService.shared.checkAuthorizationStatus()
                    if NotificationService.shared.isAuthorized {
                        await NotificationService.shared.rescheduleAllTopics()
                    }
                }
        }
    }
}

/// UIKit AppDelegate for handling push notification registration callbacks.
class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task {
            await NotificationService.shared.handleDeviceToken(deviceToken)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("Failed to register for remote notifications: \(error)")
    }

    // Handle notification presentation when app is in foreground
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        // US-404: honour an active mute window — suppress the foreground
        // banner/sound while muted instead of presenting it anyway.
        if let mutedUntil = await NotificationService.shared.mutedUntil,
           mutedUntil > Date() {
            return []
        }
        return [.banner, .sound, .badge]
    }

    // Handle notification response (user tapped notification)
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        // US-406: route the tap to the relevant screen via the same
        // destination-consumption path as deep links, instead of just
        // logging the category and landing on the Planner.
        let categoryIdentifier = response.notification.request.content.categoryIdentifier
        await DeepLinkHandler.shared.routeFromNotification(categoryIdentifier: categoryIdentifier)
    }
}
