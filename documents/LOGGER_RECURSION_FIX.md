# Logger Infinite Recursion Fix

## Issue
**Date:** November 24, 2025  
**Severity:** Critical  
**Error:** `RangeError: Maximum call stack size exceeded` / `InternalError: too much recursion`

## Symptoms
- Blank page after successful Cloudflare Pages deployment
- Browser console showing infinite recursion in `index-*.js`
- Stack trace showing repeated calls to `error` function
- Application completely non-functional

## Root Cause
The `Logger` class in `src/lib/logger.ts` had **self-referential method calls** instead of calling the native `console` methods:

### Before (Broken):
```typescript
class Logger {
  debug(message: string, ...args: unknown[]): void {
    if (this.isDev) {
      logger.debug(`[DEBUG] ${message}`, ...args); // ❌ Calls itself!
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.isDev) {
      logger.info(`[INFO] ${message}`, ...args); // ❌ Calls itself!
    }
  }

  warn(message: string, ...args: unknown[]): void {
    logger.warn(`[WARN] ${message}`, ...args); // ❌ Calls itself!
  }

  error(message: string, error?: unknown, ...args: unknown[]): void {
    logger.error(`[ERROR] ${message}`, error, ...args); // ❌ Calls itself!
  }
}
```

### After (Fixed):
```typescript
class Logger {
  debug(message: string, ...args: unknown[]): void {
    if (this.isDev) {
      console.debug(`[DEBUG] ${message}`, ...args); // ✅ Calls console.debug
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.isDev) {
      console.info(`[INFO] ${message}`, ...args); // ✅ Calls console.info
    }
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`[WARN] ${message}`, ...args); // ✅ Calls console.warn
  }

  error(message: string, error?: unknown, ...args: unknown[]): void {
    console.error(`[ERROR] ${message}`, error, ...args); // ✅ Calls console.error
  }
}
```

## Why This Happened
The methods were calling `logger.debug()`, `logger.info()`, etc., which are the same methods being defined. This created an infinite loop:
1. `logger.error()` is called
2. Inside `logger.error()`, it calls `logger.error()` again
3. This repeats infinitely until the call stack overflows

## Fix Applied
Changed all method implementations to call the native `console` methods:
- `logger.debug()` → `console.debug()`
- `logger.info()` → `console.info()`
- `logger.warn()` → `console.warn()`
- `logger.error()` → `console.error()`

## Files Modified
- `src/lib/logger.ts` - Fixed recursive calls in Logger class

## Testing
1. Build the application: `npm run build`
2. Deploy to Cloudflare Pages (automatic on push to main)
3. Verify the application loads without stack overflow errors
4. Check browser console for proper logging output

## Prevention
To prevent this issue in the future:
1. **Code Review:** Always check for self-referential calls in class methods
2. **Testing:** Test logger implementations in isolation before integration
3. **Linting:** Consider adding ESLint rules to detect potential infinite recursion
4. **Unit Tests:** Add unit tests for the Logger class to catch these issues early

## Related Issues
- This bug was introduced when refactoring the logger to use a class-based approach
- The previous implementation likely used direct `console.*` calls
- The bug only manifested in production builds due to minification and bundling

## Deployment Status
- **Commit:** `5df9afe` - "fix: Resolve infinite recursion in logger causing stack overflow"
- **Pushed:** November 24, 2025
- **Cloudflare Pages:** Deployment in progress

## Additional Notes
- The error was particularly difficult to debug because it occurred in minified code
- The Firefox console provided better error messages than Chrome/Edge
- The SES (Secure ECMAScript) lockdown from dependencies made the error more visible
- This highlights the importance of testing production builds locally before deployment

