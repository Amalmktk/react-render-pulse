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
    window.history.replaceState(null, "", "/users/12345/profile?email=jane%40example.com#token=abc");
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

    for (const secret of ["Jane", "secret-password", "jane", "example.com", "12345", "token", "abc"]) {
      expect(json).not.toContain(secret);
    }
    expect(JSON.parse(json).session.route).toBe("/users/:id/profile");
  });
});
