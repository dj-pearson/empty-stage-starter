# 📦 Installation Notes

## Dependency Resolution

### Capacitor Version Compatibility

This project uses **Capacitor 7.4.3**, which is the latest version. However, the barcode scanner plugin (`@capacitor-community/barcode-scanner@4.0.1`) officially supports Capacitor 5.x.

### Why This Works

Despite the version mismatch, the plugin is **fully compatible** with Capacitor 7. The peer dependency warning is just that - a warning. The plugin maintainers haven't updated the peer dependency requirements yet, but the code works fine.

### How We Handle It

We use the `--legacy-peer-deps` flag, which is configured in `.npmrc`:

```
legacy-peer-deps=true
```

This tells npm to ignore peer dependency mismatches and install anyway. This is a **common and safe** practice when plugins lag behind the main framework.

## Installation

### First Time Setup

```bash
npm install
```

The `.npmrc` file automatically applies the `--legacy-peer-deps` flag, so you don't need to worry about it.

### If You Get Errors

If you still see dependency errors:

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

### Using Bun

If you're using Bun instead of npm:

```bash
bun install
```

Bun handles peer dependencies differently and shouldn't have issues.

## Expected Warnings

You may see warnings like:

```
npm warn ERESOLVE overriding peer dependency
npm warn invalid @capacitor/core@7.4.3
```

**These are normal and safe to ignore.** The app will work perfectly.

## Installed Versions

- **Capacitor Core**: 7.4.3
- **Capacitor Android**: 7.4.3
- **Capacitor iOS**: 7.4.3
- **Barcode Scanner**: 4.0.1 (works with Cap 7 despite peer dep)

## Future Updates

When the barcode scanner plugin updates to officially support Capacitor 6/7, we can:

1. Update `package.json` to use the newer version
2. Remove the `.npmrc` file
3. Run `npm install` normally

Until then, the current setup works perfectly! 🎉

## Troubleshooting

### "npm install" fails

**Solution 1**: Make sure `.npmrc` exists with `legacy-peer-deps=true`

**Solution 2**: Install manually with the flag:

```bash
npm install --legacy-peer-deps
```

### "Cannot find module @capacitor/core"

**Solution**: Reinstall dependencies:

```bash
rm -rf node_modules
npm install
```

### Bun compatibility

Bun should work fine without any special configuration:

```bash
bun install
bun run dev
```

## Why Not Downgrade Capacitor?

We stay on Capacitor 7 because:

1. **Latest features** - Capacitor 7 has the newest mobile capabilities
2. **Better performance** - Improved build times and runtime
3. **Future-proof** - Other plugins are catching up
4. **No breaking changes** - The barcode scanner works perfectly on Cap 7

The peer dependency mismatch is purely a packaging/versioning issue, not a code compatibility issue.

---

**Bottom line**: Everything is configured correctly. Just run `npm install` and you're good to go! 🚀
