import Foundation

/// US-871: what to do when the cache and the server disagree about which
/// badges a child has earned.
///
/// Pure, because this is the decision that can delete a year of a child's
/// progress and it should not need a Supabase client to exercise.
///
/// The rule is a UNION in both directions, which is the one place badges
/// deviate from the load-precedence contract in CLAUDE.md. Everywhere else a
/// successful server read replaces the local slice wholesale, and that is
/// right: a deletion made on another device must not be resurrected by a stale
/// cache. Badges have no deletion. They are append-only by design -- the table
/// has no UPDATE policy and nothing in the app removes one -- so the only way
/// the server can be missing a badge the cache holds is that it was earned
/// before `kid_badges` existed. Every account that used the app between US-241
/// and now is in exactly that state. Letting the server win there would clear
/// the grid on first launch of the build that added durability, which is the
/// opposite of the point.
enum BadgeSync {
    /// The two lists of work, each sorted so a plan is deterministic.
    struct Plan: Equatable {
        /// On the server and not in the cache: earned on another device, or on
        /// the other parent's phone. Written into the cache.
        var download: [String]
        /// In the cache and not on the server: earned before the table
        /// existed, or while offline. Pushed up, with the date the cache
        /// holds rather than today's.
        var upload: [String]

        var isEmpty: Bool { download.isEmpty && upload.isEmpty }
    }

    static func plan(local: Set<String>, server: Set<String>) -> Plan {
        Plan(
            download: server.subtracting(local).sorted(),
            upload: local.subtracting(server).sorted()
        )
    }
}
