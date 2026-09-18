# Platform differences

Where the web app and the iOS app deliberately diverge, and where they diverge
by accident. A difference belongs here once somebody has decided it is a
difference; an accident belongs here until somebody decides.

Referenced by `docs/web-platform-roadmap-2026-09.md`.

---

## Badges and streaks (US-781) - decided

The story assumed badges and streaks live in iOS `UserDefaults` and that the web
shows a surface reading nothing. Both halves were wrong, and the real state was
worse in a more interesting way.

### Streaks: there were four rules, four answers

Nothing stores a streak. All four implementations derived one from plan
entries, and they derived different numbers from identical data.

| Where | A day counted when | Ended on |
| --- | --- | --- |
| `src/pages/Home.tsx` | any entry that day had a `result` | the first gap, today forgiven |
| `src/components/ProgressDashboard.tsx` | any entry existed that day, `result` never read | a gap of more than one day |
| `src/components/AchievementsView.tsx` | any entry that day had a `result`, what it was never read | a gap of more than one day |
| `ios/.../Services/BadgeService.swift` | a try-bite day that was not refused | a `refused` result, or two empty days in a row |

The fourth was missed when this was first written up as three. It is the one
that drives the badges a parent sees on the web, so a week of refusals unlocked
a streak badge there while the phone showed nothing.

The consequential difference was the middle column. A child who refused
everything yesterday had a live streak on the web and a broken one on the phone.
The two web rules disagreed with each other as well: one forgave a single empty
day and the other did not.

**Decision: the phone's rule wins, and the web has one implementation of it.**

`src/lib/streakRules.ts` is that implementation, and both web call sites read
it. A day counts when something was tried (`ate` or `tasted`), a day of nothing
but refusals ends the streak, one empty day is forgiven and a productive day
refunds that budget.

Two reasons for picking the phone's reading over the web's. iOS is what ships in
the App Store, so matching it changes a number on the web rather than changing
one a parent has been watching on their phone. And a streak that survives a day
of pure refusals is not counting try-bites; it is counting that the app was
opened.

**The kinder reading is one constant away.** `REFUSAL_BREAKS_STREAK` in that
file. If the product decides that what a discouraged parent sees matters more
than what the number measures, flipping it is the whole change, and
`src/lib/streakRules.test.ts` has the case for both.

`BadgeService.swift` keeps its own copy because Swift cannot import TypeScript.
The two are described here together on purpose: a change to one is a change to
this file, and the test asserts that this file names both.

**Fixed on the way, because it was wrong under every candidate rule:**
`Home.tsx` counted over the unfiltered `planEntries` while `kidPlanEntries` sat
one line above, so in a two-child household either child eating kept the other
child's streak alive. The shared rule takes `kidId` as a required argument, so
it cannot be called without naming a child.

### Badges: iOS-only, deliberately, and the storage is still wrong

- **iOS** stores earned badge keys in `UserDefaults` under `badges.<kidId>`
  (`BadgeService.swift`). Device-local: they do not survive a reinstall, do not
  move to a new phone, and are invisible to a second parent on their own device.
- **Web** derives achievements on the fly in `src/components/AchievementsView.tsx`
  from plan entries, foods and kids, and renders them through `Progress.tsx`.
  Nothing is stored, so nothing is lost -- and nothing is shared either.

**Decision: iOS-only. The two clients keep separate notions of what a child has
earned.**

This is the status quo, stated out loud. Note what it does *not* mean: there is
no web surface to remove. The web achievements are real and computed, and a
parent on the web sees achievements that are correct for the data the web has.
What they will not see is a badge the phone awarded, and the reverse.

The alternative was a shared `kid_badges(kid_id, badge_key, earned_at)` table
with RLS, written by both clients. It is the better end state and it is not this
story: it needs the iOS `BadgeService` to write through the offline queue and to
seed from the server, which is iOS work that cannot be built or verified from
the web side.

**What stays wrong either way**, and is filed as its own story: the
`UserDefaults` storage. A child loses every badge they have earned when the
family gets a new phone. That is a bad outcome under both options, so it does
not wait on this decision.
