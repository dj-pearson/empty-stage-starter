#!/usr/bin/env node

/**
 * Builds public/Cover-og.webp, the site-wide social share image.
 *
 * Not part of `npm run build`. The output is committed, the way public/Cover.webp and
 * the other derivatives are, because the source art changes about once a year and a
 * sharp invocation on every build to produce a byte-identical file is waste. Run this
 * by hand when Cover.webp changes.
 *
 * Why a separate file rather than pointing og:image at Cover.webp: that one is 1536x1024,
 * which is 3:2. Open Graph wants ~1.91:1 and Twitter's summary_large_image wants 2:1, so
 * every scraper cropped it to its own taste and the previews disagreed with each other.
 * A centre crop is safe for this particular artwork -- the wordmark, spoon and tagline
 * sit in the middle with generous margin, and only the decorative corner blobs are
 * trimmed. Check the output by eye if the art is ever redrawn.
 *
 * Usage: node scripts/build/generate-og-image.mjs
 */

import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = path.join(root, 'public', 'Cover.webp');
const OUTPUT = path.join(root, 'public', 'Cover-og.webp');

/** The Open Graph card box. Twitter's 2:1 crops this by a hair rather than by a third. */
const WIDTH = 1200;
const HEIGHT = 630;

const { width, height } = await sharp(SOURCE).metadata();
const cropHeight = Math.round(width / (WIDTH / HEIGHT));

if (cropHeight > height) {
  throw new Error(
    `${SOURCE} is ${width}x${height}, too short to crop to ${WIDTH}x${HEIGHT} without padding`
  );
}

await sharp(SOURCE)
  .extract({ left: 0, top: Math.round((height - cropHeight) / 2), width, height: cropHeight })
  .resize(WIDTH, HEIGHT)
  .webp({ quality: 90 })
  .toFile(OUTPUT);

console.log(`[og-image] ${width}x${height} -> ${WIDTH}x${HEIGHT}  ${OUTPUT}`);
