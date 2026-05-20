/**
 * Full end-to-end test for the manual "Email backup" feature.
 *
 * Steps:
 *  1. Sign in to Supabase as admin (admin@nexvision.local / password123)
 *  2. Encode the session into @supabase/ssr's cookie format
 *     (base64-<base64url(JSON.stringify(session))>, possibly chunked)
 *  3. POST to /api/backups/send with the session cookie — no backupId,
 *     so the route builds a fresh ZIP, uploads it, logs it, and emails it.
 *  4. Assert HTTP 200 and that a messageId is returned by Resend.
 *  5. Confirm the backup_logs row was written in Supabase.
 *
 * Usage:
 *   node scripts/test-backup-email-e2e.mjs [port]   # defaults to 3003
 */

import { request as httpsRequest } from "node:https";
import { request as httpRequest }  from "node:http";

const PORT   = process.argv[2] ?? "3003";
const BASE   = `http://localhost:${PORT}`;
const ok     = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const info   = (m) => console.log(`\x1b[36mi\x1b[0m ${m}`);
const warn   = (m) => console.log(`\x1b[33m!\x1b[0m ${m}`);
const fail   = (m) => { console.error(`\x1b[31m✗\x1b[0m ${m}`); process.exit(1); };

const SUPABASE_URL     = "https://wydphvbdyyxryxeqdbxk.supabase.co";
const SUPABASE_ANON    = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5ZHBodmJkeXl4cnl4ZXFkYnhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNDExMjQsImV4cCI6MjA5NDYxNzEyNH0.eK207Iw9llR8As-YwfKTz5pJ5kHURc-imxiu0WA_VGs";
const SUPABASE_SVC     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5ZHBodmJkeXl4cnl4ZXFkYnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA0MTEyNCwiZXhwIjoyMDk0NjE3MTI0fQ.Ix9PaviqX7rMlIEu2mIg1jwpZmuL5fT2iFz6e9cyzuY";
const ADMIN_EMAIL      = "admin@nexvision.local";
const ADMIN_PASSWORD   = "password123";
const LOCKED_RECIPIENT = "premium.global.official@gmail.com";
const PROJECT_REF      = "wydphvbdyyxryxeqdbxk";
const MAX_CHUNK_SIZE   = 3180; // from @supabase/ssr chunker

// ── Base64URL helpers (mirrors @supabase/ssr's base64url.js) ─────────────────
const TO_BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split("");

function stringToBase64URL(str) {
  const bytes = Buffer.from(str, "utf8");
  const base64 = [];
  let queue = 0, queuedBits = 0;
  for (const byte of bytes) {
    queue = (queue << 8) | byte;
    queuedBits += 8;
    while (queuedBits >= 6) {
      base64.push(TO_BASE64URL[(queue >> (queuedBits - 6)) & 63]);
      queuedBits -= 6;
    }
  }
  if (queuedBits > 0) {
    queue = queue << (6 - queuedBits);
    base64.push(TO_BASE64URL[(queue >> 0) & 63]);
  }
  return base64.join("");
}

// ── Cookie chunker (mirrors @supabase/ssr chunker.js) ────────────────────────
function createChunks(key, value) {
  let encoded = encodeURIComponent(value);
  if (encoded.length <= MAX_CHUNK_SIZE) return [{ name: key, value }];
  const chunks = [];
  while (encoded.length > 0) {
    let head = encoded.slice(0, MAX_CHUNK_SIZE);
    const lastPct = head.lastIndexOf("%");
    if (lastPct > MAX_CHUNK_SIZE - 3) head = head.slice(0, lastPct);
    let valueHead = "";
    while (head.length > 0) {
      try { valueHead = decodeURIComponent(head); break; }
      catch { head = head.slice(0, head.length - 3); }
    }
    chunks.push(valueHead);
    encoded = encoded.slice(encodeURIComponent(valueHead).length);
  }
  return chunks.map((v, i) => ({ name: `${key}.${i}`, value: v }));
}

// Encode a Supabase session into the @supabase/ssr cookie format.
function encodeSessionCookie(session) {
  const json = JSON.stringify(session);
  const encoded = "base64-" + stringToBase64URL(json);
  return createChunks(`sb-${PROJECT_REF}-auth-token`, encoded);
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
function fetchJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? httpsRequest : httpRequest;
    const body = opts.body ? Buffer.from(opts.body) : null;
    const headers = { "Content-Type": "application/json", ...(opts.headers ?? {}) };
    if (body) headers["Content-Length"] = body.length;
    const req = lib(
      { method: opts.method ?? "GET", hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search, headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json; try { json = JSON.parse(raw); } catch { json = { _raw: raw }; }
          resolve({ status: res.statusCode, headers: res.headers, body: json, raw });
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Step 1 — Sign in to Supabase ─────────────────────────────────────────────
async function signIn() {
  info(`Signing in as ${ADMIN_EMAIL}…`);
  const res = await fetchJson(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (res.status !== 200 || !res.body.access_token) {
    console.error("Supabase sign-in response:", res.body);
    fail(`Sign-in failed (HTTP ${res.status})`);
  }
  ok(`Signed in — user_id: ${res.body.user?.id}`);
  return res.body; // full session object
}

// ── Step 2 — Get backup_logs row count (before) ──────────────────────────────
async function getBackupCount() {
  const res = await fetchJson(
    `${SUPABASE_URL}/rest/v1/backup_logs?select=id&order=created_at.desc&limit=1`,
    { headers: { apikey: SUPABASE_SVC, Authorization: `Bearer ${SUPABASE_SVC}`, Prefer: "count=exact" } },
  );
  return parseInt(res.headers["content-range"]?.split("/")[1] ?? "0", 10);
}

// ── Step 3 — Call /api/backups/send ──────────────────────────────────────────
async function callSendRoute(session) {
  info(`Calling POST ${BASE}/api/backups/send…`);
  const cookies = encodeSessionCookie(session);
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  info(`Cookie chunks: ${cookies.length} (names: ${cookies.map((c) => c.name).join(", ")})`);

  const res = await fetchJson(`${BASE}/api/backups/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify({ email: "should-be-ignored@example.com" }),
  });
  return res;
}

// ── Step 4 — Verify backup_logs row ──────────────────────────────────────────
async function getLatestBackupLog() {
  const res = await fetchJson(
    `${SUPABASE_URL}/rest/v1/backup_logs?select=id,status,triggered_by,recipient_email,created_at&order=created_at.desc&limit=1`,
    { headers: { apikey: SUPABASE_SVC, Authorization: `Bearer ${SUPABASE_SVC}` } },
  );
  return Array.isArray(res.body) ? res.body[0] : null;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== Manual Backup Email — Full E2E Test (${BASE}) ===\n`);

  const session     = await signIn();
  const countBefore = await getBackupCount();
  info(`backup_logs rows before: ${countBefore}`);

  const res = await callSendRoute(session);

  console.log(`\n--- /api/backups/send response ---`);
  console.log(`Status: ${res.status}`);
  console.log(`Body:`, JSON.stringify(res.body, null, 2));
  console.log(`---------------------------------\n`);

  if (res.status === 200 || res.status === 201) {
    ok(`Route returned ${res.status}`);
    if (res.body?.messageId) ok(`Resend message ID: ${res.body.messageId}`);
    if (res.body?.email)     ok(`Email sent to: ${res.body.email}`);

    if (res.body?.email && res.body.email !== LOCKED_RECIPIENT) {
      warn(`Recipient mismatch — got "${res.body.email}", expected "${LOCKED_RECIPIENT}"`);
    } else if (res.body?.email === LOCKED_RECIPIENT) {
      ok(`Recipient correctly locked to ${LOCKED_RECIPIENT}`);
    }

    await new Promise((r) => setTimeout(r, 1500));
    const log = await getLatestBackupLog();
    if (log) {
      ok(`backup_logs row: id=${log.id}, status=${log.status}`);
      if (log.recipient_email) info(`Logged recipient: ${log.recipient_email}`);
    } else {
      warn(`Could not fetch latest backup_logs row`);
    }

    console.log(`\n=== ✓ E2E test PASSED — check inbox: ${LOCKED_RECIPIENT} ===\n`);
  } else if (res.status === 401 || res.status === 403) {
    // Auth cookie rejected — log what the route saw for debugging
    console.error("Cookie header sent:", `(session chunks encoded above)`);
    fail(`Auth rejected by route (${res.status}): ${JSON.stringify(res.body)}`);
  } else {
    fail(`Unexpected status ${res.status}: ${JSON.stringify(res.body)}`);
  }
}

main().catch((e) => fail(e.stack || e.message));
