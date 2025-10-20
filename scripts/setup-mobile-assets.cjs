#!/usr/bin/env node

/**
 * Mobile Assets Setup Script
 * 
 * This script prepares temporary placeholder assets for mobile development.
 * For production, you should create proper 512x512 icons and splash screens.
 * 
 * Run: node scripts/setup-mobile-assets.js
 */

const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');

// Files to check
const requiredAssets = [
  { file: 'icon-512x512.png', source: 'Logo-Green.png', description: 'App Icon' },
  { file: 'splash.png', source: 'Cover.png', description: 'Splash Screen' },
];

console.log('\n🎨 EatPal Mobile Assets Setup\n');

let allExist = true;
let needsAction = false;

requiredAssets.forEach(({ file, source, description }) => {
  const targetPath = path.join(publicDir, file);
  const sourcePath = path.join(publicDir, source);
  const placeholderPath = targetPath + '.md';
  
  // Check if target exists
  if (fs.existsSync(targetPath)) {
    console.log(`✅ ${description}: ${file} already exists`);
  } 
  // Check if source exists to copy
  else if (fs.existsSync(sourcePath)) {
    console.log(`📋 ${description}: Copying ${source} to ${file}...`);
    try {
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`✅ ${description}: Created ${file} from ${source}`);
      
      // Remove placeholder if it exists
      if (fs.existsSync(placeholderPath)) {
        fs.unlinkSync(placeholderPath);
        console.log(`   Removed placeholder ${file}.md`);
      }
    } catch (error) {
      console.error(`❌ Error copying ${source}:`, error.message);
      allExist = false;
    }
  }
  // Neither target nor source exists
  else {
    console.log(`⚠️  ${description}: ${file} NOT FOUND`);
    console.log(`   Source ${source} also not found`);
    allExist = false;
    needsAction = true;
  }
});

console.log('\n');

if (allExist) {
  console.log('✨ All mobile assets are ready!\n');
  console.log('Next steps:');
  console.log('  1. Run: npx eas init');
  console.log('  2. Run: npm run expo:start');
  console.log('  3. Press "i" for iOS or "a" for Android\n');
} else if (needsAction) {
  console.log('⚠️  Some assets are missing and need to be created manually.\n');
  console.log('Please create:');
  requiredAssets.forEach(({ file, description }) => {
    const targetPath = path.join(publicDir, file);
    if (!fs.existsSync(targetPath)) {
      console.log(`  - ${description}: public/${file}`);
    }
  });
  console.log('\nSee MOBILE_APP_ASSETS_TODO.md for detailed instructions.\n');
  process.exit(1);
} else {
  console.log('⚠️  Some errors occurred. Please check the output above.\n');
  process.exit(1);
}

