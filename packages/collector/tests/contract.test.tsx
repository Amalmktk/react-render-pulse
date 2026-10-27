// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { initRenderPulse, RenderMonitor, useRenderMonitor } from "react-render-pulse";
import { afterEach, describe, expect, it } from "vitest";
import { createCollector } from "../src/handler.js";
import { payloadSchema } from "../src/schema.js";
import { memoryStorage } from "../src/storage/memory.js";
import { post } from "./fixtures.js";

// The real client builds a payload, and the collector must accept it as is.
// This guards the contract between the two packages.

afterEach(() => cleanup());

function Chart() {
  useRenderMonitor("price-chart");
  return <svg aria-label="chart" />;
}

describe("client → collector contract", () => {
  it("accepts the payload the client actually sends", async () => {
    const pulse = initRenderPulse({ debug: false, appVersion: "1.0.0", flushIntervalMs: 0 });

    render(
      <RenderMonitor id="orders-page">
        <RenderMonitor id="orders-table">
          <table />
        </RenderMonitor>
        <Chart />
      </RenderMonitor>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    const payload = pulse.flush();
    pulse.destroy();

    expect(payload?.areas.map((a) => a.id).sort()).toEqual(["orders-page", "orders-table", "price-chart"]);
    expect(payloadSchema.safeParse(payload).success).toBe(true);

    const storage = memoryStorage();
    const response = await createCollector({ storage })(post(payload));
    expect(response.status).toBe(204);
    expect(storage.batches[0]?.payload).toEqual(payload);
  });
});
