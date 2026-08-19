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
  // Seeded so the tab walk exercises the POPULATED branches, not just empty
  // states. An earlier version returned nothing for everything, and a tab
  // whose result list was empty rendered a placeholder -- which is how a
  // missing `seoScore` prop slipped through the walk unnoticed. Rows match
  // what the loaders in SEOManager read.
  const seed: Record<string, unknown[]> = {
    seo_competitor_analysis: [
      {
        competitor_url: 'https://rival.example',
        overall_score: 91,
        status_code: 'passed',
        // Each category is a list of checks, not a score: the competitors tab
        // maps over analysis.technical/onPage/mobile/content.
        analysis: {
          technical: [{ item: 'HTTPS', status: 'passed' }],
          onPage: [{ item: 'Title tag', status: 'warning' }],
          mobile: [{ item: 'Viewport', status: 'passed' }],
          content: [{ item: 'Word count', status: 'failed' }],
        },
        analyzed_at: '2026-08-19T00:00:00Z',
      },
    ],
    seo_keywords: [
      {
        keyword: 'arfid meal planner',
        current_position: 4,
        search_volume: 1200,
        difficulty: 38,
        target_url: 'https://tryeatpal.com/',
        position_trend: 'up',
        impressions: 900,
        clicks: 120,
        ctr: 13,
      },
    ],
    seo_page_scores: [
      {
        page_url: 'https://tryeatpal.com/pricing',
        page_title: 'Pricing',
        word_count: 800,
        issues_count: 2,
        overall_score: 78,
      },
    ],
  };

  /**
   * PostgREST builders chain arbitrarily (.select().eq().order().limit()) and
   * are awaited at the end, so this is a self-returning thenable rather than a
   * fixed set of stubbed methods. Anything not seeded resolves to [].
   */
  const builderFor = (table: string) => {
    const rows = seed[table] ?? [];
    const builder: Record<string | symbol, unknown> = {};
    return new Proxy(builder, {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
        }
        return () => builderFor(table);
      },
    });
  };

  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null }),
      },
      from: vi.fn((table: string) => builderFor(table)),
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
