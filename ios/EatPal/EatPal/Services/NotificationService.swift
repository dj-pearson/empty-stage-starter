import Foundation
import UIKit
@preconcurrency import UserNotifications
@preconcurrency import Supabase

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
        #if DEBUG
        print("APNs device token: \(token)")
        #endif

        // Store token in Supabase push_notifications table
        struct PushTokenPayload: Encodable {
            let endpoint: String
            let platform: String
            let keys: [String: String]
        }
        let payload = PushTokenPayload(
            endpoint: token,
            platform: "ios",
            keys: ["apns_token": token]
        )
        do {
            try await SupabaseManager.client.from("push_notifications")
                .upsert(payload)
                .execute()
        } catch {
            #if DEBUG
            print("Failed to store push token: \(error)")
            #endif
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

    // MARK: - Topic-based preferences (US-239)

    /// Each user-facing notification topic. Backed by a UserDefaults key for
    /// the toggle and another for the daily delivery time (when applicable).
    enum Topic: String, CaseIterable, Identifiable {
        case mealReminders
        case groceryReady
        case tryBite
        case expiringFood
        case aiSummary
        case streakMilestone

        var id: String { rawValue }

        var title: String {
            switch self {
            case .mealReminders: return "Meal-plan reminders"
            case .groceryReady:  return "Grocery list ready"
            case .tryBite:       return "Try-bite achieved"
            case .expiringFood:  return "Expiring food"
            case .aiSummary:     return "AI weekly summary"
            case .streakMilestone: return "Streak milestones"
            }
        }

        var subtitle: String {
            switch self {
            case .mealReminders:  return "Daily meal-time pings"
            case .groceryReady:   return "When the auto-generated list is ready"
            case .tryBite:        return "When a kid tries a new food"
            case .expiringFood:   return "Pantry items about to expire (US-230)"
            case .aiSummary:      return "Sunday roundup + next-week ideas"
            case .streakMilestone:return "Badge unlocks + try-bite streaks"
            }
        }

        var icon: String {
            switch self {
            case .mealReminders:  return "fork.knife.circle.fill"
            case .groceryReady:   return "cart.badge.plus"
            case .tryBite:        return "star.fill"
            case .expiringFood:   return "calendar.badge.exclamationmark"
            case .aiSummary:      return "sparkles"
            case .streakMilestone:return "flame.fill"
            }
        }

        /// Topics that schedule a daily local notification at a configurable time.
        var supportsDailyTime: Bool {
            switch self {
            case .mealReminders, .groceryReady, .aiSummary: return true
            case .tryBite, .expiringFood, .streakMilestone: return false
            }
        }

        var enabledKey: String { "notif.\(rawValue).enabled" }
        var hourKey: String   { "notif.\(rawValue).hour" }
        var minuteKey: String { "notif.\(rawValue).minute" }

        /// Default daily-delivery time per topic.
        var defaultHour: Int {
            switch self {
            case .mealReminders: return 8
            case .groceryReady:  return 17
            case .aiSummary:     return 9
            default: return 9
            }
        }

        var defaultMinute: Int { 0 }
    }

    private static let muteUntilDefaultsKey = "notif.muteUntil"

    /// Until-when (epoch seconds) all notifications are silenced.
    /// nil when not muted.
    var mutedUntil: Date? {
        get {
            let v = UserDefaults.standard.double(forKey: Self.muteUntilDefaultsKey)
            guard v > 0 else { return nil }
            let date = Date(timeIntervalSince1970: v)
            return date > Date() ? date : nil
        }
        set {
            if let newValue {
                UserDefaults.standard.set(newValue.timeIntervalSince1970, forKey: Self.muteUntilDefaultsKey)
            } else {
                UserDefaults.standard.removeObject(forKey: Self.muteUntilDefaultsKey)
            }
        }
    }

    func mute(forSeconds seconds: TimeInterval) {
        mutedUntil = Date().addingTimeInterval(seconds)
        center.removeAllPendingNotificationRequests()
    }

    func unmute() {
        mutedUntil = nil
    }

    /// Fire a test notification right now so the user can preview the
    /// content + sound for a topic.
    func fireTestNotification(for topic: Topic) async {
        let content = UNMutableNotificationContent()
        content.title = "EatPal · \(topic.title)"
        content.body = sampleBody(for: topic)
        content.sound = .default
        content.categoryIdentifier = topic.rawValue.uppercased()

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 2, repeats: false)
        let request = UNNotificationRequest(
            identifier: "test-\(topic.rawValue)-\(Date().timeIntervalSince1970)",
            content: content,
            trigger: trigger
        )
        try? await center.add(request)
    }

    private func sampleBody(for topic: Topic) -> String {
        switch topic {
        case .mealReminders:  return "Lunch coming up in 30 minutes."
        case .groceryReady:   return "Your shopping list for this week is ready."
        case .tryBite:        return "Sarah just tried broccoli — log a result?"
        case .expiringFood:   return "3 foods in your pantry expire this week."
        case .aiSummary:      return "Last week: 5 try-bites, 12 wins. Tap for next week's ideas."
        case .streakMilestone:return "5-day try-bite streak unlocked! 🎉"
        }
    }
}
