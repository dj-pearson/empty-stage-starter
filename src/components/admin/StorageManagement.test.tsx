import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

/**
 * US-643: the admin storage screen renders one tab per entry in
 * STORAGE_BUCKETS, so trimming that record is a UI change and not only a
 * typecheck one.
 *
 * Dropping recipe-images, private-files and backups was verified by typecheck
 * and by a production build, and both were happy -- neither can see that the
 * TabsList still asked for six columns, leaving three tabs squeezed into half
 * a row. This renders the thing.
 */
vi.mock('@/lib/storage-manager', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/storage-manager')>('@/lib/storage-manager');
  return {
    ...actual,
    // The real record, with only the network calls stubbed.
    storageManager: {
      getAllBuckets: () => actual.storageManager.getAllBuckets(),
      getAllBucketStats: async () => [],
      listFiles: async () => [],
    },
  };
});

import { StorageManagement } from './StorageManagement';
import { STORAGE_BUCKETS } from '@/lib/storage-manager';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('US-643: admin storage screen follows the bucket registry', () => {
  it('renders exactly one tab per registry entry', async () => {
    render(<StorageManagement />);
    const names = Object.values(STORAGE_BUCKETS).map((b) => b.displayName);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(await screen.findByRole('tab', { name: new RegExp(name, 'i') })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('tab')).toHaveLength(names.length);
  });

  it('no longer advertises the three buckets nothing created', async () => {
    render(<StorageManagement />);
    await screen.findAllByRole('tab');
    for (const gone of ['Recipe Images', 'Private Files', 'System Backups']) {
      expect(screen.queryByRole('tab', { name: new RegExp(gone, 'i') })).toBeNull();
    }
  });

  it('reports the registry count rather than a stale number', async () => {
    render(<StorageManagement />);
    const n = Object.keys(STORAGE_BUCKETS).length;
    expect(await screen.findByText(new RegExp(`Across ${n} buckets`, 'i'))).toBeInTheDocument();
  });

  it('sizes the tab row to the bucket count, not to a hardcoded six', async () => {
    const { container } = render(<StorageManagement />);
    // Await the async stats load before reading the DOM, or React warns about
    // an unwrapped state update and the warning drowns the real output.
    await screen.findAllByRole('tab');
    const list = container.querySelector('[role="tablist"]') as HTMLElement | null;
    expect(list).not.toBeNull();
    // A fixed grid-cols-N is what desynchronised from the registry before.
    expect(list!.className).not.toMatch(/grid-cols-\d/);
    expect(list!.style.gridTemplateColumns).toContain('auto-fit');
  });
});
