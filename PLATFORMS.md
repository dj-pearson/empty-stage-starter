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

### Badges: kid_badges is the shared source; web reads it; iOS evaluates and writes.

- **iOS** evaluates `Badge.criteria` in `BadgeService.swift` and writes each earn
  to `kid_badges(kid_id, badge_id, earned_at)` through the offline queue
  (US-871). It seeds its `UserDefaults` cache from the table on launch, so a
  new phone or a second parent sees the same badges with their original dates.
- **Web** reads `kid_badges` (`src/hooks/useKidBadges.ts`) and draws the same
  twelve badges from `src/lib/badgeCatalog.ts`, whose ids and tiers are pinned
  to the Swift enum by `badgeCatalog.parity.test.ts`. It does not decide that a
  badge is earned and never dates one "today".

**Decision (2026-09-24): one catalog, evaluated on the phone.** This replaced
the web's own nine-badge set, which was computed from the plan cache and
stamped every unlock with the day the page was opened. A web tile can no
longer disagree with the phone about whether a badge was earned, or when.

What the web still computes is a progress hint on a locked tile, and only where
it can count what the phone counts from the data it holds: the streak badges
through `src/lib/streakRules.ts`, and Perfect Week from this Monday-first
week's results (`src/lib/badgeHints.ts`). All-time counts get no bar, because
the web's -30d..+90d plan window would read low. A hint that is already full
while the badge is absent from `kid_badges` says it is waiting for the phone to
sync rather than printing "27 / 25".

**What stays open:** a family with no iPhone never earns a badge, because
nothing on the web writes one. Moving evaluation server-side would fix that and
is not this change.

---

## Family rhythm and care report links - web only, by accident until decided

**Family rhythm** (`src/lib/familyRhythm.ts`) is the parent's side: a logging
streak with one grace day per seven, a Monday-to-Sunday household meter toward
five logged days, last week's recap, and ten family milestones. It counts any
logged attempt, refusals included, and never what the child ate; the child's
try-bite streak in `streakRules.ts` is a separate rule and is unchanged. It is
derived from `food_attempts` on every read, so there is no table for iOS to
write and nothing to drift: an iOS surface would port the pure module (the
tests include a brute-force check of the streak walk to port against).

**Care report links** (`care_report_shares`, `/care/:token`) are made on the
web only. iOS has no screen that creates or lists them. A link made on the web
works for anyone, and the web list shows links made by either parent.

The exposure counter on ladder rows ("6 of about 10 offers") is web only too.
