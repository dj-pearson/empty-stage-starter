import Foundation

/// US-597 / US-606: exposure ladder progression policy — Swift mirror.
///
/// This is a rung-for-rung, threshold-for-threshold mirror of
/// `src/lib/exposureLadder.ts`. The two implementations are held together by
/// `ExposureLadderPolicyTests`, which runs the same cases as the TypeScript
/// suite; if one platform's rules drift, those tests fail.
///
/// The rule that matters most: a refusal steps the rung DOWN. Repeating an
/// exposure a child just refused raises the pressure at the table, which is
/// the opposite of what this models. It lives in one pure type on each
/// platform precisely so it cannot be lost in a view somewhere.
///
/// Deliberately in the app target rather than `Shared/`: `Shared/` is also
/// compiled into the widget and share extensions, which do not include
/// `EatPal/Models`, so a policy that references `KidFoodLadder` would break
/// those builds.

/// Ordered rungs, gentlest first.
enum LadderRung: String, CaseIterable, Codable, Equatable {
    case looking
    case touching
    case smelling
    case licking
    case tinyTaste = "tiny_taste"
    case smallBite = "small_bite"
    case fullBite = "full_bite"
    case fullPortion = "full_portion"

    var index: Int {
        LadderRung.allCases.firstIndex(of: self) ?? 0
    }

    /// Next rung up, or nil at the top of the ladder.
    var next: LadderRung? {
        let i = index
        guard i < LadderRung.allCases.count - 1 else { return nil }
        return LadderRung.allCases[i + 1]
    }

    /// Next rung down; clamps at the bottom rather than underflowing.
    var previous: LadderRung {
        let i = index
        guard i > 0 else { return LadderRung.allCases[0] }
        return LadderRung.allCases[i - 1]
    }

    var displayName: String {
        switch self {
        case .looking: return "Looking"
        case .touching: return "Touching"
        case .smelling: return "Smelling"
        case .licking: return "Licking"
        case .tinyTaste: return "Tiny taste"
        case .smallBite: return "Small bite"
        case .fullBite: return "Full bite"
        case .fullPortion: return "Full portion"
        }
    }

    var emoji: String {
        switch self {
        case .looking: return "👀"
        case .touching: return "✋"
        case .smelling: return "👃"
        case .licking: return "👅"
        case .tinyTaste: return "🔬"
        case .smallBite: return "🍴"
        case .fullBite: return "😋"
        case .fullPortion: return "🎉"
        }
    }
}

enum LadderStatus: String, Codable, Equatable {
    case active
    case paused
    case mastered
    case backedOff = "backed_off"
}

/// Outcomes already used by `food_attempts.outcome`.
enum LadderOutcome: String, Codable, Equatable {
    case success
    case partial
    case refused
    case tantrum
}

/// What a one-tap control reports, before it is mapped to an outcome.
enum QuickLogResult: String, CaseIterable {
    case accepted
    case held
    case refused

    var outcome: LadderOutcome {
        switch self {
        case .accepted: return .success
        case .held: return .partial
        case .refused: return .refused
        }
    }

    /// `plan_entries.result` vocabulary, which predates the ladder.
    var planResult: String {
        switch self {
        case .accepted: return "ate"
        case .held: return "tasted"
        case .refused: return "refused"
        }
    }
}

/// The mutable part of a ladder row — everything progression touches.
struct LadderState: Equatable {
    var rung: LadderRung
    var consecutiveSuccesses: Int
    var consecutiveHolds: Int
    var consecutiveRefusals: Int
    var status: LadderStatus
    var nextDueOn: String?
    var lastAttemptAt: String?
    var pausedReason: String?

    init(
        rung: LadderRung = .looking,
        consecutiveSuccesses: Int = 0,
        consecutiveHolds: Int = 0,
        consecutiveRefusals: Int = 0,
        status: LadderStatus = .active,
        nextDueOn: String? = nil,
        lastAttemptAt: String? = nil,
        pausedReason: String? = nil
    ) {
        self.rung = rung
        self.consecutiveSuccesses = consecutiveSuccesses
        self.consecutiveHolds = consecutiveHolds
        self.consecutiveRefusals = consecutiveRefusals
        self.status = status
        self.nextDueOn = nextDueOn
        self.lastAttemptAt = lastAttemptAt
        self.pausedReason = pausedReason
    }

    init(row: KidFoodLadder) {
        self.init(
            rung: row.rung,
            consecutiveSuccesses: row.consecutiveSuccesses,
            consecutiveHolds: row.consecutiveHolds,
            consecutiveRefusals: row.consecutiveRefusals,
            status: row.ladderStatus,
            nextDueOn: row.nextDueOn,
            lastAttemptAt: row.lastAttemptAt,
            pausedReason: row.pausedReason
        )
    }
}

enum ExposureLadderPolicy {
    /// Consecutive successes at a rung before the child moves up.
    static let advanceThreshold = 2
    /// Days before a food that went fine (or held) comes back around.
    static let repeatDays = 2
    /// Days of rest after a refusal. Deliberately longer than `repeatDays`.
    static let cooldownDays = 4
    /// Days of rest after real distress. Also flips the row to backed off.
    static let tantrumCooldownDays = 7
    /// Refusals in a row before the food rests until a parent says otherwise.
    static let autoPauseRefusals = 2
    /// Hard ceiling on exposures due for one child on one day.
    static let maxActiveExposures = 3

    /// Add whole days to an ISO `yyyy-MM-dd` date in UTC.
    ///
    /// Deliberately not `Calendar.current`: a cooldown computed in a shifting
    /// local calendar can land a day early, which on this feature means
    /// re-presenting a refused food sooner than the policy says.
    static func addDays(to isoDate: String, days: Int) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"

        guard let date = formatter.date(from: String(isoDate.prefix(10))) else {
            return isoDate
        }
        return formatter.string(from: date.addingTimeInterval(TimeInterval(days) * 86_400))
    }

    /// Today as an ISO `yyyy-MM-dd` date in the parent's own calendar, so
    /// "due today" matches the day they are actually living in.
    static func todayIso(now: Date = Date(), timeZone: TimeZone = .current) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: now)
    }

    /// Fold one attempt outcome into a ladder state. Pure; returns a new value.
    static func apply(
        _ state: LadderState,
        outcome: LadderOutcome,
        today: String,
        attemptAt: String? = nil
    ) -> LadderState {
        var next = state
        next.lastAttemptAt = attemptAt ?? today

        switch outcome {
        case .success:
            next.consecutiveHolds = 0
            next.consecutiveRefusals = 0
            next.consecutiveSuccesses = state.consecutiveSuccesses + 1

            if next.consecutiveSuccesses >= advanceThreshold {
                guard let up = state.rung.next else {
                    // Already accepting a full portion, twice over. Nothing
                    // left to climb: the food graduates.
                    next.status = .mastered
                    next.nextDueOn = nil
                    next.consecutiveSuccesses = 0
                    return next
                }
                next.rung = up
                next.consecutiveSuccesses = 0
            }
            next.nextDueOn = addDays(to: today, days: repeatDays)
            return next

        case .partial:
            // Engaged but not all the way. Hold the rung — pushing up on a
            // partial gets a child ahead of their own comfort.
            next.consecutiveSuccesses = 0
            next.consecutiveRefusals = 0
            next.consecutiveHolds = state.consecutiveHolds + 1
            next.nextDueOn = addDays(to: today, days: repeatDays)
            return next

        case .refused:
            next.consecutiveSuccesses = 0
            next.consecutiveHolds = 0
            next.consecutiveRefusals = state.consecutiveRefusals + 1
            next.rung = state.rung.previous
            next.nextDueOn = addDays(to: today, days: cooldownDays)

            if next.consecutiveRefusals >= autoPauseRefusals {
                // Two in a row means this food rests until a parent chooses
                // to resume it. No nudge, no retry prompt.
                next.status = .paused
                next.pausedReason = "two_refusals"
                next.nextDueOn = nil
            }
            return next

        case .tantrum:
            next.consecutiveSuccesses = 0
            next.consecutiveHolds = 0
            next.consecutiveRefusals = state.consecutiveRefusals + 1
            next.rung = state.rung.previous
            next.status = .backedOff
            next.pausedReason = "distress"
            next.nextDueOn = addDays(to: today, days: tantrumCooldownDays)
            return next
        }
    }

    /// Convert a state into the update payload for `kid_food_ladder`.
    static func update(from state: LadderState) -> KidFoodLadderUpdate {
        KidFoodLadderUpdate(
            currentRung: state.rung.rawValue,
            consecutiveSuccesses: state.consecutiveSuccesses,
            consecutiveHolds: state.consecutiveHolds,
            consecutiveRefusals: state.consecutiveRefusals,
            status: state.status.rawValue,
            nextDueOn: .some(state.nextDueOn),
            lastAttemptAt: state.lastAttemptAt,
            pausedReason: .some(state.pausedReason)
        )
    }
}
