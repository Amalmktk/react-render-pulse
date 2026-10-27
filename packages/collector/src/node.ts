// Node-only entry: adapts the standard Request → Response handler to Node's
// http (req, res) signature, for Express, Connect, Vite middleware, or plain node:http.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { CollectorHandler } from "./handler.js";

export type NodeListener = (req: IncomingMessage, res: ServerResponse, next?: (error?: unknown) => void) => void;

export function toNodeListener(handler: CollectorHandler): NodeListener {
  return (req, res, next) => {
    toRequest(req)
      .then(handler)
      .then(async (response) => {
        res.statusCode = response.status;
        response.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });
        res.end(Buffer.from(await response.arrayBuffer()));
      })
      .catch((error: unknown) => {
        if (next) next(error);
        else if (!res.headersSent) {
          res.statusCode = 500;
          res.end();
        }
      });
  };
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(key, item);
  }
  // Without a proxy there are no forwarding headers, so pass the socket address
  // on for rate limiting (it's only held in memory, never stored).
  if (!headers.has("x-forwarded-for") && !headers.has("x-real-ip") && req.socket.remoteAddress) {
    headers.set("x-real-ip", req.socket.remoteAddress);
  }

  const method = req.method ?? "GET";
  const url = `http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`;
  if (method === "GET" || method === "HEAD") return new Request(url, { method, headers });

  // The collector enforces its own size limit on the body it reads.
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return new Request(url, { method, headers, body: Buffer.concat(chunks) });
}
