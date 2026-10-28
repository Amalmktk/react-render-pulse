// Overhead and accuracy benchmark. Usage: `pnpm bench` (builds first), or
// `node run.mjs [--check] [--pages 3] [--blocks 20] [--updates 40] [--cpu 4]` on existing builds.
//
// Overhead is measured inside one page: the app switches between a monitored
// tree and the identical tree without render-pulse, in alternating blocks
// (A B, B A, ...). Comparing separate page loads was tried first and was
// useless: page-to-page variance (3.9-15.9 ms per update for the same build)
// dwarfed the effect. Each block is timed as a whole (browsers coarsen
// performance.now() to 0.1 ms) and paired with the neighboring block of the
// other arm; the reported overhead is the median of those paired
// differences, with its interquartile range as the noise band.
//
// Accuracy: components with known render cost must be ranked correctly and
// reported within tolerance, in both modes.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";

const { values: args } = parseArgs({
  // `pnpm bench -- --check` forwards the "--" on Linux and macOS (PowerShell drops it), so ignore it.
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    check: { type: "boolean", default: false },
    pages: { type: "string", default: "3" },
    blocks: { type: "string", default: "30" },
    updates: { type: "string", default: "60" },
    // Unthrottled by default: with CDP CPU throttling, the same build's baseline
    // swung 6-11 ms per update between identical runs, wider than the effect.
    // Pass --cpu 4 on a quiet machine to see slow-device numbers.
    cpu: { type: "string", default: "1" },
  },
});

const PAGES = Number(args.pages);
const BLOCKS = Number(args.blocks);
const UPDATES = Number(args.updates);
const CPU_THROTTLE = Number(args.cpu);
/** Areas measured per update: 7 <RenderMonitor>s (page, form, chart, table, 3 known-slow) + 1 useRenderMonitor. */
const MEASURED_PER_UPDATE = 8;
const KNOWN = { "known-2ms": 2, "known-8ms": 8, "known-20ms": 20 };
const BUILDS = { lightweight: "plain", profiling: "profiling" };

const here = fileURLToPath(new URL(".", import.meta.url));
const budget = JSON.parse(await readFile(join(here, "..", "budget.json"), "utf8"));

function serve(dir) {
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    try {
      const file = join(dir, path === "/" ? "index.html" : path);
      res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

const sorted = (xs) => [...xs].sort((a, b) => a - b);
const quantile = (xs, q) => {
  const s = sorted(xs);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
};
const median = (xs) => quantile(xs, 0.5);
const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;

async function openPage(browser, url) {
  const page = await browser.newPage();
  if (CPU_THROTTLE > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });
  }
  await page.goto(url);
  await page.waitForFunction(() => window.__bench !== undefined);
  return page;
}

async function measureOverhead(browser, url) {
  const baselineBlocks = [];
  const diffs = [];

  for (let p = 0; p < PAGES; p++) {
    const page = await openPage(browser, url);
    const run = (monitored) => page.evaluate(([n, m]) => window.__bench.run(n, { monitored: m }), [UPDATES, monitored]);

    await run(false); // warm-up: JIT, first-render caches, both trees
    await run(true);

    for (let b = 0; b < BLOCKS; b++) {
      // Alternate which arm goes first, so a drift within a pair cancels out.
      const first = b % 2 === 0;
      const a = await run(!first);
      const c = await run(first);
      const [off, on] = first ? [a, c] : [c, a];
      baselineBlocks.push(off);
      diffs.push(on - off);
    }
    await page.close();
  }

  const baseline = median(baselineBlocks);
  const added = median(diffs);
  return {
    baselineMsPerUpdate: r2(baseline),
    addedMsPerUpdate: r3(added),
    addedMsIqr: [r3(quantile(diffs, 0.25)), r3(quantile(diffs, 0.75))],
    addedPercent: r2((added / baseline) * 100),
    addedMsPerMeasuredRender: r3(added / MEASURED_PER_UPDATE),
    pairs: diffs.length,
  };
}

async function measureAccuracy(browser, url, expectedMode) {
  const page = await openPage(browser, url);
  await page.evaluate(() => window.__bench.run(5, { monitored: true }));
  await page.evaluate(() => window.__bench.collect()); // discard the mount and warm-up
  await page.evaluate(() => window.__bench.run(30, { monitored: true, knownSlow: true }));
  const payload = await page.evaluate(() => window.__bench.collect());
  const mode = await page.evaluate(() => window.__bench.mode());
  await page.close();

  const areas = Object.fromEntries(payload.areas.map((a) => [a.id, a]));
  const rows = Object.entries(KNOWN).map(([id, expected]) => {
    const p50 = areas[id]?.p50 ?? null;
    const tolerance = 1.5 + expected * 0.25;
    return { id, expectedMs: expected, p50, withinTolerance: p50 !== null && Math.abs(p50 - expected) <= tolerance };
  });
  const ranking = Object.keys(KNOWN).sort((a, b) => (areas[b]?.p50 ?? 0) - (areas[a]?.p50 ?? 0));

  return {
    mode,
    modeCorrect: mode === expectedMode,
    rows,
    rankingCorrect: ranking.join() === "known-20ms,known-8ms,known-2ms",
  };
}

const browser = await chromium.launch();
const servers = [];
const results = {
  environment: {
    browser: `chromium ${browser.version()}`,
    cpuThrottle: CPU_THROTTLE,
    pages: PAGES,
    blocksPerPage: BLOCKS,
    updatesPerBlock: UPDATES,
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    date: new Date().toISOString(),
  },
  overhead: {},
  accuracy: {},
};

try {
  for (const [mode, build] of Object.entries(BUILDS)) {
    const server = await serve(join(here, "dist", build));
    servers.push(server);
    const url = `http://127.0.0.1:${server.address().port}/`;

    process.stdout.write(`${mode}: measuring overhead…\n`);
    results.overhead[mode] = await measureOverhead(browser, url);
    if (mode === "profiling") {
      // The same areas wrapped in a bare <Profiler> with a no-op callback:
      // React's own cost of profiling them, which profiling mode can't avoid.
      process.stdout.write("profiling: measuring a bare <Profiler> for comparison…\n");
      results.overhead.bareProfiler = await measureOverhead(browser, `${url}?bare=1`);
    }
    process.stdout.write(`${mode}: checking accuracy…\n`);
    results.accuracy[mode] = await measureAccuracy(browser, url, mode);
  }

  const failures = [];
  for (const mode of Object.keys(BUILDS)) {
    const o = results.overhead[mode];
    const b = budget[mode];
    if (o.addedPercent > b.maxAddedPercent)
      failures.push(`${mode}: +${o.addedPercent}% > ${b.maxAddedPercent}% budget`);
    if (o.addedMsPerMeasuredRender > b.maxAddedMsPerMeasuredRender) {
      failures.push(
        `${mode}: +${o.addedMsPerMeasuredRender} ms per render > ${b.maxAddedMsPerMeasuredRender} ms budget`,
      );
    }
    const a = results.accuracy[mode];
    if (!a.modeCorrect) failures.push(`${mode}: ran in ${a.mode} mode`);
    if (!a.rankingCorrect) failures.push(`${mode}: known-slow components ranked wrongly`);
    for (const row of a.rows) {
      if (!row.withinTolerance) failures.push(`${mode}: ${row.id} p50 ${row.p50} ms, expected ~${row.expectedMs} ms`);
    }
  }
  results.budget = budget;
  results.passed = failures.length === 0;
  results.failures = failures;

  await mkdir(join(here, "..", "results"), { recursive: true });
  await writeFile(join(here, "..", "results", "latest.json"), `${JSON.stringify(results, null, 2)}\n`);
  process.stdout.write(`\n${toMarkdown(results)}\n`);

  if (failures.length > 0) {
    process.stdout.write(`\nBudget or accuracy check failed:\n- ${failures.join("\n- ")}\n`);
    if (args.check) process.exitCode = 1;
  } else {
    process.stdout.write("\nWithin budget; accuracy check passed.\n");
  }
} finally {
  await browser.close();
  for (const server of servers) server.close();
}

function toMarkdown(r) {
  const e = r.environment;
  const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
  const row = (label, o) =>
    `| ${label} | ${o.baselineMsPerUpdate} ms | ${sign(o.addedMsPerUpdate)} ms (${sign(o.addedPercent)}%) | ${o.addedMsIqr[0]} to ${o.addedMsIqr[1]} ms | ${o.addedMsPerMeasuredRender} ms |`;
  const acc = (mode) =>
    r.accuracy[mode].rows.map((x) => `${x.id} → ${x.p50} ms`).join(", ") +
    (r.accuracy[mode].rankingCorrect ? " (ranked correctly)" : " (ranking WRONG)");
  return [
    `${e.browser}, ${e.cpuThrottle > 1 ? `${e.cpuThrottle}× CPU throttling` : "no CPU throttling"}, ${e.pages} pages × ${e.blocksPerPage} paired blocks × ${e.updatesPerBlock} full-app updates.`,
    "",
    "| Mode | Update without render-pulse | Added per update (median) | Added, middle 50% of pairs | Added per measured render |",
    "|---|---|---|---|---|",
    row("Lightweight (production build)", r.overhead.lightweight),
    row("Profiling (profiling build)", r.overhead.profiling),
    row("For comparison: bare React <Profiler> (profiling build)", r.overhead.bareProfiler),
    "",
    `Accuracy, lightweight: ${acc("lightweight")}`,
    `Accuracy, profiling: ${acc("profiling")}`,
  ].join("\n");
}
