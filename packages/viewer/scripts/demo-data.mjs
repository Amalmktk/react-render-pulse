// Writes synthetic batches (JSON Lines) for trying the viewer without a real
// site: `node scripts/demo-data.mjs demo.jsonl && node dist/cli.js serve --file demo.jsonl`.
// Two weeks, two app versions (2.4.0 made the orders table slower), and a
// spread of devices where low-memory phones are slower. All numbers are made up.
import { writeFile } from "node:fs/promises";
import { HISTOGRAM_BOUNDS } from "react-render-pulse/core";

const out = process.argv[2] ?? "demo.jsonl";
let seed = 42;
const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = (items) => items[Math.floor(random() * items.length)];
// Log-normal render durations around a median, scaled by device speed.
const duration = (median, spread) =>
  median * Math.exp(spread * Math.sqrt(-2 * Math.log(random() + 1e-9)) * Math.cos(2 * Math.PI * random()));

const AREAS = [
  { id: "orders-table", route: "/orders", median: 9, slowerIn240: 1.6 },
  { id: "filters", route: "/orders", median: 1.5, slowerIn240: 1 },
  { id: "price-chart", route: "/orders/:id", median: 6, slowerIn240: 1 },
  { id: "order-details", route: "/orders/:id", median: 3, slowerIn240: 1 },
  { id: "dashboard", route: "/", median: 4.5, slowerIn240: 1.1 },
];
const DEVICES = [
  { memoryGb: 2, cores: 4, speed: 2.6, weight: 2 },
  { memoryGb: 4, cores: 8, speed: 1.5, weight: 4 },
  { memoryGb: 8, cores: 8, speed: 1, weight: 3 },
  { memoryGb: null, cores: 8, speed: 1.1, weight: 2 },
];
const deviceBag = DEVICES.flatMap((d) => new Array(d.weight).fill(d));
const round = (n) => Math.round(n * 10) / 10;

const now = Date.now();
const lines = [];
for (let day = 13; day >= 0; day--) {
  const version = day > 6 ? "2.3.0" : "2.4.0";
  for (let s = 0; s < 40; s++) {
    const device = pick(deviceBag);
    const sentAt = now - day * 86_400_000 - Math.floor(random() * 80_000_000);
    const areas = AREAS.filter(() => random() > 0.25).map((area) => {
      const renders = 5 + Math.floor(random() * 60);
      const factor = device.speed * (version === "2.4.0" ? area.slowerIn240 : 1);
      const hist = new Array(HISTOGRAM_BOUNDS.length + 1).fill(0);
      const values = Array.from({ length: renders }, () => Math.max(0.1, duration(area.median * factor, 0.6)));
      for (const v of values) {
        const i = HISTOGRAM_BOUNDS.findIndex((b) => v <= b);
        hist[i === -1 ? HISTOGRAM_BOUNDS.length : i]++;
      }
      const sorted = [...values].sort((a, b) => a - b);
      const at = (q) => round(sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]);
      return {
        id: area.id,
        route: area.route,
        renders,
        mounts: 1,
        slow: values.filter((v) => v > 16).length,
        totalMs: round(values.reduce((a, b) => a + b, 0)),
        min: round(sorted[0]),
        max: round(sorted.at(-1)),
        p50: at(0.5),
        p75: at(0.75),
        p95: at(0.95),
        hist,
        worst: [{ ms: round(sorted.at(-1)), phase: "update", at: Math.floor(random() * 60_000) }],
      };
    });
    const longTaskCount = Math.floor(random() * device.speed * 2);
    const payload = {
      v: 1,
      session: {
        id: `demo-${day}-${s}`,
        seq: 1,
        mode: "lightweight",
        route: pick(AREAS).route,
        appVersion: version,
        startedAt: sentAt - 120_000,
        sentAt,
      },
      device: {
        memoryGb: device.memoryGb,
        cores: device.cores,
        connection: pick(["4g", "4g", "4g", "3g"]),
        viewport: pick(["390x844", "412x915", "1440x900"]),
      },
      summary: {
        renders: areas.reduce((a, x) => a + x.renders, 0),
        slowRenders: areas.reduce((a, x) => a + x.slow, 0),
        longTasks: longTaskCount,
        longTaskMs: longTaskCount * 90,
        longFrames: 0,
        longFrameMs: 0,
      },
      areas,
      longTasks:
        longTaskCount > 0
          ? [{ area: "orders-table", route: "/orders", count: longTaskCount, totalMs: longTaskCount * 90, maxMs: 140 }]
          : [],
      longFrames: [],
      dropped: { areas: 0 },
    };
    lines.push(JSON.stringify({ receivedAt: new Date(sentAt).toISOString(), payload }));
  }
}

await writeFile(out, `${lines.join("\n")}\n`);
process.stdout.write(`Wrote ${lines.length} synthetic batches to ${out}\n`);
