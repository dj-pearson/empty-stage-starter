import Foundation
import CryptoKit

/// US-245: Lightweight, typed event-tracking layer.
///
/// Routes through `SentryService.leaveBreadcrumb` so events show up in any
/// captured error report's breadcrumb trail without requiring a separate
/// product-analytics SDK. When PostHog (or similar) is added, only this file
/// needs to learn about it — call sites already have stable, parameterless
/// event names.
///
/// ## PII guarantees
///
/// - Kid IDs are SHA256-hashed and truncated to 8 chars before leaving the
///   device. We can still group events per-kid without exposing the raw UUID.
/// - User-typed strings (food names, recipe titles, notes) are NEVER sent.
///   Only structured enum-derived properties pass through.
/// - Standard properties (app_version, locale, is_offline) are device-level
///   metadata, not personal data.
@MainActor
enum AnalyticsService {
    // MARK: - Public API

    /// Record a typed event. Properties merge with the standard envelope
    /// (app_version, locale, is_offline) before forwarding to the breadcrumb
    /// trail.
    static func track(_ event: AnalyticsEvent) {
        let payload = redact(event.properties)
            .merging(envelope) { _, new in new }

        SentryService.leaveBreadcrumb(
            category: event.category,
            message: event.name,
            data: payload
        )
    }

    /// Record a screen view — fired from `.task {}` on each major surface so
    /// screen-time funnels are reconstructable post-hoc.
    static func screen(_ name: String, properties: [String: String] = [:]) {
        let payload = redact(properties)
            .merging(envelope) { _, new in new }

        SentryService.leaveBreadcrumb(
            category: "screen",
            message: name,
            data: payload
        )
    }

    // MARK: - PII-safe identifiers

    /// SHA256-hash a raw kid/user UUID to a stable 8-char tag. Same input
    /// always yields the same output so we can group events per-kid without
    /// the raw identifier ever leaving the device.
    ///
    /// `nonisolated` because the function is pure (no actor-isolated state
    /// touched) and `AnalyticsEvent.properties` — a non-isolated computed
    /// property — needs to call it synchronously when building the event
    /// payload. Without this, Swift 6 strict concurrency rejects the call
    /// site as "main actor-isolated method called from nonisolated context".
    nonisolated static func hash(_ raw: String?) -> String? {
        guard let raw, !raw.isEmpty else { return nil }
        let data = Data(raw.utf8)
        let digest = SHA256.hash(data: data)
        return digest.prefix(4)
            .map { String(format: "%02x", $0) }
            .joined()
    }

    // MARK: - Internals

    /// Standard properties attached to every event.
    private static var envelope: [String: String] {
        var dict: [String: String] = [
            "app_version": appVersion,
            "locale": Locale.current.identifier,
            "is_offline": NetworkMonitor.shared.isConnected ? "false" : "true"
        ]
        // Build number is informational only — useful for separating staging
        // test events from production traffic in Sentry filters.
        dict["build"] = appBuild
        return dict
    }

    /// Drop any property key that looks like raw PII. Belt-and-braces: callers
    /// shouldn't be sending these anyway, but this catches mistakes before
    /// they leave the device.
    private static func redact(_ props: [String: String]) -> [String: String] {
        let blocked: Set<String> = [
            "name", "first_name", "last_name", "email", "phone",
            "address", "kid_name", "child_name", "user_name", "note", "notes"
        ]
        var clean: [String: String] = [:]
        for (key, value) in props where !blocked.contains(key.lowercased()) {
            clean[key] = value
        }
        return clean
    }

    private static var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    }

    private static var appBuild: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
    }
}

// MARK: - Event vocabulary

/// All product-analytics events the app emits. Adding a case is the only way
/// to introduce a new event — string literals at call sites would defeat the
/// whole point of having stable, queryable names.
enum AnalyticsEvent {
    // CRUD lifecycle ─ entity created, edited, deleted
    case foodAdded(via: EntrySource, category: String?)
    case foodUpdated
    case foodDeleted

    case kidAdded
    case kidUpdated(field: KidField)
    case kidDeleted

    case recipeCreated(via: EntrySource)
    case recipeUpdated
    case recipeDeleted
    case recipeImported(source: ImportSource, success: Bool)

    case mealPlanned(slot: String, kidId: String?)
    case mealResultLogged(result: String, kidId: String?)
    case mealRemoved
    /// US-262: parent confirmed a planned recipe was eaten; pantry was
    /// debited and recipe-sourced grocery items got auto-checked.
    case mealMadeLogged(debitedCount: Int, checkedCount: Int)

    /// US-270: "What can I make?" sheet was opened.
    case cookableMatchOpened
    /// US-270: user added a cookable-match recipe to the meal plan.
    case cookableRecipeAddedToPlan
    /// US-270: user added a cookable-match's missing ingredients to the
    /// grocery list.
    case cookableMissingAddedToGrocery(count: Int)

    case groceryItemAdded(via: EntrySource)
    case groceryItemChecked(method: CheckMethod)
    case groceryItemDeleted
    case groceryListCleared(checkedCount: Int)
    case groceryGeneratedFromPlan(itemCount: Int)

    // Feature-level events — surface usage of high-value flows
    case aiPlanGenerated(promptType: String)
    case aiCoachMessageSent(messageCount: Int)
    case quizStarted
    case quizCompleted(personality: String, kidId: String?)
    case shoppingModeStarted
    case shoppingModeExited(boughtCount: Int, remaining: Int)
    case healthImportRequested(fields: Int)
    case starterTemplateApplied(templateId: String)
    case paywallShown(source: String)
    case purchaseCompleted(productId: String)

    // Auth lifecycle — coarse signals only, never tied to email/name
    case signInStarted(method: String)
    case signInCompleted(method: String)
    case signOutCompleted

    /// Stable event name. Snake-case is conventional for analytics IDs and
    /// keeps these queryable across web/iOS/Android.
    var name: String {
        switch self {
        case .foodAdded:                return "food_added"
        case .foodUpdated:              return "food_updated"
        case .foodDeleted:              return "food_deleted"
        case .kidAdded:                 return "kid_added"
        case .kidUpdated:               return "kid_updated"
        case .kidDeleted:               return "kid_deleted"
        case .recipeCreated:            return "recipe_created"
        case .recipeUpdated:            return "recipe_updated"
        case .recipeDeleted:            return "recipe_deleted"
        case .recipeImported:           return "recipe_imported"
        case .mealPlanned:              return "meal_planned"
        case .mealResultLogged:         return "meal_result_logged"
        case .mealRemoved:              return "meal_removed"
        case .mealMadeLogged:           return "meal_made_logged"
        case .cookableMatchOpened:      return "cookable_match_opened"
        case .cookableRecipeAddedToPlan: return "cookable_recipe_added_to_plan"
        case .cookableMissingAddedToGrocery: return "cookable_missing_added_to_grocery"
        case .groceryItemAdded:         return "grocery_item_added"
        case .groceryItemChecked:       return "grocery_item_checked"
        case .groceryItemDeleted:       return "grocery_item_deleted"
        case .groceryListCleared:       return "grocery_list_cleared"
        case .groceryGeneratedFromPlan: return "grocery_generated_from_plan"
        case .aiPlanGenerated:          return "ai_plan_generated"
        case .aiCoachMessageSent:       return "ai_coach_message_sent"
        case .quizStarted:              return "quiz_started"
        case .quizCompleted:            return "quiz_completed"
        case .shoppingModeStarted:      return "shopping_mode_started"
        case .shoppingModeExited:       return "shopping_mode_exited"
        case .healthImportRequested:    return "health_import_requested"
        case .starterTemplateApplied:   return "starter_template_applied"
        case .paywallShown:             return "paywall_shown"
        case .purchaseCompleted:        return "purchase_completed"
        case .signInStarted:            return "sign_in_started"
        case .signInCompleted:          return "sign_in_completed"
        case .signOutCompleted:         return "sign_out_completed"
        }
    }

    /// Sentry-breadcrumb category. Lets us filter all CRUD vs all feature
    /// events vs all auth events from the dashboard.
    var category: String {
        switch self {
        case .foodAdded, .foodUpdated, .foodDeleted,
             .kidAdded, .kidUpdated, .kidDeleted,
             .recipeCreated, .recipeUpdated, .recipeDeleted,
             .mealPlanned, .mealResultLogged, .mealRemoved, .mealMadeLogged,
             .groceryItemAdded, .groceryItemChecked,
             .groceryItemDeleted, .groceryListCleared:
            return "crud"
        case .recipeImported, .aiPlanGenerated, .aiCoachMessageSent,
             .quizStarted, .quizCompleted,
             .shoppingModeStarted, .shoppingModeExited,
             .healthImportRequested, .starterTemplateApplied,
             .groceryGeneratedFromPlan,
             .cookableMatchOpened, .cookableRecipeAddedToPlan,
             .cookableMissingAddedToGrocery:
            return "feature"
        case .paywallShown, .purchaseCompleted:
            return "monetization"
        case .signInStarted, .signInCompleted, .signOutCompleted:
            return "auth"
        }
    }

    /// Per-event properties. Each value MUST be either an enum-derived string
    /// or a hashed identifier — never a user-typed string.
    var properties: [String: String] {
        switch self {
        case .foodAdded(let via, let category):
            var p = ["via": via.rawValue]
            if let category { p["category"] = category }
            return p
        case .foodUpdated, .foodDeleted, .kidAdded, .kidDeleted,
             .recipeUpdated, .recipeDeleted,
             .mealRemoved, .groceryItemDeleted,
             .quizStarted, .shoppingModeStarted, .signOutCompleted,
             .cookableMatchOpened, .cookableRecipeAddedToPlan:
            return [:]
        case .kidUpdated(let field):
            return ["field": field.rawValue]
        case .recipeCreated(let via):
            return ["via": via.rawValue]
        case .recipeImported(let source, let success):
            return ["source": source.rawValue, "success": success ? "true" : "false"]
        case .mealPlanned(let slot, let kidId):
            var p = ["slot": slot]
            if let hashed = AnalyticsService.hash(kidId) { p["kid_id"] = hashed }
            return p
        case .mealResultLogged(let result, let kidId):
            var p = ["result": result]
            if let hashed = AnalyticsService.hash(kidId) { p["kid_id"] = hashed }
            return p
        case .mealMadeLogged(let debited, let checked):
            return [
                "debited_count": String(debited),
                "checked_count": String(checked)
            ]
        case .cookableMissingAddedToGrocery(let count):
            return ["count": String(count)]
        case .groceryItemAdded(let via):
            return ["via": via.rawValue]
        case .groceryItemChecked(let method):
            return ["method": method.rawValue]
        case .groceryListCleared(let count):
            return ["checked_count": String(count)]
        case .groceryGeneratedFromPlan(let count):
            return ["item_count": String(count)]
        case .aiPlanGenerated(let promptType):
            return ["prompt_type": promptType]
        case .aiCoachMessageSent(let messageCount):
            return ["message_count": String(messageCount)]
        case .quizCompleted(let personality, let kidId):
            var p = ["personality": personality]
            if let hashed = AnalyticsService.hash(kidId) { p["kid_id"] = hashed }
            return p
        case .shoppingModeExited(let bought, let remaining):
            return ["bought_count": String(bought), "remaining": String(remaining)]
        case .healthImportRequested(let fields):
            return ["fields": String(fields)]
        case .starterTemplateApplied(let templateId):
            return ["template_id": templateId]
        case .paywallShown(let source):
            return ["source": source]
        case .purchaseCompleted(let productId):
            return ["product_id": productId]
        case .signInStarted(let method), .signInCompleted(let method):
            return ["method": method]
        }
    }
}

// MARK: - Event property enums

/// Where a record was created. Helps us see which entry surfaces actually
/// drive real input vs. which are just discoverable.
enum EntrySource: String {
    case manual
    case scan
    case voice
    case photo
    case `import` = "import"
    case suggestion
    case template
    case drag
    case ai
}

enum ImportSource: String {
    case url
    case shareExtension = "share_extension"
}

enum CheckMethod: String {
    case tap
    case swipe
    case shoppingMode = "shopping_mode"
}

/// Coarse field categories for kid-profile edits — fine enough to see which
/// fields parents actually touch, vague enough to never expose values.
enum KidField: String {
    case basicInfo = "basic_info"
    case allergens
    case dietary
    case preferences
    case measurements
    case healthImport = "health_import"
    case quiz
    case other
}
