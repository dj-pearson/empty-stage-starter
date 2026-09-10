import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every privacy permission the iOS app declares should be one it actually
 * uses, and every permission it uses must be declared.
 *
 * The two directions fail differently. A permission used without its Info.plist
 * string is an immediate crash the moment the API is touched. A permission
 * declared without being used is quieter and still wrong: it inflates the app's
 * privacy nutrition label, it is a Guideline 5.1.1 flag at review, and in the
 * case this suite was written for it made a false statement to the user.
 * NSPhotoLibraryAddUsageDescription said "EatPal saves meal photos you take to
 * your photo library" while nothing in the app writes to the photo library at
 * all -- no UIImageWriteToSavedPhotosAlbum, no PHPhotoLibrary.performChanges.
 *
 * NSCameraUsageDescription had the other failure: it was accurate but partial,
 * naming only barcode scanning while the same permission also covers receipt
 * scanning, fridge recognition, product identification and the AR shelf finder,
 * three of which send the image off the device.
 */

const ROOT = path.resolve(__dirname, '../..');
const INFO_PLIST = readFileSync(
  path.join(ROOT, 'ios/EatPal/EatPal/Resources/Info.plist'),
  'utf8',
);

/** Every .swift file under the main app target. */
function swiftSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return swiftSources(full);
    return entry.name.endsWith('.swift') ? [readFileSync(full, 'utf8')] : [];
  });
}

const SWIFT = swiftSources(path.join(ROOT, 'ios/EatPal/EatPal')).join('\n');

/** Declared keys, read out of the plist rather than a hand-kept list. */
const declared = new Set(
  [...INFO_PLIST.matchAll(/<key>(NS\w*UsageDescription)<\/key>/g)].map((m) => m[1]),
);

/**
 * Which APIs oblige which key. `used` is the evidence in the Swift sources.
 * `optional` marks a key that is legitimate to declare without a trigger --
 * see the note on each.
 */
const PERMISSIONS = [
  {
    key: 'NSCameraUsageDescription',
    apis: ['AVCaptureDevice', 'DataScannerViewController', 'ARSession'],
  },
  {
    key: 'NSMicrophoneUsageDescription',
    apis: ['AVAudioEngine', 'AVAudioSession'],
  },
  {
    key: 'NSSpeechRecognitionUsageDescription',
    apis: ['SFSpeechRecognizer'],
  },
  {
    key: 'NSHealthShareUsageDescription',
    apis: ['HKHealthStore'],
  },
  {
    key: 'NSHealthUpdateUsageDescription',
    apis: ['HKHealthStore'],
  },
  {
    key: 'NSPhotoLibraryAddUsageDescription',
    apis: ['UIImageWriteToSavedPhotosAlbum', 'PHPhotoLibrary', 'creationRequestForAsset'],
  },
  {
    key: 'NSPhotoLibraryUsageDescription',
    apis: ['PHPhotoLibrary', 'UIImagePickerController'],
    // PhotosPicker / PHPickerViewController run out of process and need no
    // authorization, so nothing triggers this today. Kept as the guard for the
    // day something reaches for PHPhotoLibrary directly, where a missing string
    // is a crash rather than a denied prompt.
    optional: true,
  },
] as const;

const usesApi = (apis: readonly string[]) => apis.some((api) => SWIFT.includes(api));

describe('iOS privacy usage strings', () => {
  it('finds the sources and the plist', () => {
    // Floor: neither direction means anything against an empty scan.
    expect(SWIFT.length).toBeGreaterThan(100_000);
    expect(declared.size).toBeGreaterThanOrEqual(4);
  });

  it('declares every permission the code actually uses', () => {
    // This is the direction that crashes on a device.
    const missing = PERMISSIONS.filter((p) => usesApi(p.apis) && !declared.has(p.key)).map(
      (p) => p.key,
    );
    expect(missing).toEqual([]);
  });

  it('does not declare a permission nothing uses', () => {
    const unused = PERMISSIONS.filter(
      (p) => declared.has(p.key) && !usesApi(p.apis) && !('optional' in p && p.optional),
    ).map((p) => p.key);
    expect(unused).toEqual([]);
  });

  it('describes the camera by everything it is used for', () => {
    const camera = INFO_PLIST.slice(INFO_PLIST.indexOf('<key>NSCameraUsageDescription</key>'))
      .slice(0, 500)
      .toLowerCase();
    // Barcode scanning was the only stated purpose; these are the others.
    for (const purpose of ['receipt', 'fridge', 'recognize']) {
      expect(camera, `camera purpose string omits ${purpose}`).toContain(purpose);
    }
  });

  it('every declared key has a non-empty string', () => {
    for (const key of declared) {
      const after = INFO_PLIST.slice(INFO_PLIST.indexOf(`<key>${key}</key>`));
      const value = after.slice(after.indexOf('<string>') + 8, after.indexOf('</string>'));
      expect(value.trim().length, `${key} has an empty purpose string`).toBeGreaterThan(20);
    }
  });
});
