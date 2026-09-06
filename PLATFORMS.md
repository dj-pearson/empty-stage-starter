# Platform differences

Where the web app and the iOS app deliberately diverge, and where they diverge
by accident. A difference belongs here once somebody has decided it is a
difference; an accident belongs here until somebody decides.

Referenced by `docs/web-platform-roadmap-2026-09.md`.

---

## Badges and streaks (US-781) — open, and not the question the story asked

The story assumed badges and streaks live in iOS `UserDefaults` and that the web
shows a surface reading nothing. Both halves are wrong, and the real state is
worse in a more interesting way.

### Streaks: three rules, three answers

Nothing stores a streak. All three implementations derive one from plan entries,
and they derive different numbers from identical data.

| Where | Scope | A day counts when | Ends on |
| --- | --- | --- | --- |
| `src/pages/Home.tsx` (`const streak = useMemo`) | active kid | any entry that day has a `result` | the first gap, today forgiven |
| `src/components/ProgressDashboard.tsx` (`// Streak calculation`) | one kid | any entry exists that day, `result` never read | a gap of more than one day |
| `ios/.../Services/BadgeService.swift` (`currentStreak`) | one kid | a try-bite day that was not refused | a `refused` result, or two empty days in a row |

The consequential difference is the middle column. A child who refused
everything yesterday has a live streak on the web and a broken one on the phone.
The two web rules also disagree with each other: one forgives a single empty day
and the other does not.

**Fixed already, because it is wrong under every candidate rule:** `Home.tsx`
counted over the unfiltered `planEntries` while `kidPlanEntries` sat one line
above, so in a two-child household either child eating kept the other child's
streak alive. Pinned by `src/lib/streakRules.test.ts`.

**The decision, which is a product decision and not a refactor:** does a refusal
break a streak? iOS says yes, and that is the reading that matches what a
try-bite streak is for. The web says no, which is the kinder reading and the one
a discouraged parent sees. Whichever wins, it wants one implementation that both
clients read — and since all three already derive from plan entries, that is a
shared rule rather than a new table.

### Badges: genuinely iOS-only today, and fragile

- **iOS** stores earned badge keys in `UserDefaults` under `badges.<kidId>`
  (`BadgeService.swift`). Device-local: they do not survive a reinstall, do not
  move to a new phone, and are invisible to a second parent on their own device.
- **Web** derives achievements on the fly in `src/components/AchievementsView.tsx`
  from plan entries, foods and kids, and renders them through `Progress.tsx`.
  Nothing is stored, so nothing is lost — but nothing is shared either.

**The decision:** a shared `kid_badges(kid_id, badge_key, earned_at)` table with
RLS, written by both clients, or an explicit "iOS-only" declaration. Note that
"iOS-only" does not remove any web surface here — the web achievements are real
and computed. It would only mean the two clients keep separate notions of what a
child has earned, which is the status quo and worth stating out loud if it is
what we want.

Either way the `UserDefaults` storage should go: losing a child's badges on a
phone upgrade is a bad outcome under both options.

**Status: no decision recorded.** This section is the evidence for one.
