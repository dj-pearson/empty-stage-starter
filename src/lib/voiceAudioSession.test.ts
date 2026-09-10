import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Voice input has to hand the audio session back, on every path out.
 *
 * `start()` takes the session with `.record` and `.duckOthers`, which quiets
 * whatever the user is listening to. Only `setActive(false, ...)` gives it
 * back. That call lived in `stop()` alone, while `finish(withError:)` -- the
 * path taken whenever recognition fails, which includes the ordinary "didn't
 * catch any speech" case -- stopped the engine and left the session held.
 *
 * And it stayed held: `stop()` returns early unless the state is `.listening`
 * or `.preparing`, and a failure leaves it `.error`, so a later stop could not
 * release it either. Somebody who asked for a grocery item while listening to
 * a podcast, and whose recognition failed, had their audio ducked until the
 * next successful voice input.
 *
 * Both paths now share one teardown. Source-contract assertions: AVAudioEngine
 * and SFSpeechRecognizer cannot be driven off-device.
 */

const SOURCE = readFileSync(
  path.resolve(__dirname, '../../ios/EatPal/EatPal/Services/VoiceInputService.swift'),
  'utf8',
);

/** The body of a function, up to the next declaration at the same indent. */
function body(signature: string): string {
  const start = SOURCE.indexOf(signature);
  expect(start, `${signature} not found`).toBeGreaterThan(-1);
  const rest = SOURCE.slice(start);
  const end = rest.slice(1).search(/\n {4}(?:private )?(?:func|nonisolated|\/\/ MARK)/);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

describe('voice input audio session', () => {
  it('is worth checking: the session is taken with duckOthers', () => {
    // Floor. If the category stops ducking, releasing it promptly matters
    // less and this contract is about something else.
    expect(SOURCE).toContain('options: .duckOthers');
    expect(SOURCE).toContain('setActive(true, options: .notifyOthersOnDeactivation)');
  });

  it('releases the session in exactly one place', () => {
    // Two copies is how the error path came to be missing one.
    // Counts calls, not the doc comment that explains them.
    const releases = SOURCE.match(/AVAudioSession\.sharedInstance\(\)\.setActive\(false/g) ?? [];
    expect(releases.length).toBe(1);
    expect(body('private func teardownAudio()')).toContain('setActive(false');
  });

  it('releases it when recognition fails', () => {
    expect(body('private func finish(withError error: Error?)')).toContain('teardownAudio()');
  });

  it('releases it on a normal stop', () => {
    expect(body('func stop()')).toContain('teardownAudio()');
  });

  it('releases it when cancelling out of a failed attempt', () => {
    // stop() returns early unless we were listening, and a failure leaves the
    // state .error -- so cancel has to tear down unconditionally.
    const cancel = body('func cancel()');
    expect(cancel).toContain('teardownAudio()');
    expect(cancel.indexOf('stop()')).toBeLessThan(cancel.indexOf('teardownAudio()'));
  });

  it('resets the meter with the tap that drives it', () => {
    // The level comes from the audio tap; removing the tap without zeroing it
    // leaves the UI frozen mid-animation.
    const teardown = body('private func teardownAudio()');
    expect(teardown).toContain('removeTap(onBus: 0)');
    expect(teardown).toContain('inputLevel = 0');
  });
});
