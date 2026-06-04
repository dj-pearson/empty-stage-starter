import Foundation

/// US-255: tracks recent local mutations per (table, rowId) so the
/// realtime layer can spot the "Sarah also edited the same row while I
/// was editing it" case and surface the AC's conflict toast.
///
/// Concurrency model:
///   * Actor so concurrent recordLocal / wasRecentLocalEdit calls from
///     AppState (MainActor) and RealtimeService (also MainActor in this
///     repo, but the actor isolation makes future moves safe) don't race.
///   * Per-row entry is a single timestamp; we only need the *most recent*
///     local-write time, not the full history.
///   * Toast-debounce is a per-row set: any one row toasts at most once
///     per the dedup window (default = the same 5s conflict window).
///
/// Why we don't try to attribute the editor by name:
///   * Neither grocery_items nor plan_entries carries a
///     `last_modified_by_user_id` column today. `added_by_user_id` /
///     `user_id` reflect the original poster, not the last editor.
///   * Adding that column needs an additive migration + a trigger to set
///     `last_modified_by_user_id = auth.uid()` on UPDATE. Tracked as a
///     follow-up; until then the toast says "Your household also edited
///     this" which still gives the parent the actionable signal without
///     naming the wrong person.
actor ConflictDetector {
    static let shared = ConflictDetector()

    enum Table: String, Sendable {
        case groceryItems = "grocery_items"
        case planEntries = "plan_entries"
    }

    private struct Key: Hashable, Sendable {
        let table: Table
        let rowId: String
    }

    private var lastLocalEdit: [Key: Date] = [:]
    private var recentlyToasted: [Key: Date] = [:]
    /// Per-row queue of expected echoes. Each local mutation we issue
    /// produces exactly one realtime UPDATE echo from Supabase ~100-400ms
    /// later; that echo must NOT fire the conflict toast. Counted so
    /// rapid-fire edits queue their echoes correctly.
    private var pendingEchoes: [Key: Int] = [:]

    /// Default window the AC names. Exposed so tests can shrink it.
    static let conflictWindowSeconds: TimeInterval = 5
    /// Window inside which an arriving UPDATE is interpreted as an echo
    /// of our own local mutation (not a conflict). Tighter than the
    /// conflict window so a real household-mate write ~1s after our
    /// own write still trips the toast.
    static let echoWindowSeconds: TimeInterval = 2

    private init() {}

    /// Stamp "this user just edited (or is about to edit) row X." Call as
    /// close to the network mutation as possible — the realtime UPDATE
    /// echo for the same write usually lands 100-400ms later. Increments
    /// the per-row pending-echo counter so the realtime layer can later
    /// `consumeEcho` to silence its own write's round-trip.
    func recordLocal(_ table: Table, rowId: String, at: Date = Date()) {
        let key = Key(table: table, rowId: rowId)
        lastLocalEdit[key] = at
        pendingEchoes[key, default: 0] += 1
    }

    /// Called from the realtime UPDATE handler. Returns true if the
    /// incoming UPDATE is our own echo (decrements the pending count and
    /// the caller should skip the conflict check). Returns false when
    /// either no echo is pending or the stamp has expired beyond the
    /// echo window — in which case the caller continues to the conflict
    /// check.
    func consumeEcho(_ table: Table, rowId: String, asOf: Date = Date()) -> Bool {
        let key = Key(table: table, rowId: rowId)
        guard let count = pendingEchoes[key], count > 0 else { return false }
        guard let stamp = lastLocalEdit[key],
              asOf.timeIntervalSince(stamp) <= Self.echoWindowSeconds else {
            // Stamp aged out — clear stale pending echoes; treat as not-echo.
            pendingEchoes[key] = nil
            return false
        }
        if count == 1 {
            pendingEchoes[key] = nil
        } else {
            pendingEchoes[key] = count - 1
        }
        return true
    }

    /// Was there a local edit on this row in the last `within` seconds?
    /// Used by RealtimeService to decide whether to fire the toast on an
    /// incoming UPDATE.
    func wasRecentLocalEdit(
        _ table: Table,
        rowId: String,
        within: TimeInterval = conflictWindowSeconds,
        asOf: Date = Date()
    ) -> (recent: Bool, ageMs: Int?) {
        guard let stamp = lastLocalEdit[Key(table: table, rowId: rowId)] else {
            return (false, nil)
        }
        let age = asOf.timeIntervalSince(stamp)
        guard age <= within else { return (false, nil) }
        return (true, Int(age * 1000))
    }

    /// Per-row, per-window debounce: at most one conflict toast every
    /// `within` seconds for the same row. Returns true if the caller may
    /// fire the toast now (and stamps the dedup window).
    func shouldFireToast(
        _ table: Table,
        rowId: String,
        within: TimeInterval = conflictWindowSeconds,
        asOf: Date = Date()
    ) -> Bool {
        let key = Key(table: table, rowId: rowId)
        if let last = recentlyToasted[key], asOf.timeIntervalSince(last) < within {
            return false
        }
        recentlyToasted[key] = asOf
        return true
    }

    /// Test helper: wipe all state.
    func reset() {
        lastLocalEdit.removeAll()
        recentlyToasted.removeAll()
        pendingEchoes.removeAll()
    }
}
