import { readFile } from "node:fs/promises";
import type { Payload } from "react-render-pulse/core";
import type { StoredBatch } from "react-render-pulse-collector";

/**
 * Reads batches from a file in any of the shapes render-pulse produces:
 * JSON Lines of stored batches (the JSON-file storage), a JSON array of
 * stored batches or payloads, or a single payload. Payloads without a
 * `receivedAt` use their `sentAt` time.
 */
export async function loadBatchesFromFile(path: string): Promise<StoredBatch[]> {
  return parseBatches(await readFile(path, "utf8"));
}

export function parseBatches(text: string): StoredBatch[] {
  const trimmed = text.trim();
  if (trimmed === "") return [];

  let items: unknown[];
  if (trimmed.startsWith("[")) {
    items = JSON.parse(trimmed) as unknown[];
  } else {
    try {
      items = [JSON.parse(trimmed)];
    } catch {
      items = trimmed
        .split("\n")
        .filter((line) => line.trim() !== "")
        .flatMap((line) => {
          try {
            return [JSON.parse(line) as unknown];
          } catch {
            return []; // A partially written last line shouldn't hide the rest.
          }
        });
    }
  }

  return items.flatMap(toStoredBatch);
}

function toStoredBatch(item: unknown): StoredBatch[] {
  if (!item || typeof item !== "object") return [];
  if ("payload" in item && "receivedAt" in item) return [item as StoredBatch];
  if ("v" in item && "session" in item) {
    const payload = item as Payload;
    return [{ receivedAt: new Date(payload.session.sentAt).toISOString(), payload }];
  }
  return [];
}
