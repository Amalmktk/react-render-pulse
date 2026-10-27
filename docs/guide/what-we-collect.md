# What we collect

The client sends one JSON payload per batch. This page lists every field. The collector validates payloads against exactly this shape and rejects anything else.

## Privacy guarantees

- **No user identifiers.** No user IDs, account IDs, emails, cookies, or local storage values. The client reads none of them.
- **No IP addresses in stored data.** The collector uses the client IP only to rate limit, keeps it in memory for the length of the rate-limit window, and never writes it to storage.
- **No page content.** No text, no input values, no element names, no props or state. Areas are identified only by the id strings you choose.
- **No query strings or hashes.** Routes come from `location.pathname` (or your `getRoute`), never from `location.search` or `location.hash`.
- **The session id can't follow a user.** It's random per page load (`crypto.randomUUID()` where available), is never stored on the device, and isn't derived from anything about the user. Reloading the page starts a new session.
- **Unknown fields are rejected.** Every object in the collector's schema is strict: a payload with a field that isn't listed here gets a 400 response and isn't stored. This stops a modified client from smuggling extra data into your database.

What you control:

- **Area ids** are strings you write. Keep them fixed (`"orders-table"`), not built from data.
- **Routes**: the default `getRoute` replaces numeric segments with `:id`, but other dynamic segments (usernames, slugs, emails in paths) pass through. If your paths can contain personal data, pass a `getRoute` that returns route templates. See [Route grouping](/guide/choosing-areas#route-grouping).
- **`appVersion`** is whatever string you pass.

## Example

```json
{
  "v": 1,
  "session": {
    "id": "6f1c2a7e-4b8d-4f7e-9a51-2d3c8b0e7f14",
    "seq": 1,
    "mode": "lightweight",
    "route": "/orders/:id",
    "appVersion": "2.4.0",
    "startedAt": 1761552000000,
    "sentAt": 1761552184000
  },
  "device": { "memoryGb": 4, "cores": 8, "connection": "4g", "viewport": "390x844" },
  "summary": {
    "renders": 42,
    "slowRenders": 5,
    "longTasks": 2,
    "longTaskMs": 263.4,
    "longFrames": 1,
    "longFrameMs": 212
  },
  "areas": [
    {
      "id": "orders-table",
      "route": "/orders/:id",
      "renders": 42,
      "mounts": 1,
      "slow": 5,
      "totalMs": 391.6,
      "min": 0.6,
      "max": 61.2,
      "p50": 5.7,
      "p75": 10.8,
      "p95": 32.1,
      "hist": [3, 4, 9, 12, 5, 4, 2, 1, 1, 1, 0, 0, 0, 0, 0, 0],
      "worst": [{ "ms": 61.2, "phase": "mount", "at": 412 }, { "ms": 38.9, "phase": "update", "at": 9120 }]
    }
  ],
  "longTasks": [{ "area": "orders-table", "route": "/orders/:id", "count": 2, "totalMs": 263.4, "maxMs": 212 }],
  "longFrames": [{ "area": "orders-table", "route": "/orders/:id", "count": 1, "totalMs": 212, "maxMs": 212 }],
  "dropped": { "areas": 0 }
}
```

All durations are in milliseconds, rounded to 0.1 ms.

## Fields

### Top level

| Field           | Type   | Description                                                       |
| --------------- | ------ | ----------------------------------------------------------------- |
| `v`             | `1`    | Payload version.                                                  |
| `session`       | object | About this page load and batch.                                   |
| `device`        | object | Coarse device details.                                            |
| `summary`       | object | Totals for the batch.                                             |
| `areas`         | array  | Render timings per area and route.                                |
| `longTasks`     | array  | Long tasks per area and route.                                    |
| `longFrames`    | array  | Long animation frames per area and route.                         |
| `dropped.areas` | number | Area entries left out to respect `maxAreas` or `maxPayloadBytes`. |

### `session`

| Field        | Type                             | Description                                                                                                                                                                                                |
| ------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | string                           | Random per page load, never stored on the device. Lets the collector group batches from one page load.                                                                                                     |
| `seq`        | number                           | Batch number within the session, starting at 1.                                                                                                                                                            |
| `mode`       | `"profiling"` \| `"lightweight"` | The session's measurement mode when the batch was built. In a profiling session, `useRenderMonitor` timings are still marks measurements; see [Modes](/guide/modes#the-hook-s-duration-is-an-upper-bound). |
| `route`      | string                           | The route when the batch was built.                                                                                                                                                                        |
| `appVersion` | string \| null                   | The `appVersion` option, or `null`.                                                                                                                                                                        |
| `startedAt`  | number                           | Epoch milliseconds when the session started.                                                                                                                                                               |
| `sentAt`     | number                           | Epoch milliseconds when this batch was built.                                                                                                                                                              |

### `device`

Values come from browser APIs. Fields the browser doesn't expose are `null`; `memoryGb` and `connection` are Chromium-only.

| Field        | Type           | Description                                                            |
| ------------ | -------------- | ---------------------------------------------------------------------- |
| `memoryGb`   | number \| null | `navigator.deviceMemory`, which browsers round to a few coarse values. |
| `cores`      | number \| null | `navigator.hardwareConcurrency`.                                       |
| `connection` | string \| null | `navigator.connection.effectiveType`, e.g. `"4g"`.                     |
| `viewport`   | string         | `` `${innerWidth}x${innerHeight}` `` in CSS pixels.                    |

### `summary`

| Field         | Type   | Description                         |
| ------------- | ------ | ----------------------------------- |
| `renders`     | number | Renders measured across all areas.  |
| `slowRenders` | number | Renders slower than `slowRenderMs`. |
| `longTasks`   | number | Long tasks observed.                |
| `longTaskMs`  | number | Their total duration.               |
| `longFrames`  | number | Long animation frames observed.     |
| `longFrameMs` | number | Their total duration.               |

### `areas[]`

One entry per area id and route.

| Field               | Type     | Description                                                                                                                                                                      |
| ------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | string   | The `id` given to `<RenderMonitor>` or `useRenderMonitor`.                                                                                                                       |
| `route`             | string   | The route the renders happened on.                                                                                                                                               |
| `renders`           | number   | Measured renders (mounts and updates).                                                                                                                                           |
| `mounts`            | number   | How many of those were mounts.                                                                                                                                                   |
| `slow`              | number   | Renders slower than `slowRenderMs` (default 16).                                                                                                                                 |
| `totalMs`           | number   | Sum of all render durations.                                                                                                                                                     |
| `min`               | number   | Fastest render.                                                                                                                                                                  |
| `max`               | number   | Slowest render.                                                                                                                                                                  |
| `p50`, `p75`, `p95` | number   | Percentiles, estimated from the histogram and kept within the observed `min` and `max`.                                                                                          |
| `hist`              | number[] | Render counts per bucket of `HISTOGRAM_BOUNDS`, plus a final overflow bucket (16 numbers).                                                                                       |
| `worst`             | array    | The slowest renders in this batch (up to `worstCases`, default 5): `ms`, `phase` (`"mount"`, `"update"` or `"nested-update"`), and `at`, milliseconds since the session started. |

`HISTOGRAM_BOUNDS` is `[1, 2, 4, 8, 12, 16, 24, 33, 50, 75, 100, 150, 250, 500, 1000]`: each bucket counts renders up to and including its bound. Histograms from many batches can be added bucket by bucket, which is how the viewer computes percentiles across sessions.

### `longTasks[]` and `longFrames[]`

Main-thread blocks of at least `longTaskMs` (default 50), from the `longtask` and `long-animation-frame` performance entries. Browsers that don't support an entry type send an empty list.

| Field     | Type           | Description                                                                                                                                                                                                |
| --------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `area`    | string \| null | The monitored area that was rendering during the block, or `null` when none was. When several overlap (nested areas), the innermost one that accounts for at least half of the longest overlapping render. |
| `route`   | string         | The route at the time.                                                                                                                                                                                     |
| `count`   | number         | Number of blocks.                                                                                                                                                                                          |
| `totalMs` | number         | Their total duration.                                                                                                                                                                                      |
| `maxMs`   | number         | The longest one.                                                                                                                                                                                           |

## Limits the collector enforces

Besides rejecting unknown fields, the collector bounds every string and list, so a hostile client can't store unbounded data:

| Field                                                           | Limit                                    |
| --------------------------------------------------------------- | ---------------------------------------- |
| Area ids                                                        | 1 to 200 characters                      |
| Routes                                                          | Up to 500 characters                     |
| `session.id`                                                    | 1 to 64 characters                       |
| `appVersion`                                                    | Up to 100 characters                     |
| `device.connection`                                             | Up to 20 characters                      |
| `device.viewport`                                               | `<width>x<height>`, up to 5 digits each  |
| `areas`, `longTasks`, `longFrames`                              | Up to 1000 entries each                  |
| `worst`                                                         | Up to 50 entries                         |
| `hist`                                                          | Exactly 16 entries                       |
| Durations (`min`, `max`, percentiles, worst-case `ms`, `maxMs`) | 0 to 3,600,000 ms                        |
| Request body                                                    | 65,536 bytes by default (`maxBodyBytes`) |

The client keeps its batches within these limits on its own: it clamps `maxPayloadBytes` to 1,000–65,536, `maxAreas` to 1–1000 and `worstCases` to 0–50, truncates area ids to 200 characters (an empty id is reported as `"(unnamed)"`), routes to 500 and `appVersion` to 100. If you lower the collector's `maxBodyBytes` below the client's `maxPayloadBytes`, larger batches get a 413.
