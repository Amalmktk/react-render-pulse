import type { BatchQuery } from "react-render-pulse-collector";

/** Parses a relative duration like `7d`, `24h`, or `30m` into milliseconds. */
export function parseDuration(text: string): number | null {
  const match = /^(\d+)\s*([dhm])$/.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1]);
  const unit = { d: 86_400_000, h: 3_600_000, m: 60_000 }[match[2] as "d" | "h" | "m"];
  return value * unit;
}

/** Builds a storage query from `since` (e.g. `7d`) and `version`, as the CLI flags and web filters give them. */
export function toBatchQuery(
  options: { since?: string | null | undefined; version?: string | null | undefined },
  now: Date = new Date(),
): BatchQuery {
  const query: BatchQuery = {};
  if (options.since) {
    const ms = parseDuration(options.since);
    if (ms === null) throw new Error(`Invalid duration "${options.since}". Use e.g. 7d, 24h, or 30m.`);
    query.since = new Date(now.getTime() - ms);
  }
  if (options.version) query.appVersion = options.version;
  return query;
}
