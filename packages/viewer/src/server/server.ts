import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import type { BatchQuery, Storage } from "react-render-pulse-collector";
import { toBatchQuery } from "../core/query.js";
import { buildReport } from "../core/report.js";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

export interface ViewerServerOptions {
  storage: Storage;
  /** Folder with the built web viewer (`dist/web`). */
  webRoot: string;
}

/** The API the web viewer calls: `GET /api/report?since=30d&version=2.4.0`. */
export interface ReportResponse {
  report: ReturnType<typeof buildReport>;
  /** Every app version in the time range, for the version filter. */
  versions: string[];
}

/**
 * Serves the web viewer and its report API. It only reads from storage, and
 * binds to localhost by default (see the CLI's `--host`), since reports
 * aren't meant to be public.
 */
export function createViewerServer(options: ViewerServerOptions): Server {
  const { storage, webRoot } = options;

  async function handleReport(url: URL, res: ServerResponse): Promise<void> {
    let query: BatchQuery;
    try {
      query = toBatchQuery({ since: url.searchParams.get("since") });
    } catch (error) {
      return sendJson(res, 400, { error: (error as Error).message });
    }

    const batches = await storage.read(query);
    const versions = [...new Set(batches.map((b) => b.payload.session.appVersion ?? "unknown"))];
    const version = url.searchParams.get("version");
    const filtered = version ? batches.filter((b) => (b.payload.session.appVersion ?? "unknown") === version) : batches;

    sendJson(res, 200, { report: buildReport(filtered), versions } satisfies ReportResponse);
  }

  async function handleStatic(pathname: string, res: ServerResponse): Promise<void> {
    const relative = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
    const file = join(webRoot, relative);
    // Refuse anything that resolves outside the web root (e.g. "/../../etc/passwd").
    if (file !== webRoot && !file.startsWith(webRoot.endsWith(sep) ? webRoot : webRoot + sep)) {
      return sendJson(res, 403, { error: "Forbidden" });
    }

    const target = extname(file) ? file : join(webRoot, "index.html");
    try {
      const body = await readFile(target);
      res.writeHead(200, {
        "content-type": CONTENT_TYPES[extname(target)] ?? "application/octet-stream",
        "x-content-type-options": "nosniff",
      });
      res.end(body);
    } catch {
      sendJson(res, 404, { error: "Not found" });
    }
  }

  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const work = url.pathname === "/api/report" ? handleReport(url, res) : handleStatic(url.pathname, res);
    work.catch((error: unknown) => {
      if (!res.headersSent) sendJson(res, 500, { error: (error as Error).message ?? "Server error" });
    });
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
