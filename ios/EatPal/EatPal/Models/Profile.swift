import Foundation

/// A row of `public.profiles` (US-809).
///
/// The table is keyed by the auth user id -- on `profiles` the primary key IS
/// `auth.users.id`, not a separate `user_id` column. That shape is what US-801
/// had to fix a trigger against, so it is worth stating here rather than
/// leaving the next reader to assume the `user_id` convention the other tables
/// use.
struct Profile: Codable, Identifiable {
    let id: String
    var fullName: String?
    var onboardingCompleted: Bool?

    enum CodingKeys: String, CodingKey {
        case id
        case fullName = "full_name"
        case onboardingCompleted = "onboarding_completed"
    }
}

/// A partial write to `profiles`.
///
/// Every field optional, so the synthesized `encodeIfPresent` omits whatever is
/// not set and a write of one column does not blank the others. Same shape as
/// `KidUpdate` and the rest.
///
/// Deliberately only the two columns a client has any business writing.
/// `profiles` also carries `subscription_tier`, `is_locked`, `lock_reason` and
/// the failed-login counters; those are set by Stripe webhooks, by the admin
/// screens and by the auth rate limiter respectively, and an offline queue that
/// could replay them would be a way to unlock an account from a phone.
struct ProfileUpdate: Codable {
    // Explicit `= nil` so the memberwise initializer has defaults and a caller
    // can set one column by name: ProfileUpdate(onboardingCompleted: true).
    var fullName: String? = nil
    var onboardingCompleted: Bool? = nil

    enum CodingKeys: String, CodingKey {
        case fullName = "full_name"
        case onboardingCompleted = "onboarding_completed"
    }
}
