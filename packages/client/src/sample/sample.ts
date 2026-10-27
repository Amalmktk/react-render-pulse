/**
 * Decides once per session whether to collect, so unsampled sessions pay
 * almost nothing. `sampleRate` is clamped to 0–1.
 */
export function shouldSample(sampleRate: number, random: () => number = Math.random): boolean {
  if (!(sampleRate > 0)) return false;
  if (sampleRate >= 1) return true;
  return random() < sampleRate;
}

/** A random session id. Not derived from anything about the user, and never persisted. */
export function createSessionId(): string {
  try {
    // randomUUID only exists in secure contexts (HTTPS, localhost).
    const cryptoApi = globalThis.crypto as Crypto | undefined;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
  } catch {
    // Fall through to the non-crypto id.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
