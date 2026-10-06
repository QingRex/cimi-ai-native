import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { executeLocalCommand, LocalProjectError, openLocalProject, type LocalProject } from "@cimiloop/local-app";
import type { DomainError } from "@cimiloop/protocol/v2";

const MAX_BODY_BYTES = 128 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const SESSION_MS = 8 * 60 * 60 * 1000;
const token = () => randomBytes(32).toString("base64url");
const equal = (actual: string | undefined, expected: string | undefined) => Boolean(actual && expected &&
  Buffer.byteLength(actual) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(actual), Buffer.from(expected)));
class HttpFailure extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }
const header = (request: IncomingMessage, name: string) => {
  const entries = request.rawHeaders.filter((_value, index) => index % 2 === 0 && request.rawHeaders[index]!.toLowerCase() === name);
  if (entries.length > 1) throw new HttpFailure(400, "AMBIGUOUS_HEADER");
  const value = request.headers[name]; return typeof value === "string" ? value : undefined;
};
const readBody = async (request: IncomingMessage): Promise<unknown> => {
  if (header(request, "content-type")?.toLowerCase() !== "application/json") throw new HttpFailure(415, "JSON_REQUIRED");
  const length = header(request, "content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) throw new HttpFailure(413, "BODY_TOO_LARGE");
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new HttpFailure(413, "BODY_TOO_LARGE");
    chunks.push(bytes);
  }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new HttpFailure(400, "INVALID_JSON"); }
};
const statusFor = (error: DomainError | LocalProjectError) => ({ validation: 400, forbidden: 403, not_found: 404,
  conflict: 409, storage: 503, internal: 500 }[error.category] ?? 422);
const checked = <T>(value: T | DomainError): T => {
  if (value && typeof value === "object" && "code" in value) throw value;
  return value as T;
};

export interface WorkbenchOptions { projectDir: string; port?: number }
export interface WorkbenchServer { origin: string; bootstrapUrl: string; close(): Promise<void> }

export const startWorkbench = async (options: WorkbenchOptions): Promise<WorkbenchServer> => {
  if (options.port !== undefined && (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535)) throw new Error("Invalid loopback port");
  const context = openLocalProject({ projectDir: options.projectDir });
  const assets = new Map<string, { type: string; body: Buffer }>();
  try {
    for (const [route, file, type] of [["/", "index.html", "text/html; charset=utf-8"], ["/app.js", "app.js", "text/javascript; charset=utf-8"],
      ["/style.css", "style.css", "text/css; charset=utf-8"]]) {
      assets.set(route!, { type: type!, body: readFileSync(fileURLToPath(new URL(`../public/${file}`, import.meta.url))) });
    }
  } catch (error) { context.store.close(); throw error; }
  let origin = "", bootstrap: string | undefined = token(), session: string | undefined, csrf: string | undefined, expires = 0;
  let closing = false, failedLogins = 0, cookieName = "";
  const pending = new Set<Promise<void>>();
  const send = (response: ServerResponse, status: number, value: unknown) => {
    if (response.destroyed || response.writableEnded) return;
    let body = Buffer.from(JSON.stringify(value));
    if (body.length > MAX_RESPONSE_BYTES) { status = 413; body = Buffer.from('{"ok":false,"code":"RESPONSE_TOO_LARGE"}'); }
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": body.length }); response.end(body);
  };
  const requireSource = (request: IncomingMessage, write: boolean) => {
    if (header(request, "host") !== origin.slice(7)) throw new HttpFailure(403, "HOST_REJECTED");
    const source = header(request, "origin"), site = header(request, "sec-fetch-site");
    if ((source !== undefined && source !== origin) || (write && source !== origin) ||
      (site !== undefined && !["same-origin", "none"].includes(site))) throw new HttpFailure(403, "ORIGIN_REJECTED");
    if (request.socket.remoteAddress !== "127.0.0.1" && request.socket.remoteAddress !== "::ffff:127.0.0.1") throw new HttpFailure(403, "LOOPBACK_REQUIRED");
  };
  const requireSession = (request: IncomingMessage, write: boolean) => {
    const cookies = (header(request, "cookie") ?? "").split(";").map(value => value.trim()).filter(value => value.startsWith(`${cookieName}=`));
    if (cookies.length !== 1 || Date.now() >= expires || !equal(cookies[0]!.slice(cookieName.length + 1), session)) throw new HttpFailure(401, "SESSION_REQUIRED");
    if (write && !equal(header(request, "x-cimiloop-csrf"), csrf)) throw new HttpFailure(403, "CSRF_REJECTED");
  };
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader("Cache-Control", "no-store"); response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff"); response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      if (closing) throw new HttpFailure(503, "WORKBENCH_CLOSING");
      requireSource(request, request.method !== "GET");
      if (!request.url?.startsWith("/") || request.url.startsWith("//")) throw new HttpFailure(400, "INVALID_ROUTE");
      const url = new URL(request.url, origin);
      if (url.search || url.hash) throw new HttpFailure(400, "INVALID_ROUTE");
      const asset = assets.get(url.pathname);
      if (asset && request.method === "GET") {
        response.writeHead(200, { "Content-Type": asset.type, "Content-Length": asset.body.length }); response.end(asset.body); return;
      }
      if (url.pathname === "/api/session" && request.method === "POST") {
        const body = await readBody(request);
        if (closing) throw new HttpFailure(503, "WORKBENCH_CLOSING");
        if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).join() !== "bootstrap" ||
          !equal(typeof (body as { bootstrap: unknown }).bootstrap === "string" ? (body as { bootstrap: string }).bootstrap : undefined, bootstrap)) {
          if (++failedLogins >= 6) bootstrap = undefined;
          throw new HttpFailure(401, "BOOTSTRAP_REJECTED");
        }
        bootstrap = undefined; session = token(); csrf = token(); expires = Date.now() + SESSION_MS;
        response.setHeader("Set-Cookie", `${cookieName}=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}`);
        send(response, 200, { ok: true, csrf }); return;
      }
      requireSession(request, request.method !== "GET");
      if (url.pathname === "/api/context" && request.method === "GET") {
        send(response, 200, { ok: true, project_id: context.instance.project_id, actor_id: context.instance.actor_id, csrf, expires_at: new Date(expires).toISOString() }); return;
      }
      if (url.pathname === "/api/dashboard" && request.method === "GET") {
        send(response, 200, dashboard(context)); return;
      }
      if (url.pathname === "/api/decisions" && request.method === "GET") {
        const changes = checked(context.kernel.getChangeList());
        send(response, 200, { ok: true, changes_as_of_event_sequence: changes.as_of_event_sequence,
          items: changes.changes.map(change => ({ change, intent: checked(context.kernel.getIntent(change.id)) })) }); return;
      }
      const changeMatch = /^\/api\/changes\/([^/]{1,200})$/.exec(url.pathname);
      if (changeMatch && request.method === "GET") {
        const id = decodeURIComponent(changeMatch[1]!);
        send(response, 200, { ok: true, intent: checked(context.kernel.getIntent(id)), execution: checked(context.kernel.getExecution(id)),
          runs: checked(context.kernel.getRuns(id)), verification: checked(context.kernel.getVerification(id)) }); return;
      }
      const objectMatch = /^\/api\/objects\/([^/]{1,80})\/([^/]{1,200})$/.exec(url.pathname);
      if (objectMatch && request.method === "GET") {
        const result = context.kernel.getObject(decodeURIComponent(objectMatch[1]!), decodeURIComponent(objectMatch[2]!));
        send(response, "code" in result ? statusFor(result) : 200, result); return;
      }
      if (url.pathname === "/api/commands" && request.method === "POST") {
        const body = await readBody(request);
        if (closing) throw new HttpFailure(503, "WORKBENCH_CLOSING");
        // A slow upload cannot carry an expired session into a later write.
        requireSession(request, true);
        const result = executeLocalCommand(context, body);
        send(response, "code" in result ? statusFor(result) : 200, result); return;
      }
      throw new HttpFailure(404, "ROUTE_NOT_FOUND");
    } catch (error) {
      if (error instanceof HttpFailure) send(response, error.status, { ok: false, code: error.code });
      else if (error instanceof LocalProjectError) send(response, statusFor(error), { ok: false, code: error.code, message: error.message });
      else if (error && typeof error === "object" && "category" in error && "code" in error) send(response, statusFor(error as DomainError), error);
      else send(response, 500, { ok: false, code: "WORKBENCH_FAILURE" });
    }
  };
  const server = createServer({ requestTimeout: 10_000, headersTimeout: 5_000, maxHeaderSize: 16 * 1024 }, (request, response) => {
    const work = handle(request, response); pending.add(work); void work.finally(() => pending.delete(work));
  });
  server.maxConnections = 64; server.maxHeadersCount = 50; server.on("clientError", (_error, socket) => socket.destroy());
  try {
    await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(options.port ?? 0, "127.0.0.1", () => { server.off("error", reject); done(); }); });
  } catch (error) { context.store.close(); throw error; }
  const address = server.address(); if (!address || typeof address === "string") { server.close(); context.store.close(); throw new Error("Loopback address unavailable"); }
  origin = `http://127.0.0.1:${address.port}`; cookieName = `cimiloop_workbench_${address.port}`;
  let closePromise: Promise<void> | undefined;
  return { origin, bootstrapUrl: `${origin}/#${bootstrap}`, close() {
    return closePromise ??= (async () => {
      closing = true; bootstrap = session = csrf = undefined;
      const closed = new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
      server.closeAllConnections(); await closed; await Promise.allSettled([...pending]); context.store.close();
    })();
  } };
};

const dashboard = (context: LocalProject) => ({ ok: true, project: checked(context.kernel.getProject()),
  flow: checked(context.kernel.getFlowStatus()), governance: checked(context.kernel.getGovernance()),
  execution: checked(context.kernel.getExecution()), providers: checked(context.kernel.getProviderCatalog()) });
