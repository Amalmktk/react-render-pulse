import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { niceMax } from "./format";

export interface Point {
  label: string;
  value: number;
  /** Extra tooltip lines, e.g. "1.2K renders". */
  detail: string[];
}

interface ChartProps {
  points: Point[];
  /** Formats values for the axis, labels, and tooltip. */
  format: (value: number) => string;
  /** Accessible description of what's plotted. */
  title: string;
}

const HEIGHT = 220;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 52 };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.floor(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

function YAxis({ max, width, format }: { max: number; width: number; format: (v: number) => string }) {
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);

  return (
    <g>
      {ticks.map((tick) => {
        const y = MARGIN.top + plotHeight - (tick / max) * plotHeight;
        return (
          <g key={tick}>
            <line
              x1={MARGIN.left}
              x2={width - MARGIN.right}
              y1={y}
              y2={y}
              className={tick === 0 ? "axis-baseline" : "axis-grid"}
            />
            <text x={MARGIN.left - 8} y={y} className="axis-label" textAnchor="end" dominantBaseline="middle">
              {format(tick)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Tooltip({
  x,
  y,
  point,
  format,
  width,
}: {
  x: number;
  y: number;
  point: Point;
  format: (v: number) => string;
  width: number;
}) {
  // Flip to the left of the pointer near the right edge so it never overflows.
  const left = x > width - 180 ? x - 172 : x + 12;
  return (
    <div className="tooltip" style={{ left, top: Math.max(0, y - 12) }} role="status">
      <div className="tooltip-value">{format(point.value)}</div>
      <div className="tooltip-label">{point.label}</div>
      {point.detail.map((line) => (
        <div key={line} className="tooltip-detail">
          {line}
        </div>
      ))}
    </div>
  );
}

function ChartFrame({ children, empty }: { children: ReactNode; empty: boolean }) {
  if (empty) return <p className="empty">Not enough data yet.</p>;
  return <>{children}</>;
}

/** One series over time: 2px line, a 10% area wash, an end label, and a crosshair that snaps to the nearest point. */
export function LineChart({ points, format, title }: ChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const max = niceMax(Math.max(...points.map((p) => p.value), 0));
  const x = (i: number) => MARGIN.left + (points.length === 1 ? plotWidth / 2 : (i / (points.length - 1)) * plotWidth);
  const y = (v: number) => MARGIN.top + plotHeight - (v / max) * plotHeight;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(plotWidth / 90))));

  function onPointerMove(event: PointerEvent<SVGRectElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = ((event.clientX - bounds.left) / bounds.width) * (points.length - 1);
    setActive(Math.min(points.length - 1, Math.max(0, Math.round(position))));
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === "ArrowRight") setActive((i) => Math.min(points.length - 1, (i ?? -1) + 1));
    if (event.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? points.length) - 1));
  }

  const activePoint = active === null ? null : points[active];
  const last = points.length - 1;

  return (
    <div ref={ref} className="chart">
      <ChartFrame empty={points.length === 0}>
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={title}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so arrow keys move the crosshair, matching hover; every value is also in the tables.
          tabIndex={0}
          onKeyDown={onKeyDown}
          onFocus={() => setActive((i) => i ?? last)}
          onBlur={() => setActive(null)}
        >
          <YAxis max={max} width={width} format={format} />
          {points.map((p, i) =>
            i % labelEvery === 0 || i === last ? (
              <text key={p.label} x={x(i)} y={HEIGHT - 8} className="axis-label" textAnchor="middle">
                {p.label.slice(5)}
              </text>
            ) : null,
          )}
          <path d={area} className="series-area" />
          <path d={line} className="series-line" />
          {active !== null && activePoint && (
            <>
              <line x1={x(active)} x2={x(active)} y1={MARGIN.top} y2={y(0)} className="crosshair" />
              <circle cx={x(active)} cy={y(activePoint.value)} r={4} className="series-dot" />
            </>
          )}
          {points[last] && (
            <>
              <circle cx={x(last)} cy={y(points[last].value)} r={4} className="series-dot" />
              <text x={x(last) - 8} y={y(points[last].value) - 10} className="value-label" textAnchor="end">
                {format(points[last].value)}
              </text>
            </>
          )}
          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
            onPointerMove={onPointerMove}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
        {active !== null && activePoint && (
          <Tooltip x={x(active)} y={y(activePoint.value)} point={activePoint} format={format} width={width} />
        )}
      </ChartFrame>
    </div>
  );
}

/** One series by category: columns ≤ 24px with a 4px rounded top, value on the cap, and a per-column tooltip. */
export function ColumnChart({ points, format, title }: ChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const max = niceMax(Math.max(...points.map((p) => p.value), 0));
  const band = plotWidth / Math.max(points.length, 1);
  const barWidth = Math.min(24, band - 2);
  const y = (v: number) => MARGIN.top + plotHeight - (v / max) * plotHeight;
  const showValues = band >= 44;
  const activePoint = active === null ? null : points[active];

  return (
    <div ref={ref} className="chart">
      <ChartFrame empty={points.length === 0}>
        <svg width={width} height={HEIGHT} role="img" aria-label={title}>
          <YAxis max={max} width={width} format={format} />
          {points.map((p, i) => {
            const cx = MARGIN.left + band * i + band / 2;
            const top = y(p.value);
            const h = Math.max(0, y(0) - top);
            const r = Math.min(4, h, barWidth / 2);
            // Rounded data-end, square at the baseline.
            const path = `M${cx - barWidth / 2},${y(0)} V${top + r} Q${cx - barWidth / 2},${top} ${cx - barWidth / 2 + r},${top} H${cx + barWidth / 2 - r} Q${cx + barWidth / 2},${top} ${cx + barWidth / 2},${top + r} V${y(0)} Z`;
            return (
              // biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: each column is an image of one value ("2.4.0: 12.4 ms"); it's focusable only so keyboard users get the hover tooltip. Values are also in the tables.
              <g
                key={p.label}
                tabIndex={0}
                role="img"
                aria-label={`${p.label}: ${format(p.value)}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className={active === i ? "column active" : "column"}
              >
                {/* The hit target is the whole band, not just the painted column. */}
                <rect x={cx - band / 2} y={MARGIN.top} width={band} height={plotHeight} fill="transparent" />
                <path d={path} className="series-fill" />
                {showValues && (
                  <text x={cx} y={top - 6} className="value-label" textAnchor="middle">
                    {format(p.value)}
                  </text>
                )}
                <text x={cx} y={HEIGHT - 8} className="axis-label" textAnchor="middle">
                  {p.label.length > 10 ? `${p.label.slice(0, 9)}…` : p.label}
                </text>
              </g>
            );
          })}
        </svg>
        {active !== null && activePoint && (
          <Tooltip
            x={MARGIN.left + band * active + band / 2}
            y={y(activePoint.value)}
            point={activePoint}
            format={format}
            width={width}
          />
        )}
      </ChartFrame>
    </div>
  );
}
