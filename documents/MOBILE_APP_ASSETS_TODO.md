# Mobile App Assets - Action Required

## App Icons Needed

You'll need to create these icons for your mobile apps:

### iOS
- **icon-512x512.png** (already referenced in config)
  - 512x512 pixels
  - No rounded corners (iOS adds them automatically)
  - Should have a solid background (not transparent)

### Android  
- **icon-512x512.png** (same file works for Android)
  - 512x512 pixels
  - Can have transparency
  - Used as the adaptive icon foreground

### Splash Screen
- **splash.png**
  - Recommended size: 1284x2778 pixels (iPhone 13 Pro Max resolution)
  - Or minimum: 1242x2688 pixels
  - Should work on any aspect ratio
  - Use `resizeMode: "contain"` in config (already set)

## Where to Place Icons

All icon files should go in the `public/` directory:
```
public/
├── icon-512x512.png  (app icon)
├── splash.png        (splash screen)
└── favicon.ico       (already exists for web)
```

## Creating Icons

### Using Your Logo
You currently have:
- `public/Logo-Green.png` 
- `public/Logo-White.png`
- `public/Palette.png`

### Recommended Approach:
1. Use your green logo as the base
2. Export as 512x512 PNG with solid background
3. For splash screen, center the logo on a white or brand-colored background
4. Ensure logos are recognizable at small sizes

### Tools:
- **Figma/Photoshop**: For professional design
- **Icon generators**: 
  - https://appicon.co/ (free)
  - https://www.appicon.build/ (free)
  - https://makeappicon.com/ (generates all sizes)

## Current Status

Currently, placeholder markdown files exist at:
- `public/icon-512x512.png.md`
- `public/splash.png.md`

These need to be replaced with actual PNG image files.

## Next Steps

1. Create the icon and splash screen assets
2. Delete the `.md` placeholder files
3. Place the actual PNG files in `public/`
4. Test locally with `npm run expo:start`
5. Build for production with EAS Build

## Testing

After adding the assets, test them:
```bash
npm run expo:start
```

Then press:
- `i` for iOS simulator
- `a` for Android emulator
- Scan QR code for physical device testing

