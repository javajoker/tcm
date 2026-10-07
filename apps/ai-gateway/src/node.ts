// The gateway on Node: for development, the end-to-end tests and a host that runs Node.
//   node apps/ai-gateway/src/node.ts           configuration from the environment (config.ts)
//   node apps/ai-gateway/src/node.ts --dev     the mock provider, a random secret for this run and the local origins of the dev server and the previews — anything set in the
//                                              environment still wins (AI_KILL=1 …). Port: AI_PORT, 8787 by default.
// Each request's log line goes to stdout as JSON: counts and codes, never content (gateway.ts).
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, Server } from "node:http";
import type { AddressInfo } from "node:net";
import { configFrom } from "./config.ts";
import type { Env } from "./config.ts";
import { createGateway } from "./gateway.ts";
import { providerFor } from "./provider.ts";

const LOCAL = [5173, 4173, 4174].flatMap((port) => [`http://localhost:${port}`, `http://127.0.0.1:${port}`]).join(",");

export function devEnv(env: Env): Env {
  return { AI_SECRET: randomBytes(32).toString("hex"), AI_ALLOWED_ORIGINS: LOCAL, AI_PROVIDER: "mock", ...env };
}

/** The body, up to one byte beyond `max`: what arrives after that is drained, not kept — the gateway then answers 413 with its own headers while the client still sends. */
function readUpTo(req: IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    req.on("data", (chunk: Buffer) => {
      if (settled) return;
      chunks.push(chunk);
      size += chunk.length;
      if (size > max) {
        settled = true;
        resolve(Buffer.concat(chunks).subarray(0, max + 1));
      }
    });
    req.on("end", () => { if (!settled) { settled = true; resolve(Buffer.concat(chunks)); } });
    req.on("error", reject);
  });
}

async function toRequest(req: IncomingMessage, max: number): Promise<Request> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) headers.append(name, v);
  }
  const method = req.method ?? "GET";
  const body = method === "GET" || method === "HEAD" || method === "OPTIONS" ? null : new Uint8Array(await readUpTo(req, max));
  return new Request(`http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`, { method, headers, body });
}

/** The gateway on a Node HTTP server, listening on `port` of the loopback address (0: any free port); `maxBody` is the gateway's limit (config.limits.bodyBytes). */
export function serve(gateway: (request: Request) => Promise<Response>, port: number, maxBody: number): Promise<Server> {
  const server = createServer((req, res) => {
    void toRequest(req, maxBody).then(gateway).then(async (response) => {
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    }, () => {
      res.writeHead(400);
      res.end();
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (import.meta.main) {
  const dev = process.argv.includes("--dev");
  const config = configFrom(dev ? devEnv(process.env) : process.env);
  const gateway = createGateway({ config, provider: providerFor(config), now: () => Date.now(), log: (line) => void process.stdout.write(`${JSON.stringify(line)}\n`) });
  const server = await serve(gateway, Number(process.env["AI_PORT"] ?? "8787"), config.limits.bodyBytes);
  const { port } = server.address() as AddressInfo;
  process.stdout.write(`ai-gateway: http://127.0.0.1:${port} — provider ${config.provider}${dev ? ", development" : ""}${config.killed ? ", every module off (AI_KILL)" : ""}\n`);
}
