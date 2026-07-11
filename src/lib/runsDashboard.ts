/**
 * Pure helpers for the agent runs / cost dashboard (US-486).
 *
 * React/Supabase-free so duration formatting, the 14-day spend series, cap
 * utilization, and pagination math are unit-testable (see runsDashboard.test.ts).
 */

export const RUNS_PAGE_SIZE = 25;

/** Supabase .range() bounds for a zero-based page. */
export function pageRange(page: number, size: number = RUNS_PAGE_SIZE): { from: number; to: number } {
  const from = Math.max(0, page) * size;
  return { from, to: from + size - 1 };
}

/** Total number of pages for a row count. */
export function pageCount(total: number, size: number = RUNS_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

/** Human-friendly run duration; '—' when unfinished or invalid. */
export function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return '—';
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

/** Today's cap utilization as a 0..100+ percentage (0 when no cap). */
export function capUtilization(todaySpendUsd: number, capUsd: number): number {
  if (capUsd <= 0) return 0;
  return Math.round((todaySpendUsd / capUsd) * 100);
}

/** UTC YYYY-MM-DD for an ISO timestamp. */
export function utcDayKey(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toISOString().slice(0, 10);
}

export interface RunForChart {
  agent_id: string | null;
  cost_usd: number | null;
  started_at: string;
}

export interface SpendSeries {
  /** One row per day, oldest first: { date: 'MM-DD', <agentName>: number, ... }. */
  data: Array<Record<string, string | number>>;
  /** Agent names that have any spend in the window (chart series / legend). */
  agents: string[];
}

/**
 * Build a stacked-bar-ready daily spend series for the last `days` days
 * (ending on `now`, UTC), grouped by agent name. Runs outside the window or
 * with an unknown agent are ignored. Every row carries all agent keys (0 when
 * none) so the stack renders consistently.
 */
export function buildDailySpendSeries(
  runs: RunForChart[],
  agentNameById: Map<string, string>,
  days: number,
  now: Date,
): SpendSeries {
  const dayKeys: string[] = [];
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let i = days - 1; i >= 0; i--) {
    dayKeys.push(utcDayKey(new Date(base - i * 86_400_000)));
  }
  const dayset = new Set(dayKeys);

  // agentName -> (dayKey -> summed cost)
  const totals = new Map<string, Map<string, number>>();
  for (const run of runs) {
    if (!run.agent_id) continue;
    const name = agentNameById.get(run.agent_id);
    if (!name) continue;
    const key = utcDayKey(run.started_at);
    if (!dayset.has(key)) continue;
    const byDay = totals.get(name) ?? new Map<string, number>();
    byDay.set(key, (byDay.get(key) ?? 0) + (run.cost_usd ?? 0));
    totals.set(name, byDay);
  }

  const agents = [...totals.keys()].sort();
  const data = dayKeys.map((key) => {
    const row: Record<string, string | number> = { date: key.slice(5) }; // MM-DD
    for (const name of agents) {
      row[name] = Math.round((totals.get(name)?.get(key) ?? 0) * 1_000_000) / 1_000_000;
    }
    return row;
  });

  return { data, agents };
}
