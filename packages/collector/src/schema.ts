import { HISTOGRAM_BOUNDS, type Payload } from "react-render-pulse/core";
import { z } from "zod";

// Bounds on every string and list, so a hostile client can't make the
// collector store unbounded data even inside the body size limit.
const id = z.string().min(1).max(200);
const route = z.string().max(500);
const ms = z.number().finite().min(0).max(3_600_000);
const count = z.number().int().min(0).max(100_000_000);
const phase = z.enum(["mount", "update", "nested-update"]);
const mode = z.enum(["profiling", "lightweight"]);

const longTaskReport = z.strictObject({
  area: id.nullable(),
  route,
  count,
  totalMs: z.number().finite().min(0),
  maxMs: ms,
});

export const payloadV1Schema = z.strictObject({
  v: z.literal(1),
  session: z.strictObject({
    id: z.string().min(1).max(64),
    seq: count,
    mode,
    route,
    appVersion: z.string().max(100).nullable(),
    startedAt: z.number().int().min(0),
    sentAt: z.number().int().min(0),
  }),
  device: z.strictObject({
    memoryGb: z.number().finite().min(0).max(1024).nullable(),
    cores: z.number().int().min(0).max(1024).nullable(),
    connection: z.string().max(20).nullable(),
    viewport: z.string().regex(/^\d{1,5}x\d{1,5}$/),
  }),
  summary: z.strictObject({
    renders: count,
    slowRenders: count,
    longTasks: count,
    longTaskMs: z.number().finite().min(0),
    longFrames: count,
    longFrameMs: z.number().finite().min(0),
  }),
  areas: z
    .array(
      z.strictObject({
        id,
        route,
        renders: count,
        mounts: count,
        slow: count,
        totalMs: z.number().finite().min(0),
        min: ms,
        max: ms,
        p50: ms,
        p75: ms,
        p95: ms,
        hist: z.array(count).length(HISTOGRAM_BOUNDS.length + 1),
        worst: z.array(z.strictObject({ ms, phase, at: z.number().finite().min(0) })).max(50),
      }),
    )
    .max(1000),
  longTasks: z.array(longTaskReport).max(1000),
  longFrames: z.array(longTaskReport).max(1000),
  dropped: z.strictObject({ areas: count }),
});

/**
 * Every payload version the collector accepts: the current one and, once
 * there is one, the previous one, so clients that haven't updated yet keep
 * reporting during a rollout.
 */
export const payloadSchema = z.discriminatedUnion("v", [payloadV1Schema]);

export type ValidatedPayload = z.infer<typeof payloadSchema>;

/** Compile-time check that the schema and the client's `Payload` type describe the same shape. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const schemaMatchesClient: Same<ValidatedPayload, Payload> = true;
void schemaMatchesClient;
