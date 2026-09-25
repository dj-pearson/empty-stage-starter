/**
 * One child's logged dishes per month, stacked by result. Loaded lazily by
 * HouseholdNumbers, so recharts stays out of the page's first chunk.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { RESULT_CHART_COLOR, type LoggedResult } from '@/lib/mealResultStyle';
import type { HouseholdMonthRow } from '@/lib/householdMonthly';
import '@/i18n/appLocale';

export interface HouseholdChartProps {
  /** Rows for the one kid in focus. */
  rows: ReadonlyArray<HouseholdMonthRow>;
  /** Every month on the axis, oldest first ('YYYY-MM'), gaps included. */
  months: ReadonlyArray<string>;
  kidName: string;
}

const RESULTS: readonly LoggedResult[] = ['ate', 'tasted', 'refused'];

function monthLabel(month: string, locale: string, style: 'short' | 'long' = 'short'): string {
  const [y, m] = month.split('-').map(Number);
  const opts: Intl.DateTimeFormatOptions = style === 'long' ? { month: 'long', year: 'numeric' } : { month: 'short' };
  return new Intl.DateTimeFormat(locale, opts).format(new Date(y, m - 1, 1));
}

export function HouseholdChart({ rows, months, kidName }: HouseholdChartProps) {
  const { t, i18n } = useTranslation();
  const reducedMotion = useReducedMotion();
  const locale = i18n.language || 'en';

  const config = useMemo<ChartConfig>(
    () => ({
      ate: { label: t('progressHousehold.result.ate', { defaultValue: 'Ate' }), color: RESULT_CHART_COLOR.ate },
      tasted: {
        label: t('progressHousehold.result.tasted', { defaultValue: 'Tasted' }),
        color: RESULT_CHART_COLOR.tasted,
      },
      refused: {
        label: t('progressHousehold.result.refused', { defaultValue: 'Refused' }),
        color: RESULT_CHART_COLOR.refused,
      },
    }),
    [t]
  );

  const data = useMemo(() => {
    const byMonth = new Map(rows.map((r) => [r.month, r]));
    return months.map((month) => {
      const row = byMonth.get(month);
      return {
        month,
        label: monthLabel(month, locale),
        longLabel: monthLabel(month, locale, 'long'),
        ate: row?.ate ?? 0,
        tasted: row?.tasted ?? 0,
        refused: row?.refused ?? 0,
      };
    });
  }, [rows, months, locale]);

  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium">
        {t('progressHousehold.chart.caption', {
          name: kidName,
          defaultValue: '{{name}}: dishes logged each month',
        })}
      </figcaption>
      {/* The bars are drawn for sighted users; screen readers get the same
          numbers as a table, month by month. */}
      <ChartContainer config={config} className="aspect-auto h-56 w-full" aria-hidden="true">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={4} />
          <YAxis allowDecimals={false} width={28} tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {RESULTS.map((result) => (
            <Bar
              key={result}
              dataKey={result}
              stackId="results"
              fill={`var(--color-${result})`}
              isAnimationActive={!reducedMotion}
            />
          ))}
        </BarChart>
      </ChartContainer>
      <table className="sr-only">
        <thead>
          <tr>
            <th scope="col">{t('progressHousehold.chart.month', { defaultValue: 'Month' })}</th>
            {RESULTS.map((result) => (
              <th key={result} scope="col">
                {String(config[result]?.label ?? result)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <th scope="row">{d.longLabel}</th>
              <td>{d.ate}</td>
              <td>{d.tasted}</td>
              <td>{d.refused}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export default HouseholdChart;
