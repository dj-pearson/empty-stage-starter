import Foundation

/// US-596 / US-606: per-kid, per-food exposure ladder state.
///
/// Mirrors `public.kid_food_ladder`. The eight rungs are the same labels the
/// app has always written to `food_attempts.stage`, so the ladder and the
/// attempt log speak one vocabulary across both platforms.
struct KidFoodLadder: Identifiable, Codable, Equatable {
    let id: String
    var kidId: String
    var foodId: String
    var currentRung: String
    var consecutiveSuccesses: Int
    var consecutiveHolds: Int
    var consecutiveRefusals: Int
    var status: String
    /// ISO date `yyyy-MM-dd`, or nil when nothing is scheduled.
    var nextDueOn: String?
    var lastAttemptAt: String?
    var pairedSafeFoodId: String?
    var preferredPrep: String?
    var preferredMealSlot: String?
    var pausedReason: String?

    enum CodingKeys: String, CodingKey {
        case id
        case kidId = "kid_id"
        case foodId = "food_id"
        case currentRung = "current_rung"
        case consecutiveSuccesses = "consecutive_successes"
        case consecutiveHolds = "consecutive_holds"
        case consecutiveRefusals = "consecutive_refusals"
        case status
        case nextDueOn = "next_due_on"
        case lastAttemptAt = "last_attempt_at"
        case pairedSafeFoodId = "paired_safe_food_id"
        case preferredPrep = "preferred_prep"
        case preferredMealSlot = "preferred_meal_slot"
        case pausedReason = "paused_reason"
    }

    /// Rung as the typed enum, falling back to the gentlest step for a label
    /// this build does not know about (a newer client writing a new rung must
    /// never crash an older one).
    var rung: LadderRung {
        LadderRung(rawValue: currentRung) ?? .looking
    }

    var ladderStatus: LadderStatus {
        LadderStatus(rawValue: status) ?? .active
    }
}

/// Insert payload. The server fills id/created_at/updated_at via defaults.
struct KidFoodLadderInsert: Codable {
    var kidId: String
    var foodId: String
    var currentRung: String = LadderRung.looking.rawValue
    var consecutiveSuccesses: Int = 0
    var consecutiveHolds: Int = 0
    var consecutiveRefusals: Int = 0
    var status: String = LadderStatus.active.rawValue
    var nextDueOn: String? = nil
    var pairedSafeFoodId: String? = nil
    var preferredPrep: String? = nil
    var preferredMealSlot: String? = nil

    enum CodingKeys: String, CodingKey {
        case kidId = "kid_id"
        case foodId = "food_id"
        case currentRung = "current_rung"
        case consecutiveSuccesses = "consecutive_successes"
        case consecutiveHolds = "consecutive_holds"
        case consecutiveRefusals = "consecutive_refusals"
        case status
        case nextDueOn = "next_due_on"
        case pairedSafeFoodId = "paired_safe_food_id"
        case preferredPrep = "preferred_prep"
        case preferredMealSlot = "preferred_meal_slot"
    }
}

/// Partial update. Every field optional so a caller only sends what changed;
/// `nil` means "leave alone".
///
/// Encodable rather than Codable on purpose: the double-optional fields exist
/// so a caller can distinguish "don't touch this column" from "write NULL",
/// and that distinction has no meaning on the way back in. Nothing decodes an
/// update payload, so synthesising a decoder for `String??` would be dead code
/// with a subtle failure mode.
struct KidFoodLadderUpdate: Encodable {
    var currentRung: String? = nil
    var consecutiveSuccesses: Int? = nil
    var consecutiveHolds: Int? = nil
    var consecutiveRefusals: Int? = nil
    var status: String? = nil
    /// Double-optional: `nil` omits the key, `.some(nil)` writes SQL NULL.
    var nextDueOn: String?? = nil
    var lastAttemptAt: String? = nil
    var pairedSafeFoodId: String? = nil
    var preferredPrep: String? = nil
    var preferredMealSlot: String? = nil
    var pausedReason: String?? = nil

    enum CodingKeys: String, CodingKey {
        case currentRung = "current_rung"
        case consecutiveSuccesses = "consecutive_successes"
        case consecutiveHolds = "consecutive_holds"
        case consecutiveRefusals = "consecutive_refusals"
        case status
        case nextDueOn = "next_due_on"
        case lastAttemptAt = "last_attempt_at"
        case pairedSafeFoodId = "paired_safe_food_id"
        case preferredPrep = "preferred_prep"
        case preferredMealSlot = "preferred_meal_slot"
        case pausedReason = "paused_reason"
    }

    /// Double-optional fields have to be encoded by hand: the synthesized
    /// encoder skips `.some(nil)`, which would silently turn "clear this
    /// column" into "leave it as it was" — and a next_due_on that fails to
    /// clear is a paused food that keeps getting scheduled.
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(currentRung, forKey: .currentRung)
        try container.encodeIfPresent(consecutiveSuccesses, forKey: .consecutiveSuccesses)
        try container.encodeIfPresent(consecutiveHolds, forKey: .consecutiveHolds)
        try container.encodeIfPresent(consecutiveRefusals, forKey: .consecutiveRefusals)
        try container.encodeIfPresent(status, forKey: .status)
        try container.encodeIfPresent(lastAttemptAt, forKey: .lastAttemptAt)
        try container.encodeIfPresent(pairedSafeFoodId, forKey: .pairedSafeFoodId)
        try container.encodeIfPresent(preferredPrep, forKey: .preferredPrep)
        try container.encodeIfPresent(preferredMealSlot, forKey: .preferredMealSlot)

        if let nextDueOn {
            try container.encode(nextDueOn, forKey: .nextDueOn)
        }
        if let pausedReason {
            try container.encode(pausedReason, forKey: .pausedReason)
        }
    }
}

/// Attempt insert payload used by one-tap logging (US-608). A narrow view of
/// `food_attempts` — the detailed sheet still writes the full shape.
struct FoodAttemptInsert: Codable {
    var kidId: String
    var foodId: String
    var stage: String
    var outcome: String
    var attemptedAt: String
    var mealSlot: String?
    var preparationMethod: String?

    enum CodingKeys: String, CodingKey {
        case kidId = "kid_id"
        case foodId = "food_id"
        case stage
        case outcome
        case attemptedAt = "attempted_at"
        case mealSlot = "meal_slot"
        case preparationMethod = "preparation_method"
    }
}

/// Minimal decode target for reading back an inserted attempt's id.
struct FoodAttemptIdRow: Decodable {
    let id: String
}
