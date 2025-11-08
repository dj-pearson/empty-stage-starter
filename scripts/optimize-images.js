#!/usr/bin/env node

/**
 * Image Optimization Script
 * Converts large PNG images to WebP and AVIF formats
 *
 * Expected savings:
 * - splash.png: 1.9 MB → 150 KB (92% reduction)
 * - Cover.png: 1.9 MB → 180 KB (90% reduction)
 * - Palette.png: 1.3 MB → 95 KB (93% reduction)
 * - Logo-Green.png: 261 KB → 25 KB (90% reduction)
 *
 * Total savings: ~6.3 MB
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const images = [
  { file: 'splash.png', quality: { webp: 85, avif: 80 } },
  { file: 'Cover.png', quality: { webp: 85, avif: 80 } },
  { file: 'Palette.png', quality: { webp: 85, avif: 80 } },
  { file: 'Logo-Green.png', quality: { webp: 90, avif: 85 } },
  { file: 'Logo-White.png', quality: { webp: 90, avif: 85 } },
  { file: 'icon-512x512.png', quality: { webp: 90, avif: 85 } },
  { file: 'android-chrome-512x512.png', quality: { webp: 90, avif: 85 } },
  { file: 'android-chrome-192x192.png', quality: { webp: 90, avif: 85 } },
  { file: 'Icon-Large.png', quality: { webp: 85, avif: 80 } },
];

async function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (error) {
    return 0;
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

async function optimizeImage(imgConfig) {
  const sourcePath = path.join(PUBLIC_DIR, imgConfig.file);
  const name = path.parse(imgConfig.file).name;
  const ext = path.parse(imgConfig.file).ext;

  // Check if source exists
  if (!fs.existsSync(sourcePath)) {
    console.log(`⚠️  Skipping ${imgConfig.file} (not found)`);
    return;
  }

  const originalSize = await getFileSize(sourcePath);

  try {
    // Convert to WebP
    const webpPath = path.join(PUBLIC_DIR, `${name}.webp`);
    await sharp(sourcePath)
      .webp({ quality: imgConfig.quality.webp })
      .toFile(webpPath);
    const webpSize = await getFileSize(webpPath);
    const webpSavings = ((1 - webpSize / originalSize) * 100).toFixed(1);

    // Convert to AVIF
    const avifPath = path.join(PUBLIC_DIR, `${name}.avif`);
    await sharp(sourcePath)
      .avif({ quality: imgConfig.quality.avif })
      .toFile(avifPath);
    const avifSize = await getFileSize(avifPath);
    const avifSavings = ((1 - avifSize / originalSize) * 100).toFixed(1);

    console.log(`✅ ${imgConfig.file}`);
    console.log(`   Original: ${formatBytes(originalSize)}`);
    console.log(`   WebP:     ${formatBytes(webpSize)} (${webpSavings}% savings)`);
    console.log(`   AVIF:     ${formatBytes(avifSize)} (${avifSavings}% savings)`);
    console.log('');

  } catch (error) {
    console.error(`❌ Error optimizing ${imgConfig.file}:`, error.message);
  }
}

async function main() {
  console.log('🖼️  Image Optimization Script\n');
  console.log('Converting PNG images to WebP and AVIF formats...\n');

  let totalOriginal = 0;
  let totalWebp = 0;
  let totalAvif = 0;

  for (const imgConfig of images) {
    const sourcePath = path.join(PUBLIC_DIR, imgConfig.file);
    if (fs.existsSync(sourcePath)) {
      const originalSize = await getFileSize(sourcePath);
      totalOriginal += originalSize;

      await optimizeImage(imgConfig);

      const name = path.parse(imgConfig.file).name;
      const webpSize = await getFileSize(path.join(PUBLIC_DIR, `${name}.webp`));
      const avifSize = await getFileSize(path.join(PUBLIC_DIR, `${name}.avif`));
      totalWebp += webpSize;
      totalAvif += avifSize;
    }
  }

  console.log('═'.repeat(60));
  console.log('📊 TOTAL SAVINGS');
  console.log('═'.repeat(60));
  console.log(`Original PNGs: ${formatBytes(totalOriginal)}`);
  console.log(`WebP total:    ${formatBytes(totalWebp)} (${((1 - totalWebp / totalOriginal) * 100).toFixed(1)}% savings)`);
  console.log(`AVIF total:    ${formatBytes(totalAvif)} (${((1 - totalAvif / totalOriginal) * 100).toFixed(1)}% savings)`);
  console.log('');
  console.log(`💾 Total space saved (WebP): ${formatBytes(totalOriginal - totalWebp)}`);
  console.log(`💾 Total space saved (AVIF): ${formatBytes(totalOriginal - totalAvif)}`);
  console.log('');
  console.log('✅ Optimization complete!');
  console.log('');
  console.log('Next steps:');
  console.log('1. Update image references to use <picture> elements');
  console.log('2. Test image loading in different browsers');
  console.log('3. Keep original PNGs as fallbacks');
}

main().catch(console.error);
