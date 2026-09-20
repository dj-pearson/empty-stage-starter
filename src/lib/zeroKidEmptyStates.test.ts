import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every zero-kid surface can add a child (US-705).
 *
 * Four screens asked for a child and none could create one. The dashboard hid
 * its kid selector and rendered a grid of zeroes beside three quick actions,
 * none of which was "add a child". The meal planner, the AI planner and the
 * progress dashboard each showed a `ContentUnavailableView` with no action at
 * all. AI Meal Plan said "Add a child profile from the Dashboard", which was
 * false -- the Dashboard had no such control either.
 *
 * An empty state that cannot perform the action it is asking for is the bug,
 * and it is the kind that comes back one screen at a time. These are view
 * files, so there is nothing to unit test in Swift without a host app; this
 * reads the sources instead, the same way `offlineReplayCoverage.test.ts`
 * reads `OfflineStore.swift`.
 */

const ROOT = path.resolve(__dirname, '..', '..');
const IOS = path.join(ROOT, 'ios', 'EatPal', 'EatPal', 'Views');

const read = (rel: string) => readFileSync(path.join(IOS, rel), 'utf8');

/**
 * The same source with `//` comments removed.
 *
 * The copy checks below have to read what a parent sees, not what the file says
 * about itself: the comment explaining that "from the Dashboard" was wrong
 * contains the phrase it is explaining, and matched on the first run.
 */
const readCopy = (rel: string) =>
  read(rel)
    .split('\n')
    .map((line) => line.replace(/\s*\/\/.*$/, ''))
    .join('\n');

/** The four surfaces the story names, and where each one's check lives. */
const SURFACES = [
  'Dashboard/DashboardHomeView.swift',
  'MealPlan/MealPlanView.swift',
  'MealPlan/AIMealPlanView.swift',
  'Progress/ProgressDashboardView.swift',
] as const;

describe('zero-kid empty states can add a child (US-705)', () => {
  it('every surface offers the shared control', () => {
    const missing = SURFACES.filter((rel) => !read(rel).includes('AddFirstChildCard'));
    expect(
      missing,
      'these ask for a child without offering a way to add one',
    ).toEqual([]);
  });

  it('the control is one view, not four buttons', () => {
    // AC1. Four hand-rolled buttons is how the copy drifts apart and how the
    // next surface gets forgotten.
    const card = read('Components/AddFirstChildCard.swift');
    expect(card).toContain('struct AddFirstChildCard');
    // It presents the same sheet the Kids tab uses, so a child added here goes
    // through appState.addKid and behaves identically offline (AC1).
    expect(card).toContain('AddKidView()');
  });

  it('no surface tells the user to go somewhere else', () => {
    // AC4. The old AI Meal Plan copy pointed at a Dashboard control that did
    // not exist. A fixed empty state names no screen to go and find.
    for (const rel of SURFACES) {
      expect(readCopy(rel), `${rel} still sends the user hunting`).not.toMatch(
        /from the Dashboard|from the Kids tab|go to the/i,
      );
    }
  });

  it('the dashboard hides its zero-value stats instead of rendering them', () => {
    // AC5: with no children the grid counts nothing and the quick actions have
    // nothing to attach to, so both sit inside the else branch.
    const dashboard = read('Dashboard/DashboardHomeView.swift');
    const emptyBranch = dashboard.slice(dashboard.indexOf('if appState.kids.isEmpty {'));

    expect(emptyBranch).toContain('AddFirstChildCard');
    const elseIndex = emptyBranch.indexOf('} else {');
    expect(elseIndex, 'the empty branch has no else').toBeGreaterThan(-1);

    const beforeElse = emptyBranch.slice(0, elseIndex);
    expect(beforeElse).not.toContain('QuickStatsGrid()');
    expect(beforeElse).not.toContain('QuickActionsSection(');
  });

  it('carries no dismissal flag', () => {
    // AC6: the state is derived from appState.kids, so it goes when a child
    // exists and returns if the last one is deleted. A remembered dismissal
    // would leave a parent with no route back to it.
    const card = read('Components/AddFirstChildCard.swift');
    expect(card).not.toMatch(/AppStorage|UserDefaults|dismissed/i);
  });

  it('explains a control disabled for want of an active child', () => {
    // AC7. StarterTemplatesSheet's Apply is disabled when activeKidId is nil,
    // and a disabled button explains nothing -- the parent taps a grey word
    // and learns why nothing happened. It now says which reason it is.
    const sheet = read('MealPlan/StarterTemplatesSheet.swift');
    expect(sheet).toContain('.disabled(appState.activeKidId == nil');
    expect(
      sheet,
      'the disabled Apply button still says nothing about why',
    ).toMatch(/Pick a child first/);
  });
});
