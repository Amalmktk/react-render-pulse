export interface TransportOptions {
  endpoint: string;
  /** Failed sends are retried on later flushes, up to this many attempts in total. */
  maxAttempts: number;
  /** Most failed bodies kept for retry; the oldest are dropped past this. */
  maxQueued: number;
}

export interface Transport {
  /**
   * Sends a serialized payload. With `unloading`, uses `navigator.sendBeacon`
   * (falling back to `fetch` with `keepalive`), since the page may be gone
   * before a normal request finishes. Never throws or rejects.
   */
  send: (body: string, options: { unloading: boolean }) => void;
}

interface QueuedBody {
  body: string;
  attempts: number;
}

export function createTransport(options: TransportOptions): Transport {
  const queue: QueuedBody[] = [];

  function enqueue(item: QueuedBody): void {
    if (item.attempts >= options.maxAttempts) return;
    queue.push(item);
    if (queue.length > options.maxQueued) queue.shift();
  }

  function beacon(body: string): boolean {
    try {
      // A string body is sent as text/plain, a CORS-safelisted type, so
      // cross-origin collectors don't need a preflight the beacon can't do.
      return typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
        ? navigator.sendBeacon(options.endpoint, body)
        : false;
    } catch {
      return false;
    }
  }

  function post(item: QueuedBody): void {
    if (typeof fetch !== "function") return;
    const attempt = { body: item.body, attempts: item.attempts + 1 };

    try {
      fetch(options.endpoint, { method: "POST", body: item.body, keepalive: true })
        .then((response) => {
          // 4xx means the collector rejected the payload; retrying won't help.
          if (response.status >= 500 || response.status === 429) enqueue(attempt);
        })
        .catch(() => enqueue(attempt));
    } catch {
      enqueue(attempt);
    }
  }

  return {
    send(body, { unloading }) {
      const items = [...queue.splice(0), { body, attempts: 0 }];

      for (const item of items) {
        if (unloading && beacon(item.body)) continue;
        post(item);
      }
    },
  };
}
