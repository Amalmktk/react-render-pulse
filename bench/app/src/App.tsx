import { memo, Profiler, useLayoutEffect, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { RenderMonitor, useRenderMonitor } from "react-render-pulse";
import { isKnownSlowEnabled, registerControls } from "./bench";

/**
 * A realistic mix (a large table, a chart, a form) plus components with
 * known, controlled slowness for the accuracy check. Every update re-renders
 * the whole tree except the memoized rows, like a typical unoptimized page.
 */

/** Components with known render cost, in milliseconds of wall-clock time. */
export const KNOWN_SLOW = { "known-2ms": 2, "known-8ms": 8, "known-20ms": 20 } as const;

function spin(ms: number): void {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // busy-wait
  }
}

export function App() {
  const [tick, setTick] = useState(0);
  const [monitored, setMonitored] = useState(false);

  useLayoutEffect(() => {
    registerControls({
      update: (next) => flushSync(() => setTick(next)),
      setMonitored: (next) => flushSync(() => setMonitored(next)),
    });
  }, []);

  // Unmonitored, the tree has no render-pulse components at all, so the
  // difference between the two is exactly render-pulse's cost.
  const Area = monitored ? (BARE ? BareProfiler : RenderMonitor) : PassThrough;

  return (
    <Area id="page">
      <h1>Bench · update {tick}</h1>
      <Area id="form">
        <Form tick={tick} />
      </Area>
      <Area id="chart">
        <Chart tick={tick} />
      </Area>
      <Area id="table">
        <Table tick={tick} />
      </Area>
      {Object.entries(KNOWN_SLOW).map(([id, ms]) => (
        <Area key={id} id={id}>
          <Slow ms={ms} tick={tick} />
        </Area>
      ))}
      {monitored ? <HookedCounter tick={tick} /> : <Counter tick={tick} />}
    </Area>
  );
}

function PassThrough({ children }: { id: string; children?: ReactNode }) {
  return <>{children}</>;
}

/** Diagnostic (`?bare=1`): only React's <Profiler>, no render-pulse, to separate React's profiling cost from render-pulse's. */
function BareProfiler({ id, children }: { id: string; children?: ReactNode }) {
  return (
    <Profiler id={id} onRender={noop}>
      {children}
    </Profiler>
  );
}

function noop(): void {}

const BARE = typeof location !== "undefined" && new URLSearchParams(location.search).get("bare") === "1";

function Slow({ ms, tick }: { ms: number; tick: number }) {
  if (isKnownSlowEnabled()) spin(ms);
  return (
    <p>
      slow {ms} ms · {tick}
    </p>
  );
}

function Form({ tick }: { tick: number }) {
  return (
    <form>
      {Array.from({ length: 30 }, (_, i) => (
        <label key={i} style={{ display: "inline-block", margin: 2 }}>
          Field {i}
          <input readOnly value={`${tick}-${i}`} />
        </label>
      ))}
    </form>
  );
}

function Chart({ tick }: { tick: number }) {
  return (
    <svg width={600} height={100} role="img" aria-label="chart">
      {Array.from({ length: 300 }, (_, i) => {
        const h = ((i * 31 + tick * 7) % 100) + 1;
        return <rect key={i} x={i * 2} y={100 - h} width={1.5} height={h} fill="#2a78d6" />;
      })}
    </svg>
  );
}

const ROWS = Array.from({ length: 800 }, (_, i) => ({ id: i, name: `Row ${i}`, value: (i * 7919) % 1000 }));

function Table({ tick }: { tick: number }) {
  return (
    <table>
      <tbody>
        {ROWS.map((row) => (
          <Row key={row.id} row={row} highlighted={row.id === tick % ROWS.length} />
        ))}
      </tbody>
    </table>
  );
}

const Row = memo(function Row({ row, highlighted }: { row: (typeof ROWS)[number]; highlighted: boolean }) {
  return (
    <tr style={highlighted ? { background: "#ffd" } : undefined}>
      <td>{row.name}</td>
      <td>{row.value}</td>
    </tr>
  );
});

function Counter({ tick }: { tick: number }) {
  return <output>{tick}</output>;
}

function HookedCounter({ tick }: { tick: number }) {
  useRenderMonitor("counter");
  return <output>{tick}</output>;
}
