import type { Payload } from "../types.js";

export function byteLength(text: string): number {
  return typeof TextEncoder === "undefined" ? text.length * 3 : new TextEncoder().encode(text).length;
}

/**
 * Serializes a payload, shrinking it until it fits in `maxBytes`: first the
 * worst-case lists go, then the areas with the fewest renders. Returns `null`
 * when even an empty payload doesn't fit.
 */
export function serializePayload(payload: Payload, maxBytes: number): string | null {
  let json = JSON.stringify(payload);
  if (byteLength(json) <= maxBytes) return json;

  let trimmed: Payload = { ...payload, areas: payload.areas.map((a) => ({ ...a, worst: [] })) };
  json = JSON.stringify(trimmed);

  if (byteLength(json) > maxBytes) {
    const areas = [...trimmed.areas].sort((a, b) => b.renders - a.renders);
    let dropped = trimmed.dropped.areas;

    // Halve the kept areas until it fits, then the list is short enough to stop.
    while (areas.length > 0 && byteLength(json) > maxBytes) {
      const remove = Math.max(1, Math.floor(areas.length / 2));
      areas.splice(areas.length - remove, remove);
      dropped += remove;
      trimmed = { ...trimmed, areas: [...areas], dropped: { areas: dropped } };
      json = JSON.stringify(trimmed);
    }
  }

  return byteLength(json) <= maxBytes ? json : null;
}
