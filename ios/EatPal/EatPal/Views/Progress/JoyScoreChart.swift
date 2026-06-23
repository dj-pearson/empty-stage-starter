import SwiftUI
import Charts

/// US-250: "Joy Score" — weekly average of `PlanEntryFeedback.rating` for
/// the active kid, surfaced as a LineMark across the last 8 weeks.
///
/// Why a feedback-based chart vs. a result-based one:
///   * `PlanEntry.result` only knows "ate / tasted / refused / nil" — it
///     tells us *whether* a kid ate but not *how much they enjoyed it*.
///     The Joy Score is the kid-level emotional signal the Weekly tab was
///     missing.
///   * The chart consumes `appState.planEntryFeedback` (loaded by
///     `AppState.loadPlanEntryFeedback`) so it shares the same data the
///     AI prompt enrichment uses.
///
/// Ratings of 0 are reserved per `PlanEntryFeedback` for "note-only" rows
/// and excluded from the average (per AC: "only counts ratings >= 1").
///
/// Empty-state behaviour mirrors the AC: when fewer than 2 weeks have any
/// rated feedback, we render a copy-only nudge instead of a near-flat
/// chart that doesn't actually tell the parent anything.

/// One bucket per ISO-week-start in the rolling 8-week window.
/// File-scope (not nested in the view) so the SwiftUI `.sheet(item:)`
/// payload can resolve the same type the chart computes.
struct JoyScoreWeekPoint: Identifiable, Equatable {
    var id: Date { weekStart }
    let weekStart: Date
    let averageRating: Double?  // nil when no rating that week
    let ratingCount: Int
}

/// Per-week tap drilldown payload surfaced to the detail sheet.
struct JoyScoreWeekDetail: Identifiable, Equatable {
    let id: Date
    let weekStart: Date
    let loved: [String]    // titles rated >= 4
    let refused: [String]  // titles rated <= 2
    let averageRating: Double
}

struct JoyScoreChart: View {
    @EnvironmentObject var appState: AppState

    @State private var selectedWeek: JoyScoreWeekDetail?

    private let weekCount = 8
    private var calendar: Calendar {
        var c = Calendar.current
        c.firstWeekday = 2  // Monday — matches ISO week + the rest of the app
        return c
    }

    /// Computed once per render. Cheap (8 buckets, linear over feedback).
    private var weekPoints: [JoyScoreWeekPoint] {
        guard let kidId = appState.activeKidId, !kidId.isEmpty else {
            return Self.emptyWindow(from: Date(), weekCount: weekCount, calendar: calendar)
        }

        // Map planEntry.id -> kid_id so we can filter feedback to the
        // active kid in a single linear pass.
        let entryKidIdById = Dictionary(uniqueKeysWithValues: appState.planEntries.map { ($0.id, $0.kidId) })

        // Pre-compute the 8 week-start anchors so empty weeks still
        // render on the x-axis.
        let anchors = Self.weekAnchors(from: Date(), weekCount: weekCount, calendar: calendar)
        let anchorSet = Set(anchors)

        var sums: [Date: (total: Int, count: Int)] = [:]
        for fb in appState.planEntryFeedback {
            guard fb.rating >= 1 else { continue }                      // AC: count rating >= 1 only
            guard entryKidIdById[fb.planEntryId] == kidId else { continue }
            guard let created = parseCreatedAt(fb.createdAt) else { continue }
            guard let weekStart = startOfWeek(created) else { continue }
            guard anchorSet.contains(weekStart) else { continue }       // outside the 8-week window
            var bucket = sums[weekStart] ?? (total: 0, count: 0)
            bucket.total += fb.rating
            bucket.count += 1
            sums[weekStart] = bucket
        }

        return anchors.map { anchor in
            if let bucket = sums[anchor], bucket.count > 0 {
                return JoyScoreWeekPoint(
                    weekStart: anchor,
                    averageRating: Double(bucket.total) / Double(bucket.count),
                    ratingCount: bucket.count
                )
            }
            return JoyScoreWeekPoint(weekStart: anchor, averageRating: nil, ratingCount: 0)
        }
    }

    /// Number of weeks in the window that have at least one rated row.
    /// Used to gate the empty state per AC.
    private var weeksWithData: Int {
        weekPoints.filter { ($0.averageRating ?? 0) > 0 }.count
    }

    // MARK: - View

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .foregroundStyle(.yellow)
                Text("Joy Score")
                    .font(.headline)
                Spacer()
                if weeksWithData >= 2 {
                    Text("Last 8 weeks")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if weeksWithData < 2 {
                emptyState
            } else {
                chart
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        .sheet(item: $selectedWeek) { detail in
            JoyScoreWeekDetailSheet(detail: detail)
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Rate a few meals to see your joy trend.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("After dinner, tap a meal and add a 1–5 reaction. We’ll plot the weekly trend here.")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }

    private var chart: some View {
        Chart(weekPoints) { point in
            if let avg = point.averageRating {
                LineMark(
                    x: .value("Week", point.weekStart),
                    y: .value("Joy", avg)
                )
                .foregroundStyle(.yellow.gradient)
                .interpolationMethod(.monotone)

                PointMark(
                    x: .value("Week", point.weekStart),
                    y: .value("Joy", avg)
                )
                .foregroundStyle(.yellow)
                .symbolSize(point.ratingCount > 0 ? 80 : 0)
                // US-372: VoiceOver reads each week's joy score + sample size.
                .accessibilityLabel("Week of \(point.weekStart.formatted(.dateTime.month().day()))")
                .accessibilityValue(String(format: "Joy score %.1f from %d ratings", avg, point.ratingCount))
                .annotation(position: .top, alignment: .center, spacing: 2) {
                    Text(String(format: "%.1f", avg))
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
        }
        .chartYScale(domain: 1...5)
        .chartYAxis {
            AxisMarks(values: [1, 2, 3, 4, 5]) { value in
                AxisGridLine()
                AxisTick()
                AxisValueLabel {
                    if let v = value.as(Int.self) {
                        Text("\(v)")
                            .font(.caption2)
                    }
                }
            }
        }
        .chartXAxis {
            AxisMarks(values: weekPoints.map(\.weekStart)) { value in
                AxisGridLine()
                AxisTick()
                AxisValueLabel {
                    if let d = value.as(Date.self) {
                        Text(d, format: .dateTime.month(.abbreviated).day())
                            .font(.caption2)
                    }
                }
            }
        }
        .chartOverlay { proxy in
            // Tap-on-point handling: convert the tap location to a date,
            // snap to the nearest week anchor, build the drilldown payload.
            GeometryReader { geo in
                Rectangle()
                    .fill(Color.clear)
                    .contentShape(Rectangle())
                    .onTapGesture { location in
                        guard let plotFrame = proxy.plotFrame else { return }
                        let origin = geo[plotFrame].origin
                        let xPosition = location.x - origin.x
                        guard let tappedDate: Date = proxy.value(atX: xPosition) else { return }
                        if let nearest = nearestWeekPoint(to: tappedDate),
                           let detail = buildDetail(for: nearest.weekStart) {
                            selectedWeek = detail
                        }
                    }
            }
        }
        .frame(height: 180)
        .accessibilityLabel("Joy Score chart")
        .accessibilityValue(accessibilitySummary)
    }

    private var accessibilitySummary: String {
        let rated = weekPoints.filter { ($0.averageRating ?? 0) > 0 }
        guard !rated.isEmpty else { return "No ratings logged yet." }
        if let last = rated.last, let avg = last.averageRating {
            return "Most recent week joy score \(String(format: "%.1f", avg)) from \(last.ratingCount) ratings."
        }
        return "Joy score across \(rated.count) weeks."
    }

    // MARK: - Tap-detail builder

    private func nearestWeekPoint(to date: Date) -> JoyScoreWeekPoint? {
        weekPoints.min { lhs, rhs in
            abs(lhs.weekStart.timeIntervalSince(date)) < abs(rhs.weekStart.timeIntervalSince(date))
        }
    }

    private func buildDetail(for weekStart: Date) -> JoyScoreWeekDetail? {
        guard let kidId = appState.activeKidId, !kidId.isEmpty else { return nil }
        guard let nextWeek = calendar.date(byAdding: .weekOfYear, value: 1, to: weekStart) else { return nil }

        // Look up the kid's plan entries in this week — feedback joins back
        // to a plan_entry, plan_entry has a foodId/recipeId we can resolve.
        let weekEntryIds = Set(
            appState.planEntries.filter { entry in
                guard entry.kidId == kidId else { return false }
                guard let entryDate = DateFormatter.isoDate.date(from: entry.date) else { return false }
                return entryDate >= weekStart && entryDate < nextWeek
            }.map(\.id)
        )

        let weekFeedback = appState.planEntryFeedback.filter {
            $0.rating >= 1 && weekEntryIds.contains($0.planEntryId)
        }

        guard !weekFeedback.isEmpty else { return nil }

        let recipeNameById = Dictionary(uniqueKeysWithValues: appState.recipes.map { ($0.id, $0.name) })
        let foodNameById = Dictionary(uniqueKeysWithValues: appState.foods.map { ($0.id, $0.name) })
        let entryById = Dictionary(uniqueKeysWithValues: appState.planEntries.map { ($0.id, $0) })

        var loved: [String] = []
        var refused: [String] = []

        for fb in weekFeedback {
            guard let entry = entryById[fb.planEntryId] else { continue }
            let title = entry.recipeId.flatMap { recipeNameById[$0] }
                ?? foodNameById[entry.foodId]
                ?? "Unnamed meal"
            if fb.rating >= 4 { loved.append(title) }
            if fb.rating <= 2 { refused.append(title) }
        }

        let total = weekFeedback.reduce(0) { $0 + $1.rating }
        let avg = Double(total) / Double(weekFeedback.count)

        return JoyScoreWeekDetail(
            id: weekStart,
            weekStart: weekStart,
            loved: Array(loved.prefix(10)),
            refused: Array(refused.prefix(10)),
            averageRating: avg
        )
    }

    // MARK: - Helpers

    private func parseCreatedAt(_ raw: String?) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }
        // Supabase round-trips ISO-8601 sometimes with fractional seconds
        // and sometimes without. `.permissive` requires fractional seconds,
        // so try it first then fall back to the strict default formatter.
        if let d = ISO8601DateFormatter.permissive.date(from: raw) { return d }
        let strict = ISO8601DateFormatter()
        strict.formatOptions = [.withInternetDateTime]
        return strict.date(from: raw)
    }

    private func startOfWeek(_ date: Date) -> Date? {
        calendar.dateInterval(of: .weekOfYear, for: date)?.start
    }

    private static func emptyWindow(from date: Date, weekCount: Int, calendar: Calendar) -> [JoyScoreWeekPoint] {
        weekAnchors(from: date, weekCount: weekCount, calendar: calendar).map {
            JoyScoreWeekPoint(weekStart: $0, averageRating: nil, ratingCount: 0)
        }
    }

    /// Return the 8 week-start anchors anchored on the current week,
    /// oldest first.
    private static func weekAnchors(from date: Date, weekCount: Int, calendar: Calendar) -> [Date] {
        guard let currentStart = calendar.dateInterval(of: .weekOfYear, for: date)?.start else {
            return []
        }
        return (0..<weekCount).reversed().compactMap {
            calendar.date(byAdding: .weekOfYear, value: -$0, to: currentStart)
        }
    }
}

// MARK: - Drilldown sheet

private struct JoyScoreWeekDetailSheet: View {
    let detail: JoyScoreWeekDetail
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        Text("Week average")
                        Spacer()
                        Text(String(format: "%.1f", detail.averageRating))
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(.yellow)
                    }
                }

                if !detail.loved.isEmpty {
                    Section("Loved (4-5)") {
                        ForEach(detail.loved, id: \.self) { title in
                            Label(title, systemImage: "hand.thumbsup.fill")
                                .foregroundStyle(.green)
                        }
                    }
                }

                if !detail.refused.isEmpty {
                    Section("Refused (1-2)") {
                        ForEach(detail.refused, id: \.self) { title in
                            Label(title, systemImage: "hand.thumbsdown.fill")
                                .foregroundStyle(.red)
                        }
                    }
                }

                if detail.loved.isEmpty && detail.refused.isEmpty {
                    Section {
                        Text("Mid-range ratings only — no strong loves or refusals this week.")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle(detail.weekStart.formatted(.dateTime.month().day()))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
