import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * US-553: the regression net for decomposing SEOManager.
 *
 * Every previous pass at this file stopped at the same place: the remaining
 * tabs share 57 useState values across one 4000-line function, and pulling a
 * stateful tab out means re-wiring that state as props. A typecheck does not
 * catch a prop threaded to the wrong sibling, or a handler that silently stops
 * being called -- both compile fine and both break the tab.
 *
 * So this asserts the thing an extraction can actually break: every tab still
 * mounts and renders its own content. It is deliberately shallow on behaviour
 * and broad on coverage, because the risk being managed is "tab N stopped
 * working and nobody noticed", not "the audit algorithm is wrong" (that lives
 * in seoScore.test.ts).
 */

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  // Every builder method returns the chain, and awaiting it yields an empty
  // result set. SEOManager reaches for several different shapes
  // (.select().order(), .insert(), .eq()...), so a self-returning proxy is
  // sturdier here than enumerating them.
  const proxy: unknown = new Proxy(chain, {
    get: (_t, prop) => {
      if (prop === 'then') return undefined; // not a thenable until awaited below
      return vi.fn(() => proxy);
    },
  });

  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null }),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          then: undefined,
        })),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })),
        delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })),
      })),
      functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    },
  };
});

vi.mock('@/lib/edge-functions', () => ({
  invokeEdgeFunction: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));

// ContentOptimizer pulls in its own data stack; the tab shell is what matters here.
vi.mock('./ContentOptimizer', () => ({
  // Rendered text, not an empty div: the tab walk below asserts each panel has
  // content, and an empty stand-in would look like a broken tab.
  ContentOptimizer: () => <div data-testid="content-optimizer">content optimizer</div>,
}));

/**
 * The 23 tabs SEOManager owns. Keeping the list explicit means an extraction
 * that drops a tab fails loudly rather than shrinking the assertion silently.
 */
const TABS = [
  'audit',
  'site-crawler',
  'broken-links',
  'redirects',
  'security',
  'mobile-check',
  'content',
  'content-optimizer',
  'pages',
  'meta',
  'duplicate-content',
  'image-analysis',
  'keywords',
  'competitors',
  'backlinks',
  'link-structure',
  'performance',
  'budget',
  'robots',
  'sitemap',
  'llms',
  'structured',
  'monitoring',
] as const;

beforeEach(() => {
  vi.clearAllMocks();
});

const renderManager = async () => {
  const { SEOManager } = await import('./SEOManager');
  return render(<SEOManager />);
};

/** Radix encodes the tab value in the trigger id: `radix-<n>-trigger-audit`. */
const tabValue = (trigger: Element) =>
  trigger.getAttribute('id')?.replace(/^.*-trigger-/, '') ?? '';

describe('SEOManager renders (US-553 decomposition net)', () => {
  it('mounts without throwing', async () => {
    await renderManager();
    expect(await screen.findByRole('tab', { name: /audit/i })).toBeInTheDocument();
  });

  it('still owns exactly the 23 known tabs', async () => {
    const { container } = await renderManager();

    const values = [...container.querySelectorAll('[role="tab"]')].map(tabValue);

    // Set comparison, so a reordering during extraction is fine but a dropped
    // or renamed tab is not.
    expect([...values].sort()).toEqual([...TABS].sort());
  });

  /**
   * One mount, every tab activated. All 23 panels stay in the DOM, so the
   * panel under test is found through the trigger's aria-controls rather than
   * by taking the first one -- picking the first is why an earlier version of
   * this test reported every tab as broken.
   */
  it('renders every tab without crashing', async () => {
    const user = userEvent.setup();
    const { container } = await renderManager();

    const triggers = [...container.querySelectorAll('[role="tab"]')];
    expect(triggers).toHaveLength(TABS.length);

    const broken: string[] = [];

    for (const trigger of triggers) {
      const value = tabValue(trigger);
      await user.click(trigger);

      try {
        await waitFor(
          () => {
            expect(trigger.getAttribute('data-state')).toBe('active');
            const panelId = trigger.getAttribute('aria-controls');
            const panel = panelId ? container.querySelector(`[id="${CSS.escape(panelId)}"]`) : null;
            if (!panel) throw new Error(`no panel for ${value}`);
            if ((panel.textContent ?? '').trim().length === 0) {
              throw new Error(`empty panel for ${value}`);
            }
          },
          { timeout: 2000 },
        );
      } catch {
        broken.push(value);
      }
    }

    expect(broken).toEqual([]);
    // 23 activations of a 4000-line component; the default 5s is not enough,
    // and the point of this test is covering every tab, not speed.
  }, 120_000);
});
