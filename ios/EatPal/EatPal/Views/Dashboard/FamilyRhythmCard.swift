import SwiftUI

/// The parent's logging streak, this week's household meter and last week's
/// recap, on the Home tab. The phone's copy of the web's "Logging rhythm"
/// card (src/components/family/FamilyRhythmCard.tsx), over the same rule
/// (FamilyRhythm).
///
/// Days come from every `food_attempts` row for the household's children,
/// which is where every logged meal and every ladder try lands. Plan entries
/// already in memory with a result are folded in as well, so a meal logged a
/// moment ago, or logged offline, fills today's cell before the read returns.
struct FamilyRhythmCard: View {
    @EnvironmentObject var appState: AppState
    var date: Date = Date()

    @State private var attempts: [FamilyRhythm.Attempt] = []

    private var todayKey: String { DateFormatter.isoDate.string(from: date) }

    /// Refetch when the children change or another result is logged.
    private var reloadKey: String {
        let kids = appState.kids.map(\.id).sorted().joined(separator: ",")
        let logged = appState.planEntries.filter { $0.result != nil }.count
        return "\(kids)#\(logged)"
    }

    private func loggedDays(today: String) -> Set<String> {
        var days = Set(attempts.map(\.day))
        for entry in appState.planEntries where entry.result != nil {
            days.insert(entry.date)
        }
        return days.filter { $0 <= today }
    }

    var body: some View {
        let today = todayKey
        let days = loggedDays(today: today)
        let streak = FamilyRhythm.parentStreak(days: days, today: today)
        let meter = FamilyRhythm.weekMeter(days: days, today: today)
        let recap = FamilyRhythm.lastWeekRecap(attempts: attempts, today: today)

        VStack(alignment: .leading, spacing: 8) {
            Text("Logging rhythm")
                .font(.subheadline.weight(.semibold))

            Text(streak.current > 0 ? "\(streak.current)-day logging streak" : "Log a meal to start a streak")
                .font(.title2.weight(.semibold))
                .monospacedDigit()

            if let line = graceLine(streak) {
                Text(line)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if streak.best > streak.current {
                Text("Best so far: \(Self.days(streak.best))")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 6) {
                ForEach(meter.cells, id: \.day) { cell in
                    VStack(spacing: 4) {
                        RoundedRectangle(cornerRadius: 6)
                            .fill(cell.logged ? Color.accentColor : Color.clear)
                            .overlay(
                                RoundedRectangle(cornerRadius: 6)
                                    .strokeBorder(
                                        cell.logged || cell.isToday ? Color.accentColor : Color.secondary.opacity(0.4),
                                        style: StrokeStyle(
                                            lineWidth: cell.isToday && !cell.logged ? 2 : 1,
                                            dash: cell.isFuture ? [3] : []
                                        )
                                    )
                            )
                            .frame(height: 28)
                        Text(Self.weekday(cell.day, format: "EEEEE"))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(Self.weekday(cell.day, format: "EEEE")): \(cellState(cell))")
                }
            }
            .padding(.top, 4)

            Text(
                meter.reached
                    ? "Week goal reached: \(Self.days(meter.loggedCount)) logged together."
                    : "\(meter.loggedCount) of \(meter.goal) days logged this week. Anyone in the household counts."
            )
            .font(.footnote)

            if recap.offers > 0 {
                Text(recapLine(recap))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        .task(id: reloadKey) { await load() }
    }

    // MARK: - Copy

    private func graceLine(_ streak: FamilyRhythm.Streak) -> String? {
        if streak.atRisk {
            return "Yesterday used your grace day. Log anything today to keep the streak."
        }
        if streak.current > 0, let ready = streak.graceReadyOn {
            return "Grace day used. The next one is ready \(Self.weekday(ready, format: "EEEE"))."
        }
        if streak.current > 0 {
            return "One missed day a week won't break it."
        }
        return nil
    }

    private func cellState(_ cell: FamilyRhythm.WeekCell) -> String {
        if cell.logged { return "logged" }
        return cell.isFuture ? "still ahead" : "nothing logged"
    }

    private func recapLine(_ recap: FamilyRhythm.Recap) -> String {
        var parts = [
            Self.days(recap.daysLogged) + " logged",
            recap.offers == 1 ? "1 offer" : "\(recap.offers) offers",
        ]
        if recap.newFoodsOffered > 0 {
            parts.append(recap.newFoodsOffered == 1 ? "1 new food offered" : "\(recap.newFoodsOffered) new foods offered")
        }
        return "Last week: " + parts.joined(separator: " · ")
    }

    private static func days(_ count: Int) -> String {
        count == 1 ? "1 day" : "\(count) days"
    }

    /// A 'yyyy-MM-dd' key as a weekday name, read in UTC so it never shifts.
    private static func weekday(_ iso: String, format: String) -> String {
        guard let date = FamilyRhythm.utcDay.date(from: iso) else { return iso }
        let formatter = DateFormatter()
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.setLocalizedDateFormatFromTemplate(format)
        return formatter.string(from: date)
    }

    // MARK: - Data

    private func load() async {
        let kidIds = appState.kids.map(\.id)
        guard !kidIds.isEmpty else {
            attempts = []
            return
        }
        do {
            let rows = try await DataService.shared.fetchRhythmAttempts(kidIds: kidIds)
            attempts = rows.compactMap { $0.attempt() }
        } catch is CancellationError {
            // A newer load replaced this one (another result was logged).
        } catch {
            // Offline or refused: the plan entries in memory still draw the
            // card, so it degrades to less history rather than disappearing.
            SentryService.capture(error, extras: ["context": "family_rhythm_attempts"])
        }
    }
}
