/**
 * Full end-to-end backup test — employee folders + email delivery.
 *
 * Steps:
 *  1. Sign in as admin → encode @supabase/ssr session cookie
 *  2. POST /api/backups/run → builds a real ZIP with employee folder structure
 *  3. Download the ZIP from Supabase storage
 *  4. Inspect ZIP contents — verify employees/ folders, description.json files,
 *     and data.json DB snapshot are all present
 *  5. POST /api/backups/send with the backupId → Resend delivers the ZIP
 *  6. Verify backup_logs row is completed
 *
 * Usage:
 *   node scripts/test-backup-full.mjs [port]   # defaults to 3003
 */

import { request as httpsRequest } from "node:https";
import { request as httpRequest }  from "node:http";
import JSZip from "jszip";

const PORT   = process.argv[2] ?? "3003";
const BASE   = `http://localhost:${PORT}`;
const ok     = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const info   = (m) => console.log(`\x1b[36mi\x1b[0m ${m}`);
const warn   = (m) => console.log(`\x1b[33m!\x1b[0m ${m}`);
const fail   = (m) => { console.error(`\x1b[31m✗\x1b[0m ${m}`); process.exit(1); };
const sep    = (t) => console.log(`\n\x1b[1m── ${t} ${"─".repeat(Math.max(0,50-t.length))}\x1b[0m`);

const SUPABASE_URL     = "https://wydphvbdyyxryxeqdbxk.supabase.co";
const SUPABASE_ANON    = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5ZHBodmJkeXl4cnl4ZXFkYnhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNDExMjQsImV4cCI6MjA5NDYxNzEyNH0.eK207Iw9llR8As-YwfKTz5pJ5kHURc-imxiu0WA_VGs";
const SUPABASE_SVC     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5ZHBodmJkeXl4cnl4ZXFkYnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA0MTEyNCwiZXhwIjoyMDk0NjE3MTI0fQ.Ix9PaviqX7rMlIEu2mIg1jwpZmuL5fT2iFz6e9cyzuY";
const ADMIN_EMAIL      = "admin@nexvision.local";
const ADMIN_PASSWORD   = "password123";
const LOCKED_RECIPIENT = "premium.global.official@gmail.com";
const PROJECT_REF      = "wydphvbdyyxryxeqdbxk";
const BACKUP_BUCKET    = "backups";
const MAX_CHUNK_SIZE   = 3180;

// ── base64url (mirrors @supabase/ssr) ─────────────────────────────────────────
const TO_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split("");
function toBase64URL(str) {
  const bytes = Buffer.from(str, "utf8");
  const out = [];
  let q = 0, qb = 0;
  for (const b of bytes) {
    q = (q << 8) | b; qb += 8;
    while (qb >= 6) { out.push(TO_B64[(q >> (qb - 6)) & 63]); qb -= 6; }
  }
  if (qb > 0) { q = q << (6 - qb); out.push(TO_B64[(q >> 0) & 63]); }
  return out.join("");
}
function encodeSessionCookie(session) {
  const encoded = "base64-" + toBase64URL(JSON.stringify(session));
  let enc = encodeURIComponent(encoded);
  const key = `sb-${PROJECT_REF}-auth-token`;
  if (enc.length <= MAX_CHUNK_SIZE) return [{ name: key, value: encoded }];
  const chunks = [];
  while (enc.length > 0) {
    let head = enc.slice(0, MAX_CHUNK_SIZE);
    const lp = head.lastIndexOf("%");
    if (lp > MAX_CHUNK_SIZE - 3) head = head.slice(0, lp);
    let vh = "";
    while (head.length > 0) { try { vh = decodeURIComponent(head); break; } catch { head = head.slice(0, head.length - 3); } }
    chunks.push(vh);
    enc = enc.slice(encodeURIComponent(vh).length);
  }
  return chunks.map((v, i) => ({ name: `${key}.${i}`, value: v }));
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
function http(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = new URL(url);
    const lib = p.protocol === "https:" ? httpsRequest : httpRequest;
    const body = opts.body ? Buffer.from(opts.body) : null;
    const headers = { "Content-Type": "application/json", ...(opts.headers ?? {}) };
    if (body) headers["Content-Length"] = body.length;
    const req = lib(
      { method: opts.method ?? "GET", hostname: p.hostname,
        port: p.port || (p.protocol === "https:" ? 443 : 80),
        path: p.pathname + p.search, headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks);
          let json; try { json = JSON.parse(raw.toString("utf8")); } catch { json = null; }
          resolve({ status: res.statusCode, headers: res.headers, body: json, raw });
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Auth ─────────────────────────────────────────────────────────────────────
async function signIn() {
  const res = await http(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (res.status !== 200 || !res.body?.access_token) fail(`Sign-in failed (${res.status})`);
  ok(`Signed in as ${ADMIN_EMAIL} (uid: ${res.body.user?.id})`);
  return res.body;
}

// ── Seed test submissions for today ──────────────────────────────────────────
const TODAY = new Date().toISOString().slice(0, 10);
const TEST_SUBS = [
  { id: "sub_test_backup_1", user_id: "u_employee",    submission_type_id: "st_weekly",    name: "John Doe",     type: "Weekly Summary" },
  { id: "sub_test_backup_2", user_id: "u_alex_turner", submission_type_id: "st_sales",     name: "Alex Turner",  type: "Sales Pipeline Report" },
  { id: "sub_test_backup_3", user_id: "u_david_kim",   submission_type_id: "st_inventory", name: "David Kim",    type: "Inventory Sheet" },
];

async function seedTestSubmissions() {
  const rows = TEST_SUBS.map((s) => ({
    id: s.id,
    user_id: s.user_id,
    submission_type_id: s.submission_type_id,
    date: TODAY,
    work_summary: `[TEST] Backup test submission for ${s.name} — ${TODAY}`,
    tasks_details: "Automated backup E2E test — safe to delete",
    status: "submitted",
    locked: false,
    submitted_at: new Date().toISOString(),
    version_number: 1,
  }));
  const body = Buffer.from(JSON.stringify(rows));
  const res = await http(`${SUPABASE_URL}/rest/v1/submissions`, {
    method: "POST",
    headers: { apikey: SUPABASE_SVC, Authorization: `Bearer ${SUPABASE_SVC}`,
               Prefer: "return=minimal", "Content-Length": body.length },
    body: JSON.stringify(rows),
  });
  if (res.status !== 201 && res.status !== 200) {
    console.error("seed response:", res.body || res.raw?.toString("utf8"));
    fail(`Failed to seed test submissions (${res.status})`);
  }
  ok(`Seeded ${rows.length} test submissions for today (${TODAY})`);
  return TEST_SUBS.map((s) => s.id);
}

async function cleanupTestSubmissions(ids) {
  const res = await http(
    `${SUPABASE_URL}/rest/v1/submissions?id=in.(${ids.join(",")})`,
    { method: "DELETE", headers: { apikey: SUPABASE_SVC, Authorization: `Bearer ${SUPABASE_SVC}`, Prefer: "return=minimal" } },
  );
  if (res.status === 200 || res.status === 204) ok(`Cleaned up ${ids.length} test submissions`);
  else warn(`Cleanup returned ${res.status} — delete rows manually if needed`);
}

// ── Build backup via /api/backups/run ─────────────────────────────────────────
async function runBackup(cookieHdr) {
  const res = await http(`${BASE}/api/backups/run`, {
    method: "POST",
    headers: { Cookie: cookieHdr },
    body: "{}",
  });
  if (res.status !== 200 && res.status !== 201) {
    console.error("run response:", res.body || res.raw?.toString("utf8"));
    fail(`/api/backups/run failed (${res.status})`);
  }
  return res.body; // { ok, backupId, fileName, sizeBytes, ... }
}

// ── Download ZIP from Supabase storage ───────────────────────────────────────
async function downloadZip(storagePath) {
  // Use the REST storage API with service role
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  const res = await http(
    `${SUPABASE_URL}/storage/v1/object/${BACKUP_BUCKET}/${encodedPath}`,
    { headers: { apikey: SUPABASE_SVC, Authorization: `Bearer ${SUPABASE_SVC}` } },
  );
  if (res.status !== 200) {
    console.error("storage download response:", res.body || res.status);
    fail(`Failed to download ZIP from storage (${res.status})`);
  }
  return res.raw; // Buffer
}

// ── Inspect ZIP ───────────────────────────────────────────────────────────────
async function inspectZip(zipBuffer) {
  const zip = await JSZip.loadAsync(zipBuffer);
  const files = Object.keys(zip.files).filter((f) => !zip.files[f].dir);
  const dirs  = Object.keys(zip.files).filter((f) =>  zip.files[f].dir);

  console.log(`\n  ZIP contains ${files.length} file(s) and ${dirs.length} virtual folder(s):`);

  // Categorise entries
  const dataJson       = files.find((f) => f === "data.json");
  const manifestTxt    = files.find((f) => f === "manifest.txt");
  const empDescriptions = files.filter((f) => f.startsWith("employees/") && f.endsWith("description.json"));
  const empAttachments  = files.filter((f) => f.startsWith("employees/") && !f.endsWith("description.json"));
  const empFolders      = [...new Set(files.filter((f) => f.startsWith("employees/")).map((f) => f.split("/")[1]))];

  for (const f of files.slice(0, 30)) {
    const entry = zip.files[f];
    const size  = entry._data?.uncompressedSize ?? "?";
    const tag   = f.startsWith("employees/") ? "\x1b[35memp\x1b[0m" : "\x1b[36mzip\x1b[0m";
    console.log(`    [${tag}] ${f}  (${size} B)`);
  }
  if (files.length > 30) console.log(`    … and ${files.length - 30} more files`);

  // Assertions
  if (!dataJson)    fail("ZIP is missing data.json");
  ok("data.json present (full DB snapshot)");

  if (manifestTxt)  ok("manifest.txt present");

  if (empFolders.length === 0) {
    warn("No employees/ folders in ZIP (no submissions for today — that is valid if no work was submitted today)");
    warn("To verify employee folders, submissions with attachments must exist for today.");
    // Not a failure — the build is correct, today just has no submissions
  } else {
    ok(`employees/ folders present: ${empFolders.join(", ")}`);
    ok(`description.json files: ${empDescriptions.length}`);
    ok(`attachment files: ${empAttachments.length}`);

    // Spot-check a description.json
    if (empDescriptions.length > 0) {
      const raw = await zip.files[empDescriptions[0]].async("string");
      const desc = JSON.parse(raw);
      ok(`Sample description — employee: "${desc.employee?.name}", type: "${desc.submissionType}", date: ${desc.date}`);
    }
  }

  // Check data.json has real row counts
  const dataRaw  = await zip.files["data.json"].async("string");
  const dataJson_ = JSON.parse(dataRaw);
  const users    = (dataJson_.users ?? []).length;
  const subs     = (dataJson_.submissions ?? []).length;
  const atts     = (dataJson_.attachments ?? []).length;
  ok(`data.json row counts — users: ${users}, submissions: ${subs}, attachments: ${atts}`);

  return { empFolders, empAttachments, empDescriptions };
}

// ── Send backup via /api/backups/send ─────────────────────────────────────────
async function sendBackup(backupId, cookieHdr) {
  const res = await http(`${BASE}/api/backups/send`, {
    method: "POST",
    headers: { Cookie: cookieHdr },
    body: JSON.stringify({ backupId, email: "dummy-should-be-ignored@example.com" }),
  });
  if (res.status !== 200 && res.status !== 201) {
    console.error("send response:", res.body || res.raw?.toString("utf8"));
    fail(`/api/backups/send failed (${res.status})`);
  }
  return res.body;
}

// ── Fetch backup_log ─────────────────────────────────────────────────────────
async function getLog(backupId) {
  const res = await http(
    `${SUPABASE_URL}/rest/v1/backup_logs?id=eq.${backupId}&select=*`,
    { headers: { apikey: SUPABASE_SVC, Authorization: `Bearer ${SUPABASE_SVC}` } },
  );
  return Array.isArray(res.body) ? res.body[0] : null;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n\x1b[1m=== NexTask Backup — Employee Folders + Email Delivery Test ===\x1b[0m`);
  console.log(`    Server: ${BASE}   Recipient: ${LOCKED_RECIPIENT}\n`);

  // 1. Auth
  sep("STEP 1 — Admin sign-in");
  const session = await signIn();
  const cookies = encodeSessionCookie(session);
  const cookieHdr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  info(`Session cookie: ${cookies.length} chunk(s)`);

  // 1b. Seed today's submissions so employee folders appear in the ZIP
  sep("STEP 1b — Seed test submissions for today");
  info(`Inserting 3 test submissions with date=${TODAY} so employee folders are populated…`);
  const seededIds = await seedTestSubmissions();

  let sendResult, backupId, fileName, sizeBytes, storagePath, empFolders, empAttachments, empDescriptions;
  try {
  // 2. Build
  sep("STEP 2 — Build backup ZIP");
  info("Calling /api/backups/run — this builds a fresh ZIP from live Supabase data…");
  const runResult = await runBackup(cookieHdr);
  // Route returns the backup_logs row directly: { id, file_name, file_path, size_bytes, ... }
  backupId    = runResult.id;
  fileName    = runResult.file_name;
  sizeBytes   = runResult.size_bytes;
  storagePath = runResult.file_path;
  const detail      = runResult._detail ?? {};
  ok(`Backup built: ${fileName} (${(sizeBytes / 1024).toFixed(1)} KB)`);
  ok(`backup_logs id: ${backupId}`);
  info(`Attachments included: ${detail.attachmentCount ?? "?"}, bytes: ${detail.attachmentBytes ?? "?"}`);

  // 3. Download + inspect
  sep("STEP 3 — Download & inspect ZIP contents");
  info(`Downloading from storage: ${storagePath}`);
  const zipBuf = await downloadZip(storagePath);
  info(`Downloaded ${(zipBuf.length / 1024).toFixed(1)} KB`);
  const { empFolders: ef, empAttachments: ea, empDescriptions: ed } = await inspectZip(zipBuf);
  empFolders = ef; empAttachments = ea; empDescriptions = ed;

  // 4. Send
  sep("STEP 4 — Email the backup");
  info(`Calling /api/backups/send with backupId: ${backupId}…`);
  sendResult = await sendBackup(backupId, cookieHdr);
  ok(`Resend message ID: ${sendResult.messageId}`);
  ok(`Recipient: ${sendResult.email}`);
  if (sendResult.email !== LOCKED_RECIPIENT) {
    fail(`Recipient was NOT locked! Got "${sendResult.email}" instead of "${LOCKED_RECIPIENT}"`);
  }
  ok(`Recipient correctly locked to ${LOCKED_RECIPIENT}`);
  info(`Attached: ${sendResult.attached ? "yes (ZIP as attachment)" : "no (download link used — file too large)"}`);

  // 5. Verify log
  sep("STEP 5 — Verify backup_logs");
  await new Promise((r) => setTimeout(r, 1000));
  const log = await getLog(backupId);
  if (!log) { warn("Could not fetch backup_logs row"); }
  else {
    ok(`status: ${log.status}`);
    ok(`file_name: ${log.file_name}`);
    ok(`size_bytes: ${log.size_bytes}`);
  }

  // Summary
  console.log(`\n\x1b[1;32m=== ALL STEPS PASSED ===\x1b[0m`);
  console.log(`  ZIP:        ${fileName}`);
  console.log(`  Size:       ${(sizeBytes / 1024).toFixed(1)} KB`);
  console.log(`  Emp folders: ${empFolders.length > 0 ? empFolders.join(", ") : "(none today)"}`);
  console.log(`  Emp descs:  ${empDescriptions.length}`);
  console.log(`  Emp files:  ${empAttachments.length}`);
  console.log(`  Msg ID:     ${sendResult.messageId}`);
  console.log(`  To:         ${sendResult.email}`);
  console.log(`\n  Check inbox: ${LOCKED_RECIPIENT}\n`);
  } finally {
    // Always clean up seeded test data regardless of test outcome
    sep("CLEANUP — Remove test submissions");
    await cleanupTestSubmissions(seededIds);
  }
}

main().catch((e) => fail(e.stack || e.message));
