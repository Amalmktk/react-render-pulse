let debug = false;

export function setDebug(value: boolean): void {
  debug = value;
}

/**
 * Runs `fn`, swallowing anything it throws, so an error inside render-pulse
 * (or a user-supplied exporter or `getRoute`) never reaches the app. With
 * `debug`, the error is logged instead of silently dropped.
 */
export function guard<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (error) {
    if (debug && typeof console !== "undefined") console.warn("[render-pulse]", error);
    return fallback;
  }
}
