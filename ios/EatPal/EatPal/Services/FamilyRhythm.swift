import Foundation

/// The parent's side of the log: a household logging streak with one grace day
/// per week, this week's Monday-to-Sunday meter, and last week's recap.
///
/// A port of `src/lib/familyRhythm.ts`, rule for rule, so a parent sees the
/// same streak on the phone and on the web. It rewards the grown-ups for
/// logging, never the child for eating: a refusal logged counts exactly as
/// much as a clean plate. The child's own streak (`BadgeService.currentStreak`)
/// is a different rule and is untouched.
///
/// Pure. Days are 'yyyy-MM-dd' strings and all day arithmetic runs in UTC on
/// those strings, the same way the web walks them (US-818), so a DST change
/// can never count one calendar day twice.
enum FamilyRhythm {
    /// One missed day is forgiven per this many days. A second miss inside
    /// the window ends the streak. Mirrors GRACE_SPACING_DAYS.
    static let graceSpacingDays = 7

    /// The household goal: days with anything logged, Monday to Sunday.
    /// Mirrors WEEKLY_GOAL_DAYS.
    static let weeklyGoalDays = 5

    // MARK: - Day strings

    static let utcCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        return calendar
    }()

    /// Parses and prints a 'yyyy-MM-dd' key as UTC midnight.
    static let utcDay: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = utcCalendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static func addDays(_ iso: String, _ days: Int) -> String {
        guard let date = utcDay.date(from: String(iso.prefix(10))),
              let moved = utcCalendar.date(byAdding: .day, value: days, to: date) else { return iso }
        return utcDay.string(from: moved)
    }

    /// Whole days from `a` to `b` (b - a).
    static func dayDiff(_ a: String, _ b: String) -> Int {
        guard let from = utcDay.date(from: String(a.prefix(10))),
              let to = utcDay.date(from: String(b.prefix(10))) else { return 0 }
        return utcCalendar.dateComponents([.day], from: from, to: to).day ?? 0
    }

    /// Monday of the week holding `iso`.
    static func mondayOf(_ iso: String) -> String {
        guard let date = utcDay.date(from: String(iso.prefix(10))) else { return iso }
        // Calendar weekday: 1 = Sunday ... 7 = Saturday.
        let weekday = utcCalendar.component(.weekday, from: date)
        return addDays(iso, -((weekday + 5) % 7))
    }

    /// The local calendar day of a `food_attempts.attempted_at` value. A bare
    /// date is already a local day; a timestamp is read as an instant and
    /// placed in `timeZone`, as the web's `localDay` does.
    static func localDay(_ value: String, timeZone: TimeZone = .current) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespaces)
        if trimmed.count == 10, utcDay.date(from: trimmed) != nil { return trimmed }

        // Postgres sends microseconds, which not every ISO8601DateFormatter
        // option set accepts. The day does not depend on them, so drop them.
        let noFraction = trimmed.replacingOccurrences(
            of: #"\.\d+"#, with: "", options: .regularExpression
        )
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime]
        guard let instant = parser.date(from: noFraction) else { return nil }

        let out = DateFormatter()
        out.calendar = Calendar(identifier: .gregorian)
        out.locale = Locale(identifier: "en_US_POSIX")
        out.timeZone = timeZone
        out.dateFormat = "yyyy-MM-dd"
        return out.string(from: instant)
    }

    // MARK: - Streak

    struct Streak: Equatable {
        /// Logged days in the current streak. Missed days never count.
        let current: Int
        let best: Int
        let loggedToday: Bool
        /// The day the next grace day is available, or nil when one is in hand.
        let graceReadyOn: String?
        /// Not logging today would end a live streak tomorrow.
        let atRisk: Bool
    }

    /// Walks forward from the first logged day to today.
    ///
    /// A logged day adds one. A missed day is forgiven when it is the first
    /// miss or at least `graceSpacingDays` after the previous one; otherwise
    /// the streak restarts from the logged days since that previous miss.
    /// Today is neutral until it is logged: an evening with nothing yet is not
    /// a miss. Same walk as `parentStreak` in familyRhythm.ts.
    static func parentStreak(days: Set<String>, today: String) -> Streak {
        let loggedToday = days.contains(today)
        guard let first = days.filter({ $0 <= today }).min() else {
            return Streak(current: 0, best: 0, loggedToday: loggedToday, graceReadyOn: nil, atRisk: false)
        }

        var streak = 0
        var best = 0
        var loggedSinceMiss = 0
        var lastMiss: String?

        var day = first
        while day <= today {
            defer { day = addDays(day, 1) }
            if days.contains(day) {
                streak += 1
                loggedSinceMiss += 1
                best = max(best, streak)
                continue
            }
            if day == today { continue }
            if let previous = lastMiss, dayDiff(previous, day) < graceSpacingDays {
                streak = loggedSinceMiss
            }
            loggedSinceMiss = 0
            lastMiss = day
        }

        var graceReadyOn: String?
        if let miss = lastMiss, dayDiff(miss, today) < graceSpacingDays {
            graceReadyOn = addDays(miss, graceSpacingDays)
        }

        return Streak(
            current: streak,
            best: best,
            loggedToday: loggedToday,
            graceReadyOn: graceReadyOn,
            atRisk: streak > 0 && !loggedToday && graceReadyOn != nil
        )
    }

    // MARK: - This week

    struct WeekCell: Equatable {
        let day: String
        let logged: Bool
        let isToday: Bool
        let isFuture: Bool
    }

    struct WeekMeter: Equatable {
        let startDay: String
        let cells: [WeekCell]
        let loggedCount: Int
        let goal: Int
        var reached: Bool { loggedCount >= goal }
    }

    /// This week, Monday to Sunday. Anyone in the household who logs fills a
    /// cell; there is no per-parent split because there is no leaderboard.
    static func weekMeter(days: Set<String>, today: String) -> WeekMeter {
        let start = mondayOf(today)
        let cells = (0..<7).map { offset -> WeekCell in
            let day = addDays(start, offset)
            return WeekCell(day: day, logged: days.contains(day), isToday: day == today, isFuture: day > today)
        }
        return WeekMeter(
            startDay: start,
            cells: cells,
            loggedCount: cells.filter(\.logged).count,
            goal: weeklyGoalDays
        )
    }

    // MARK: - Last week

    /// One logged attempt, reduced to what the rhythm reads.
    struct Attempt: Equatable {
        let kidId: String?
        let foodId: String?
        /// Local 'yyyy-MM-dd'.
        let day: String
        let outcome: String?
    }

    struct Recap: Equatable {
        let startDay: String
        let endDay: String
        let daysLogged: Int
        /// Every attempt in the range, refusals included.
        let offers: Int
        /// Kid+food pairs offered for the first time ever inside the range.
        let newFoodsOffered: Int
        /// Attempts that ended in success or partial.
        let accepted: Int
    }

    /// Last full Monday-to-Sunday week. `attempts` must reach back before the
    /// week for "new" to mean new.
    static func lastWeekRecap(attempts: [Attempt], today: String) -> Recap {
        let start = addDays(mondayOf(today), -7)
        let end = addDays(start, 6)

        var days: Set<String> = []
        var offers = 0
        var accepted = 0
        var firstOffer: [String: String] = [:]

        for attempt in attempts where attempt.day <= today {
            if let kid = attempt.kidId, let food = attempt.foodId {
                let key = "\(kid)|\(food)"
                if let seen = firstOffer[key] {
                    if attempt.day < seen { firstOffer[key] = attempt.day }
                } else {
                    firstOffer[key] = attempt.day
                }
            }
            guard attempt.day >= start && attempt.day <= end else { continue }
            days.insert(attempt.day)
            offers += 1
            if attempt.outcome == "success" || attempt.outcome == "partial" { accepted += 1 }
        }

        let newFoods = firstOffer.values.filter { $0 >= start && $0 <= end }.count
        return Recap(
            startDay: start,
            endDay: end,
            daysLogged: days.count,
            offers: offers,
            newFoodsOffered: newFoods,
            accepted: accepted
        )
    }
}

/// The four `food_attempts` columns the rhythm reads.
struct RhythmAttemptRow: Decodable, Equatable {
    let kidId: String?
    let foodId: String?
    let attemptedAt: String?
    let outcome: String?

    enum CodingKeys: String, CodingKey {
        case kidId = "kid_id"
        case foodId = "food_id"
        case attemptedAt = "attempted_at"
        case outcome
    }

    /// Nil for a row with no usable date: it cannot land on a day.
    func attempt(timeZone: TimeZone = .current) -> FamilyRhythm.Attempt? {
        guard let attemptedAt, let day = FamilyRhythm.localDay(attemptedAt, timeZone: timeZone) else { return nil }
        return FamilyRhythm.Attempt(kidId: kidId, foodId: foodId, day: day, outcome: outcome)
    }
}
