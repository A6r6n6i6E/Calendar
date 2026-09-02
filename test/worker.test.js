import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import worker from "../worker/index.js";

class MockDb {
  constructor() {
    this.row = null;
  }

  prepare(sql) {
    const db = this;
    return {
      bind(...values) {
        return {
          async first() {
            assert.match(sql, /SELECT payload/);
            return db.row;
          },
          async run() {
            assert.match(sql, /INSERT INTO plan_state/);
            const [, payload, updatedAt] = values;
            db.row = {
              payload,
              updated_at: updatedAt,
              revision: (db.row?.revision || 0) + 1,
            };
            return { success: true };
          },
        };
      },
    };
  }
}

const plan = {
  version: 2,
  baseEvents: [],
  customEvents: [],
  cancellations: [],
  meta: { updatedAt: 100 },
};

const SYNC_CODE = "nauczyciel_plan_2026_test";
const SYNC_SECRET_HASH = createHash("sha256").update(SYNC_CODE).digest("hex");

function authorizedRequest(url, options = {}) {
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${SYNC_CODE}`);
  return new Request(url, { ...options, headers });
}

test("API odrzuca brak lub nieprawidłowy kod synchronizacji", async () => {
  const DB = new MockDb();
  const missing = await worker.fetch(new Request("https://example.test/api/sync"), { DB, SYNC_SECRET_HASH });
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).code, "SYNC_CODE_REQUIRED");

  const wrong = await worker.fetch(new Request("https://example.test/api/sync", {
    headers: { Authorization: "Bearer nieprawidlowy_kod_12345" },
  }), { DB, SYNC_SECRET_HASH });
  assert.equal(wrong.status, 401);
});

test("API bez skonfigurowanego skrótu pozostaje zamknięte na publicznym hostingu", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/sync"), { DB: new MockDb() });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "SYNC_AUTH_NOT_CONFIGURED");
});

test("nagłówka użytkownika nie można użyć zamiast kodu", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/sync", {
    headers: { "oai-authenticated-user-id": "owner-123" },
  }), { DB: new MockDb() });
  assert.equal(response.status, 503);
});

test("API zapisuje plan i zwraca go na innym urządzeniu", async () => {
  const DB = new MockDb();
  const put = await worker.fetch(authorizedRequest("https://example.test/api/sync", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state: plan, updatedAt: 100 }),
  }), { DB, SYNC_SECRET_HASH });
  assert.equal(put.status, 200);
  assert.equal((await put.json()).revision, 1);

  const get = await worker.fetch(authorizedRequest("https://example.test/api/sync"), { DB, SYNC_SECRET_HASH });
  const payload = await get.json();
  assert.equal(payload.updatedAt, 100);
  assert.deepEqual(payload.state, plan);
});

test("API nie nadpisuje nowszego planu starszą kopią", async () => {
  const DB = new MockDb();
  DB.row = { payload: JSON.stringify(plan), updated_at: 200, revision: 3 };
  const response = await worker.fetch(authorizedRequest("https://example.test/api/sync", {
    method: "PUT",
    body: JSON.stringify({ state: plan, updatedAt: 100 }),
  }), { DB, SYNC_SECRET_HASH });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).updatedAt, 200);
});
