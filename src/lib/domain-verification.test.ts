import { describe, it, expect } from 'vitest';
import { isValidDomain } from './domain-verification';

describe('isValidDomain', () => {
  it('accepts host names and subdomains', () => {
    expect(isValidDomain('example.com')).toBe(true);
    expect(isValidDomain('clinic.example.co.uk')).toBe(true);
    expect(isValidDomain('my-clinic.example.com')).toBe(true);
    expect(isValidDomain('a.io')).toBe(true);
  });

  it('rejects schemes, paths, ports, bare labels and edge hyphens', () => {
    expect(isValidDomain('https://example.com')).toBe(false);
    expect(isValidDomain('example.com/path')).toBe(false);
    expect(isValidDomain('example.com:8080')).toBe(false);
    expect(isValidDomain('localhost')).toBe(false);
    expect(isValidDomain('-example.com')).toBe(false);
    expect(isValidDomain('example-.com')).toBe(false);
    expect(isValidDomain(`${'a'.repeat(64)}.com`)).toBe(false);
  });

  it('fails fast on a long run of labels that does not match', () => {
    // The old pattern backtracked exponentially on exactly this shape.
    const hostile = `${'0.0'.repeat(80)}!`; // under the 253-character cap
    const started = performance.now();
    expect(isValidDomain(hostile)).toBe(false);
    expect(performance.now() - started).toBeLessThan(250);
  });
});
