import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type { StoredBatch } from "react-render-pulse-collector";
import { PORTS } from "../playwright.config";

type Build = keyof typeof PORTS;

function base(build: Build): string {
  return `http://localhost:${PORTS[build]}`;
}

/** Batches the example's collector stored for this test's unique app version. */
async function batchesFor(page: Page, build: Build, version: string): Promise<StoredBatch[]> {
  const response = await page.request.get(`${base(build)}/__render-pulse/batches?appVersion=${version}`);
  return (await response.json()) as StoredBatch[];
}

/** Types into the search box and changes the status filter: a few real re-renders of every area. */
async function interact(page: Page): Promise<void> {
  await page.getByLabel("Search customers").fill("");
  await page.getByLabel("Search customers").pressSequentially("Customer 4", { delay: 20 });
  await page.getByLabel("Status").selectOption("shipped");
  await page.getByLabel("Status").selectOption("all");
  await expect(page.locator("tbody tr").first()).toBeVisible();
}

/** Navigating away fires `pagehide`, which sends the batch with sendBeacon. */
async function leave(page: Page): Promise<void> {
  await page.goto("about:blank");
}

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

for (const build of ["lightweight", "profiling"] as const) {
  test(`${build} build: collects areas and delivers them on page hide`, async ({ page }) => {
    const version = randomUUID();
    const errors = trackErrors(page);

    await page.goto(`${base(build)}/?version=${version}`);
    await interact(page);
    await leave(page);

    await expect
      .poll(async () => (await batchesFor(page, build, version)).length, { timeout: 30_000 })
      .toBeGreaterThan(0);
    const [batch] = await batchesFor(page, build, version);
    const payload = batch!.payload;

    expect(payload.session.mode).toBe(build);
    expect(payload.session.appVersion).toBe(version);
    expect(payload.areas.map((a) => a.id).sort()).toEqual(["orders-page", "orders-table", "price-chart"]);

    const table = payload.areas.find((a) => a.id === "orders-table");
    expect(table?.renders).toBeGreaterThanOrEqual(2);
    expect(table?.mounts).toBe(1);
    expect(table?.p95).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}

test("never sends what the user typed or page text", async ({ page }) => {
  const version = randomUUID();
  await page.goto(`${base("lightweight")}/?version=${version}`);
  await page.getByLabel("Search customers").pressSequentially("Customer 4", { delay: 20 });
  await leave(page);

  await expect
    .poll(async () => (await batchesFor(page, "lightweight", version)).length, { timeout: 30_000 })
    .toBeGreaterThan(0);
  const json = JSON.stringify(await batchesFor(page, "lightweight", version));
  expect(json).not.toContain("Customer");
  expect(json).not.toContain("shipped");
});

test("the app keeps working when the endpoint is down", async ({ page }) => {
  const errors = trackErrors(page);
  await page.route("**/api/render-pulse", (route) => route.fulfill({ status: 503 }));

  await page.goto(`${base("lightweight")}/?version=${randomUUID()}`);
  await interact(page);
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await interact(page);

  expect(errors).toEqual([]);
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
});

test("the app keeps working when the network blocks the endpoint", async ({ page }) => {
  const errors = trackErrors(page);
  await page.route("**/api/render-pulse", (route) => route.abort("connectionrefused"));

  await page.goto(`${base("lightweight")}/?version=${randomUUID()}`);
  await interact(page);
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await interact(page);

  expect(errors).toEqual([]);
});

test("a slow network doesn't block the app or lose the batch", async ({ page }) => {
  const version = randomUUID();
  await page.route("**/api/render-pulse", async (route) => {
    // Much longer than the interaction below may take, even on a loaded CI machine.
    await new Promise((resolve) => setTimeout(resolve, 6_000));
    await route.continue();
  });

  await page.goto(`${base("lightweight")}/?version=${version}`);
  await interact(page);

  // Flush while the page stays open, then keep using it during the slow request.
  const started = Date.now();
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.getByLabel("Status").selectOption("open");
  await expect(page.locator("tbody tr").first()).toContainText("open");
  // The app updated while the request was still held, so sending didn't block it.
  expect(Date.now() - started).toBeLessThan(6_000);

  await expect
    .poll(async () => (await batchesFor(page, "lightweight", version)).length, { timeout: 30_000 })
    .toBeGreaterThan(0);
});

test("unsampled sessions send nothing", async ({ page }) => {
  const version = randomUUID();
  let sent = 0;
  await page.route("**/api/render-pulse", (route) => {
    sent++;
    return route.continue();
  });

  await page.goto(`${base("lightweight")}/?version=${version}&sampleRate=0`);
  await interact(page);
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.waitForTimeout(500);

  expect(sent).toBe(0);
  expect(await batchesFor(page, "lightweight", version)).toEqual([]);
});
