import Foundation
import UserNotifications

/// Manages push notification registration (APNs) and local notification scheduling.
@MainActor
final class NotificationService: ObservableObject {
    static let shared = NotificationService()

    @Published var isAuthorized = false
    @Published var authorizationStatus: UNAuthorizationStatus = .notDetermined

    private let center = UNUserNotificationCenter.current()

    private init() {}

    // MARK: - Authorization

    /// Requests notification permission from the user.
    func requestAuthorization() async -> Bool {
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            isAuthorized = granted
            if granted {
                await registerForRemoteNotifications()
            }
            return granted
        } catch {
            print("Notification authorization error: \(error)")
            return false
        }
    }

    /// Checks the current authorization status.
    func checkAuthorizationStatus() async {
        let settings = await center.notificationSettings()
        authorizationStatus = settings.authorizationStatus
        isAuthorized = settings.authorizationStatus == .authorized
    }

    /// Registers with APNs for remote push notifications.
    private func registerForRemoteNotifications() async {
        await MainActor.run {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    // MARK: - APNs Token

    /// Called by AppDelegate when APNs registration succeeds.
    /// Stores the device token in Supabase for server-side push.
    func handleDeviceToken(_ deviceToken: Data) async {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        print("APNs device token: \(token)")

        // Store token in Supabase push_notifications table
        do {
            try await SupabaseManager.client.from("push_notifications")
                .upsert([
                    "endpoint": token,
                    "platform": "ios",
                    "keys": ["apns_token": token]
                ] as [String: Any])
                .execute()
        } catch {
            print("Failed to store push token: \(error)")
        }
    }

    // MARK: - Local Notifications: Meal Reminders

    /// Schedules daily meal reminders based on user preferences.
    func scheduleMealReminders() async {
        // Remove old meal reminders
        center.removePendingNotificationRequests(withIdentifiers: [
            "meal-breakfast", "meal-lunch", "meal-dinner"
        ])

        let meals: [(id: String, title: String, hour: Int, minute: Int)] = [
            ("meal-breakfast", "Time for breakfast!", 8, 0),
            ("meal-lunch", "Time for lunch!", 12, 0),
            ("meal-dinner", "Time for dinner!", 18, 0),
        ]

        for meal in meals {
            let content = UNMutableNotificationContent()
            content.title = "EatPal"
            content.body = meal.title
            content.sound = .default
            content.categoryIdentifier = "MEAL_REMINDER"

            var dateComponents = DateComponents()
            dateComponents.hour = meal.hour
            dateComponents.minute = meal.minute

            let trigger = UNCalendarNotificationTrigger(
                dateMatching: dateComponents,
                repeats: true
            )

            let request = UNNotificationRequest(
                identifier: meal.id,
                content: content,
                trigger: trigger
            )

            try? await center.add(request)
        }
    }

    /// Schedules a grocery reminder for a specific time.
    func scheduleGroceryReminder(at date: Date, itemCount: Int) async {
        let content = UNMutableNotificationContent()
        content.title = "Grocery Reminder"
        content.body = "You have \(itemCount) items on your grocery list."
        content.sound = .default
        content.categoryIdentifier = "GROCERY_REMINDER"

        let components = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute],
            from: date
        )
        let trigger = UNCalendarNotificationTrigger(
            dateMatching: components,
            repeats: false
        )

        let request = UNNotificationRequest(
            identifier: "grocery-\(date.timeIntervalSince1970)",
            content: content,
            trigger: trigger
        )

        try? await center.add(request)
    }

    // MARK: - Cancel

    /// Removes all meal reminders.
    func cancelMealReminders() {
        center.removePendingNotificationRequests(withIdentifiers: [
            "meal-breakfast", "meal-lunch", "meal-dinner"
        ])
    }

    /// Removes all pending notifications.
    func cancelAll() {
        center.removeAllPendingNotificationRequests()
    }
}
