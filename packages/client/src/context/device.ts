import type { DeviceContext } from "../types.js";

// Non-standard APIs (Chromium only), so they're read defensively.
interface NavigatorWithHints {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { effectiveType?: string };
}

export function getDeviceContext(): DeviceContext {
  const nav = (typeof navigator === "undefined" ? {} : navigator) as NavigatorWithHints;

  return {
    memoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    cores: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
    connection: nav.connection?.effectiveType ?? null,
    viewport: typeof window === "undefined" ? "0x0" : `${window.innerWidth}x${window.innerHeight}`,
  };
}
