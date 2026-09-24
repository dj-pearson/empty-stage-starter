import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareOrCopyText } from './shareText';

const original = {
  share: Object.getOwnPropertyDescriptor(navigator, 'share'),
  clipboard: Object.getOwnPropertyDescriptor(navigator, 'clipboard'),
};

function setNav(key: 'share' | 'clipboard', value: unknown) {
  Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
}

afterEach(() => {
  for (const key of ['share', 'clipboard'] as const) {
    const desc = original[key];
    if (desc) Object.defineProperty(navigator, key, desc);
    else delete (navigator as unknown as Record<string, unknown>)[key];
  }
});

describe('shareOrCopyText', () => {
  it('returns shared when the share sheet accepts', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNav('share', share);
    await expect(shareOrCopyText('hi', { preferShare: true, title: 'T' })).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'T', text: 'hi' });
  });

  it('returns cancelled on AbortError and does not copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNav('share', vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError')));
    setNav('clipboard', { writeText });
    await expect(shareOrCopyText('hi', { preferShare: true })).resolves.toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('returns copied when the clipboard accepts', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNav('share', undefined);
    setNav('clipboard', { writeText });
    await expect(shareOrCopyText('hi', { preferShare: true })).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('hi');
  });

  it('skips the share sheet unless asked', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNav('share', share);
    setNav('clipboard', { writeText: vi.fn().mockResolvedValue(undefined) });
    await expect(shareOrCopyText('hi')).resolves.toBe('copied');
    expect(share).not.toHaveBeenCalled();
  });

  it('returns failed without throwing when there is no clipboard', async () => {
    setNav('share', undefined);
    setNav('clipboard', undefined);
    await expect(shareOrCopyText('hi')).resolves.toBe('failed');
  });

  it('returns failed when the clipboard rejects', async () => {
    setNav('clipboard', { writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    await expect(shareOrCopyText('hi')).resolves.toBe('failed');
  });
});
