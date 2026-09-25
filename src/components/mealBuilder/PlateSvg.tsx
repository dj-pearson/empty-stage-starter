/**
 * The plate as a picture: three wedges (safe food, try bite, food-group
 * filler) with the bridge food sitting on the line between the safe food and
 * the try bite, which is where food chaining puts it.
 *
 * A child who dislikes foods touching gets three separate bowls and a
 * ramekin instead, so the picture matches how the meal will be served.
 *
 * Decorative: the zones below carry every name and choice as text, so the
 * SVG is aria-hidden. Colours are theme tokens only.
 */

import { memo } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { NO_TOUCHING_DISLIKE } from '@/lib/noTouchingDislike';
import { cn } from '@/lib/utils';
import type { Kid } from '@/types';

export interface PlateSvgProps {
  kid: Pick<Kid, 'texture_dislikes'>;
  safeName?: string | null;
  tryBiteName?: string | null;
  gapName?: string | null;
  bridgeName?: string | null;
  className?: string;
}

const C = 100;
const R = 80;

function point(angleDeg: number, radius: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [C + radius * Math.cos(a), C + radius * Math.sin(a)];
}

function wedge(from: number, to: number): string {
  const [x1, y1] = point(from, R);
  const [x2, y2] = point(to, R);
  return `M${C},${C} L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 0 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
}

/** SVG text does not wrap; a long name is cut rather than spilling off the plate. */
function short(name: string | null | undefined, max = 12): string {
  if (!name) return '';
  const trimmed = name.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}...` : trimmed;
}

export function wantsSeparateBowls(kid: Pick<Kid, 'texture_dislikes'>): boolean {
  return (kid.texture_dislikes ?? []).some((d) => d.trim().toLowerCase() === NO_TOUCHING_DISLIKE);
}

// Wedges, in SVG degrees (0 is 3 o'clock, clockwise). Safe sits upper left,
// the try bite upper right, so their shared edge points straight up.
const SAFE_ARC: [number, number] = [150, 270];
const TRY_ARC: [number, number] = [270, 390];
const GAP_ARC: [number, number] = [30, 150];

function PlateSvgImpl({ kid, safeName, tryBiteName, gapName, bridgeName, className }: PlateSvgProps) {
  const reducedMotion = useReducedMotion();
  const motion = reducedMotion ? '' : 'transition-[fill,fill-opacity,opacity] duration-200 ease-out';
  const separate = wantsSeparateBowls(kid);

  const label = (text: string, x: number, y: number, size = 11, tone = 'fill-foreground') =>
    text ? (
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="middle"
        className={cn(tone, 'font-medium', motion)}
        style={{ fontSize: size }}
      >
        {text}
      </text>
    ) : null;

  if (separate) {
    return (
      <svg
        viewBox="0 0 200 200"
        aria-hidden="true"
        focusable="false"
        className={cn('h-auto w-full', className)}
        data-plate-layout="bowls"
      >
        {(
          [
            [58, 62, safeName, 'fill-safe-food/15'],
            [142, 62, tryBiteName, 'fill-try-bite/15'],
            [100, 140, gapName, 'fill-muted'],
          ] as const
        ).map(([x, y, name, fill]) => (
          <g key={`${x}-${y}`}>
            <circle cx={x} cy={y} r={38} className="fill-card stroke-border" strokeWidth={2} />
            <circle cx={x} cy={y} r={30} className={cn(name ? fill : 'fill-muted/40', motion)} />
            {label(short(name, 10), x, y, 10)}
          </g>
        ))}
        <circle cx={166} cy={166} r={18} className="fill-card stroke-border" strokeWidth={2} />
        <circle cx={166} cy={166} r={13} className={cn(bridgeName ? 'fill-accent' : 'fill-muted/40', motion)} />
        {label(short(bridgeName, 6), 166, 166, 7, 'fill-accent-foreground')}
      </svg>
    );
  }

  const [sx, sy] = point((SAFE_ARC[0] + SAFE_ARC[1]) / 2, 46);
  const [tx, ty] = point((TRY_ARC[0] + TRY_ARC[1]) / 2, 46);
  const [gx, gy] = point((GAP_ARC[0] + GAP_ARC[1]) / 2, 46);
  const [bx, by] = point(270, 50);

  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden="true"
      focusable="false"
      className={cn('h-auto w-full', className)}
      data-plate-layout="plate"
    >
      <circle cx={C} cy={C} r={96} className="fill-card stroke-border" strokeWidth={2} />
      <circle cx={C} cy={C} r={R + 4} className="fill-none stroke-border" strokeWidth={1} />
      <path d={wedge(...SAFE_ARC)} className={cn(safeName ? 'fill-safe-food/15' : 'fill-muted/40', 'stroke-border', motion)} />
      <path d={wedge(...TRY_ARC)} className={cn(tryBiteName ? 'fill-try-bite/15' : 'fill-muted/40', 'stroke-border', motion)} />
      <path d={wedge(...GAP_ARC)} className={cn('fill-muted stroke-border', gapName ? 'opacity-100' : 'opacity-60', motion)} />
      {label(short(safeName), sx, sy + 6)}
      {label(short(tryBiteName), tx, ty + 6)}
      {label(short(gapName), gx, gy)}
      {bridgeName ? (
        <g>
          <circle cx={bx} cy={by} r={17} className={cn('fill-accent stroke-border', motion)} strokeWidth={1.5} />
          {label(short(bridgeName, 6), bx, by, 7, 'fill-accent-foreground')}
        </g>
      ) : null}
    </svg>
  );
}

export const PlateSvg = memo(PlateSvgImpl);
