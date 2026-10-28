import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RenderMonitor } from "../src/components/RenderMonitor.js";
import { initRenderPulse, type RenderPulse } from "../src/runtime/initRenderPulse.js";

let pulse: RenderPulse | null = null;

afterEach(() => {
  cleanup();
  pulse?.destroy();
  pulse = null;
  window.history.replaceState(null, "", "/");
});

describe("privacy", () => {
  it("never includes page text, input values, query strings, or identifiers", async () => {
    // Secrets must be strings that can't appear by chance: the payload has a
    // random hex session id and numeric timestamps, so "abc" or "12345" would
    // sometimes show up in them and make this test flaky.
    window.history.replaceState(null, "", "/users/48151623/profile?email=jane%40example.com#token=PRIVATE-TOKEN-xyz");
    pulse = initRenderPulse({ debug: false, flushIntervalMs: 0 });

    render(
      <RenderMonitor id="profile-form">
        <h1>Jane Doe</h1>
        <input defaultValue="secret-password" aria-label="password" />
        <p>jane@example.com</p>
      </RenderMonitor>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    const json = JSON.stringify(pulse.flush());

    for (const secret of [
      "Jane",
      "secret-password",
      "jane",
      "example.com",
      "email=",
      "PRIVATE-TOKEN",
      "token=",
      "/users/48151623",
    ]) {
      expect(json).not.toContain(secret);
    }
    // The numeric user id is replaced in every route the payload carries.
    const payload = JSON.parse(json);
    expect(payload.session.route).toBe("/users/:id/profile");
    expect(payload.areas.map((a: { route: string }) => a.route)).toEqual(["/users/:id/profile"]);
  });
});
