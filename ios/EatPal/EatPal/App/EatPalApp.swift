import SwiftUI

@main
struct EatPalApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var authViewModel = AuthViewModel()
    @StateObject private var appState = AppState()
    @StateObject private var deepLinkHandler = DeepLinkHandler.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authViewModel)
                .environmentObject(appState)
                .environmentObject(deepLinkHandler)
                .onOpenURL { url in
                    deepLinkHandler.handle(url: url)
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

    // Handle notification taps when app is in foreground
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .badge]
    }

    // Handle notification response (user tapped notification)
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let categoryIdentifier = response.notification.request.content.categoryIdentifier
        print("Notification tapped: \(categoryIdentifier)")
    }
}
