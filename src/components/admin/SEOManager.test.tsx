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
    // US-553: the monitoring tab reads four tables. Seeded so its alert,
    // rule, schedule and preferences branches render rather than placeholders.
    seo_alerts: [
      {
        id: 'alert-1',
        alert_type: 'score_drop',
        severity: 'high',
        title: 'Score dropped',
        message: 'Overall score fell 8 points',
        details: { from: 86, to: 78 },
        created_at: '2026-08-19T00:00:00Z',
      },
    ],
    seo_alert_rules: [
      { id: 'rule-1', rule_name: 'Score drop', rule_type: 'score', severity: 'high', is_enabled: true },
    ],
    seo_monitoring_schedules: [
      {
        id: 'sched-1',
        schedule_name: 'Nightly audit',
        schedule_type: 'audit',
        cron_expression: '0 3 * * *',
        is_enabled: true,
        last_run_at: '2026-08-19T03:00:00Z',
        last_run_status: 'success',
      },
    ],
    seo_notification_preferences: [
      {
        email_enabled: true,
        immediate_alerts: true,
        daily_digest: false,
        weekly_digest: true,
        notify_score_drops: true,
        notify_keyword_changes: false,
        notify_competitor_changes: true,
        notify_gsc_issues: true,
        notify_performance_issues: false,
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

  // Records every table touched, so a test can assert WHICH queries a mount
  // fires and HOW MANY times. That is the signal a hook extraction can break
  // without breaking any prop: a lost load queries nothing, an unstable
  // dependency queries the same table on every render.
  const from = vi.fn((table: string) => builderFor(table));

  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null }),
      },
      from,
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
 * The 25 tabs SEOManager owns. Keeping the list explicit means an extraction
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
  // US-651
  'cannibalization',
  // US-653
  'index-coverage',
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
    // toBeTruthy rather than toBeInTheDocument: jest-dom's matcher types are
    // not wired into this project's tsconfig, and findByRole already throws
    // if the element is absent.
    expect(await screen.findByRole('tab', { name: /audit/i })).toBeTruthy();
  });

  it('still owns exactly the 25 known tabs', async () => {
    const { container } = await renderManager();

    const values = [...container.querySelectorAll('[role="tab"]')].map(tabValue);

    // Set comparison, so a reordering during extraction is fine but a dropped
    // or renamed tab is not.
    expect([...values].sort()).toEqual([...TABS].sort());
  });

  /**
   * One mount, every tab activated. All 25 panels stay in the DOM, so the
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
    // 25 activations of a 4000-line component; the default 5s is not enough,
    // and the point of this test is covering every tab, not speed.
  }, 120_000);
});

/**
 * US-553: the net for the half of AC1 that is still open.
 *
 * Every tab is now presentational, and the next step is pulling SEOManager's
 * 57 useState and 26 async handlers into hooks. That change cannot break a
 * prop (typecheck:seo covers those) and need not break a render (the tab walk
 * covers that) -- it breaks EFFECT TIMING: a load that silently stops running,
 * or a dependency that goes unstable and refetches on every render.
 *
 * So this pins the mount-time query behaviour. It is a characterisation test:
 * it records what SEOManager does today, not what it ideally should, so that
 * a refactor which changes it has to do so deliberately.
 */
describe('SEOManager mount-time loads (US-553 hook-extraction net)', () => {
  const tablesQueried = async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    const from = supabase.from as unknown as { mock: { calls: unknown[][] } };
    return from.mock.calls.map((call) => call[0] as string);
  };

  it('loads exactly the tables its mount effect asks for', async () => {
    await renderManager();
    await waitFor(async () => expect((await tablesQueried()).length).toBe(3));

    // Three of the five mount-effect calls hit Postgres. loadSEOSettings is
    // local only -- it generates default robots.txt/sitemap text and queries
    // nothing -- and checkGSCConnection goes through an edge function, so
    // neither shows up here.
    expect([...new Set(await tablesQueried())].sort()).toEqual([
      'seo_competitor_analysis',
      'seo_keywords',
      'seo_page_scores',
    ]);
  });

  it('queries each of them once, not once per render', async () => {
    await renderManager();
    await waitFor(async () => expect((await tablesQueried()).length).toBe(3));

    // A hook with an unstable dependency refetches on every render, which is
    // invisible in the UI and expensive in production. Counts stay at 1.
    const counts = (await tablesQueried()).reduce<Record<string, number>>((acc, table) => {
      acc[table] = (acc[table] ?? 0) + 1;
      return acc;
    }, {});

    expect(counts).toEqual({
      seo_keywords: 1,
      seo_competitor_analysis: 1,
      seo_page_scores: 1,
    });
  });

  it('does query them once that tab is opened', async () => {
    const user = userEvent.setup();
    const { container } = await renderManager();
    await waitFor(async () => expect((await tablesQueried()).length).toBe(3));

    const monitoring = [...container.querySelectorAll('[role="tab"]')].find(
      (el) => (el.getAttribute('id') ?? '').endsWith('-trigger-monitoring'),
    );
    await user.click(monitoring as Element);

    // The lazy load is an effect keyed on the tab being open (US-553); before
    // that it was an IIFE running during render.
    await waitFor(async () => {
      expect(await tablesQueried()).toContain('seo_alerts');
    });
  }, 30_000);

  it('does not query the monitoring tables until that tab is opened', async () => {
    await renderManager();
    await waitFor(async () => expect((await tablesQueried()).length).toBe(3));

    // loadMonitoringData is deliberately lazy - the monitoring tab reads
    // activeTab so it only loads while open. A hook extraction that hoists it
    // to mount would quietly add four queries to every admin page view.
    const queried = await tablesQueried();
    expect(queried).not.toContain('seo_alerts');
    expect(queried).not.toContain('seo_alert_rules');
    expect(queried).not.toContain('seo_monitoring_schedules');
    expect(queried).not.toContain('seo_notification_preferences');
  });
});

/**
 * US-553: the robots/sitemap/llms editors are the one part of the extraction
 * the tab walk above cannot vouch for. Their content lives in a <Textarea
 * value=...>, and React writes that through the value property, not as a text
 * node -- so a panel whose editor is blank still has non-empty textContent
 * from its labels and buttons, and the walk passes. If useSeoFiles ever loses
 * its mount effect (or loadSEOSettings stops calling one of the three
 * setters), this is what notices.
 */
describe('SEOManager file editors populate on mount (US-553)', () => {
  const editorFor = async (value: string) => {
    const user = userEvent.setup();
    const { container } = await renderManager();
    const trigger = [...container.querySelectorAll('[role="tab"]')].find(
      (el) => (el.getAttribute('id') ?? '').endsWith(`-trigger-${value}`),
    );
    if (!trigger) throw new Error(`no trigger for ${value}`);
    // Radix keeps the panel element mounted for a11y but only renders its
    // children while the tab is selected, so the editor does not exist until
    // the tab is opened.
    await user.click(trigger);
    const panelId = trigger.getAttribute('aria-controls');
    const panel = panelId ? container.querySelector(`[id="${CSS.escape(panelId)}"]`) : null;
    if (!panel) throw new Error(`no panel for ${value}`);
    await waitFor(() => {
      if (!panel.querySelector('textarea')) throw new Error(`no editor in ${value}`);
    });
    return panel.querySelector('textarea') as HTMLTextAreaElement | null;
  };

  it.each([
    ['robots', /User-agent:/],
    ['sitemap', /<urlset/],
    ['llms', /EatPal/],
  ])('fills the %s editor', async (tab, marker) => {
    const editor = await editorFor(tab);
    expect(editor).toBeTruthy();
    await waitFor(() => expect((editor as HTMLTextAreaElement).value).toMatch(marker));
  }, 30_000);
});
