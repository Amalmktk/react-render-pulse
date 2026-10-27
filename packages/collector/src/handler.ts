import { createRateLimiter, type RateLimitOptions } from "./rateLimit.js";
import { payloadSchema } from "./schema.js";
import type { Storage } from "./storage/types.js";

export interface CollectorOptions {
  storage: Storage;
  /** Largest accepted body in bytes. Defaults to 65536 (the client sends at most 60000 by default). */
  maxBodyBytes?: number | undefined;
  /** Per-client request limit, or `false` to turn it off. Defaults to 120 requests a minute. */
  rateLimit?: RateLimitOptions | false | undefined;
  /**
   * The key requests are rate limited by. Defaults to the client IP from
   * standard proxy headers. It's only held in memory for the rate-limit
   * window and never stored. Return `null` to skip limiting a request.
   */
  getClientKey?: ((request: Request) => string | null) | undefined;
  /**
   * Origins allowed to send batches. Defaults to `"*"` (requests carry no
   * credentials). With a list, browser requests from other origins get a 403,
   * not just a missing CORS header: beacons are sent as text/plain without a
   * preflight, so CORS alone wouldn't stop them being stored. Requests with no
   * `Origin` header (server-side senders) are allowed.
   */
  allowedOrigins?: string[] | "*" | undefined;
  /** Called with storage errors and other failures, e.g. to log them. */
  onError?: ((error: unknown) => void) | undefined;
}

/** A standard `Request` → `Response` handler, deployable on Vercel, Netlify, Cloudflare, Deno, Bun, or Node 18+. */
export type CollectorHandler = (request: Request) => Promise<Response>;

/**
 * Creates the collector endpoint: it accepts `POST`ed batches from
 * `initRenderPulse`, validates them, and writes them to `storage`.
 *
 * Responses: 204 stored · 400 invalid · 403 origin not allowed · 405 wrong method · 413 too large ·
 * 429 rate limited · 500 storage failed. The client retries only 429 and 5xx.
 */
export function createCollector(options: CollectorOptions): CollectorHandler {
  const {
    storage,
    maxBodyBytes = 65_536,
    rateLimit,
    getClientKey = defaultClientKey,
    allowedOrigins = "*",
    onError,
  } = options;
  const limiter = rateLimit === false ? null : createRateLimiter(rateLimit ?? {});

  function corsHeaders(request: Request): Record<string, string> {
    const origin = request.headers.get("origin");
    if (allowedOrigins === "*") return { "access-control-allow-origin": "*" };
    if (origin && allowedOrigins.includes(origin)) return { "access-control-allow-origin": origin, vary: "Origin" };
    return {};
  }

  function respond(request: Request, status: number, body?: unknown, headers: Record<string, string> = {}): Response {
    const allHeaders = { ...corsHeaders(request), ...headers };
    if (body === undefined) return new Response(null, { status, headers: allHeaders });
    return Response.json(body, { status, headers: allHeaders });
  }

  return async (request) => {
    if (request.method === "OPTIONS") {
      return respond(request, 204, undefined, {
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      });
    }
    if (request.method !== "POST")
      return respond(request, 405, { error: "Method not allowed" }, { allow: "POST, OPTIONS" });

    const origin = request.headers.get("origin");
    if (allowedOrigins !== "*" && origin && !allowedOrigins.includes(origin)) {
      return respond(request, 403, { error: "Origin not allowed" });
    }

    if (limiter) {
      const key = getClientKey(request);
      const retryAfter = key === null ? 0 : limiter.hit(key);
      if (retryAfter > 0) {
        return respond(request, 429, { error: "Too many requests" }, { "retry-after": String(retryAfter) });
      }
    }

    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > maxBodyBytes) return respond(request, 413, { error: "Payload too large" });

    let text: string | null;
    try {
      text = await readLimited(request, maxBodyBytes);
    } catch {
      return respond(request, 400, { error: "Unreadable body" });
    }
    if (text === null) return respond(request, 413, { error: "Payload too large" });

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return respond(request, 400, { error: "Invalid JSON" });
    }

    const result = payloadSchema.safeParse(json);
    if (!result.success) {
      return respond(request, 400, {
        error: "Invalid payload",
        issues: result.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }

    try {
      await storage.write({ receivedAt: new Date().toISOString(), payload: result.data });
    } catch (error) {
      onError?.(error);
      return respond(request, 500, { error: "Storage failed" });
    }

    return respond(request, 204);
  };
}

/** Reads the body as text, or returns `null` as soon as it exceeds `maxBytes` (content-length can be missing or wrong). */
async function readLimited(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function defaultClientKey(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || null;
}
