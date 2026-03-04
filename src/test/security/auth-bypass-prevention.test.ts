import { describe, it, expect } from 'vitest';
import { sanitizeText, sanitizeHtml, sanitizeObject } from '@/lib/sanitize';

describe('Auth Bypass Prevention', () => {
  describe('Input sanitization for auth fields', () => {
    it('sanitizes email field to strip HTML', () => {
      const dirtyEmail = 'user@example.com<script>alert(1)</script>';
      const clean = sanitizeText(dirtyEmail);
      expect(clean).not.toContain('<script');
      expect(clean).toContain('user@example.com');
    });

    it('strips script tags from input fields', () => {
      const dirtyPass = '<script>stealCookies()</script>password123';
      const clean = sanitizeText(dirtyPass);
      expect(clean).not.toContain('<script');
      expect(clean).toContain('password123');
    });

    it('strips HTML from auth-related input fields', () => {
      const dirtyName = '<script>alert(document.cookie)</script>Admin';
      const clean = sanitizeText(dirtyName);
      expect(clean).not.toContain('<script');
      expect(clean).toContain('Admin');
    });

    it('strips img tags with event handlers', () => {
      const dirty = '<img onerror=alert(1)>test';
      const clean = sanitizeText(dirty);
      expect(clean).not.toContain('<img');
      expect(clean).not.toContain('onerror');
    });
  });

  describe('Object sanitization for form data', () => {
    it('sanitizes all string fields in a login form', () => {
      const formData = {
        email: 'admin@example.com<script>alert(1)</script>',
        password: 'pass<img onerror=alert(1)>word',
      };
      const clean = sanitizeObject(formData);
      expect(clean.email).not.toContain('<script');
      expect(clean.password).not.toContain('<img');
      expect(clean.password).not.toContain('onerror');
    });

    it('sanitizes nested registration form data', () => {
      const formData = {
        email: 'user@test.com',
        profile: {
          name: '<img onerror=alert(1)>John',
          bio: '<script>document.cookie</script>Hello',
        },
      };
      const clean = sanitizeObject(formData);
      const profile = clean.profile as Record<string, string>;
      expect(profile.name).not.toContain('<img');
      expect(profile.name).not.toContain('onerror');
      expect(profile.bio).not.toContain('<script');
      expect(profile.bio).toContain('Hello');
    });

    it('sanitizes array values in form data', () => {
      const formData = {
        tags: ['<script>alert(1)</script>safe', 'normal'],
      };
      const clean = sanitizeObject(formData);
      expect((clean.tags as string[])[0]).not.toContain('<script');
      expect((clean.tags as string[])[1]).toBe('normal');
    });
  });

  describe('Rate limiting module exists', () => {
    it('rateLimiter module is importable', async () => {
      const rl = await import('@/lib/rateLimiter');
      expect(rl).toBeDefined();
      expect(typeof rl.checkRateLimit).toBe('function');
      expect(typeof rl.recordAttempt).toBe('function');
    });

    it('rateLimiter has progressive lockout functions', async () => {
      const rl = await import('@/lib/rateLimiter');
      expect(typeof rl.getLockoutDuration).toBe('function');
      expect(typeof rl.getLockoutTierLabel).toBe('function');
    });
  });
});
