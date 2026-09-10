import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A grocery check sent from the watch must survive being delivered late.
 *
 * The watch only ever lists unchecked rows (buildSnapshot filters on
 * `!$0.checked`), so a tap always means "check this off". It used to send
 * `grocery_toggle`, and the phone applied it with `toggleGroceryItem`, which
 * flips whatever the current state happens to be.
 *
 * That is wrong over a store-and-forward channel. When the phone is out of
 * range the watch falls back from `sendMessage` to `transferUserInfo`, which
 * is queued and guaranteed. So: check milk off on the watch in the shop with
 * the phone in a bag, check milk off on the phone a minute later, and when the
 * watch reconnects the queued flip arrives and unchecks it. A bought item
 * reappears on the list.
 *
 * The message now carries the desired state, which is safe to apply twice or
 * out of order. `grocery_toggle` is still sent and still handled so an older
 * build on either side keeps working while the pair catches up.
 */

const ROOT = path.resolve(__dirname, '../..');
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');

const WATCH = read('ios/EatPal/EatPalWatch Watch App/WatchSessionStore.swift');
const SERVICE = read('ios/EatPal/EatPal/Services/WatchConnectivityService.swift');
const APP_STATE = read('ios/EatPal/EatPal/App/AppState.swift');

describe('watch grocery check', () => {
  it('is worth checking: the watch only shows unchecked rows', () => {
    // If the watch ever lists checked rows too, a tap stops meaning "true"
    // and this whole contract needs rethinking rather than defending.
    expect(SERVICE).toContain('.filter { !$0.checked }');
  });

  it('sends a desired state, not a flip', () => {
    expect(WATCH).toContain('"grocery_checked": true');
    // Both channels carry the same payload -- the queued one is the one that
    // can arrive late, so it is the one that most needs the explicit state.
    const send = WATCH.slice(WATCH.indexOf('func toggleGrocery('));
    expect(send).toContain('sendMessage(\n                payload,');
    expect(send).toContain('transferUserInfo(payload)');
  });

  it('keeps the legacy key so an older phone build still works', () => {
    expect(WATCH).toContain('"grocery_toggle": row.id');
    const handler = SERVICE.slice(SERVICE.indexOf('func handleGroceryToggleFromWatch('));
    expect(handler.slice(0, 500)).toContain('toggleGroceryItem(itemId)');
  });

  it('applies the desired state when the watch sends one', () => {
    const handler = SERVICE.slice(SERVICE.indexOf('func handleGroceryToggleFromWatch('));
    expect(handler.slice(0, 500)).toContain('setGroceryItemChecked(itemId, checked: checked)');
    // Both receive paths have to read it, not just the live one.
    const readsChecked = SERVICE.match(/\["grocery_checked"\] as\? Bool/g) ?? [];
    expect(readsChecked.length).toBe(2);
  });

  it('setGroceryItemChecked is idempotent and restores on failure', () => {
    const fn = APP_STATE.slice(APP_STATE.indexOf('func setGroceryItemChecked('));
    const body = fn.slice(0, fn.indexOf('\n    // MARK: - Live Activity helpers'));
    // Applying the same state twice does nothing.
    expect(body).toContain('guard previous != checked else { return }');
    // The rollback restores the captured value rather than flipping again,
    // which would be wrong if anything else changed it in between.
    expect(body).toContain('groceryItems[index].checked = previous');
    expect(body).not.toContain('groceryItems[index].checked.toggle()');
  });
});
