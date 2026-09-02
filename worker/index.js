const PLAN_ID = "owner-plan";
const MAX_PAYLOAD_BYTES = 1_000_000;
const MIN_SYNC_CODE_LENGTH = 16;
const MAX_SYNC_CODE_LENGTH = 128;

function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(first, second) {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) {
    difference |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }
  return difference === 0;
}

function syncCodeFromRequest(request) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return "";
  return match[1].trim();
}

async function authorizeSync(request, env) {
  const configuredHash = typeof env.SYNC_SECRET_HASH === "string"
    ? env.SYNC_SECRET_HASH.trim().toLowerCase()
    : "";

  if (!configuredHash) return "misconfigured";
  if (!/^[a-f0-9]{64}$/.test(configuredHash)) return "misconfigured";

  const code = syncCodeFromRequest(request);
  if (code.length < MIN_SYNC_CODE_LENGTH || code.length > MAX_SYNC_CODE_LENGTH) return "denied";
  const submittedHash = await sha256Hex(code);
  return constantTimeEqual(submittedHash, configuredHash) ? "allowed" : "denied";
}

function isPlanState(value) {
  return value && typeof value === "object"
    && Array.isArray(value.baseEvents)
    && Array.isArray(value.customEvents)
    && Array.isArray(value.cancellations);
}

async function readPlan(db) {
  const row = await db.prepare(
    "SELECT payload, updated_at, revision FROM plan_state WHERE id = ? LIMIT 1",
  ).bind(PLAN_ID).first();
  if (!row) return null;
  return {
    state: JSON.parse(row.payload),
    updatedAt: Number(row.updated_at),
    revision: Number(row.revision),
  };
}

async function handleSync(request, env) {
  const authorization = await authorizeSync(request, env);
  if (authorization === "misconfigured") {
    return json({
      error: "Synchronizacja czeka na bezpieczną konfigurację",
      code: "SYNC_AUTH_NOT_CONFIGURED",
    }, 503);
  }
  if (authorization !== "allowed") {
    return json({
      error: "Wymagany prawidłowy kod synchronizacji",
      code: "SYNC_CODE_REQUIRED",
    }, 401, { "WWW-Authenticate": 'Bearer realm="Mój Plan"' });
  }
  if (!env.DB) return json({ error: "Brak bazy synchronizacji" }, 503);

  if (request.method === "GET") {
    const plan = await readPlan(env.DB);
    return json(plan || { state: null, updatedAt: 0, revision: 0 });
  }

  if (request.method !== "PUT") return json({ error: "Niedozwolona metoda" }, 405);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_PAYLOAD_BYTES) return json({ error: "Plan jest zbyt duży" }, 413);

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Nieprawidłowe dane" }, 400);
  }
  const updatedAt = Number(body.updatedAt);
  if (!isPlanState(body.state) || !Number.isSafeInteger(updatedAt) || updatedAt <= 0) {
    return json({ error: "Nieprawidłowy plan" }, 400);
  }

  const current = await readPlan(env.DB);
  if (current && current.updatedAt > updatedAt) return json(current, 409);

  await env.DB.prepare(
    `INSERT INTO plan_state (id, payload, updated_at, revision)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET
       payload = excluded.payload,
       updated_at = excluded.updated_at,
       revision = plan_state.revision + 1`,
  ).bind(PLAN_ID, JSON.stringify(body.state), updatedAt).run();
  return json(await readPlan(env.DB));
}

async function serveAsset(request, env) {
  if (!env.ASSETS) return new Response("Brak zasobów aplikacji", { status: 503 });
  let response = await env.ASSETS.fetch(request);
  if (response.status === 404 && request.method === "GET" && request.headers.get("accept")?.includes("text/html")) {
    response = await env.ASSETS.fetch(new Request(new URL("/index.html", request.url), { headers: request.headers }));
  }
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

const worker = {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/sync") return await handleSync(request, env);
      return await serveAsset(request, env);
    } catch (error) {
      console.error("request_failed", error);
      return json({ error: "Chwilowy błąd aplikacji" }, 500);
    }
  },
};

export { authorizeSync, isPlanState, sha256Hex };
export default worker;
