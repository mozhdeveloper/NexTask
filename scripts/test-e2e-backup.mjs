/**
 * Full end-to-end backup test: manual run + email send + auto-backup logic.
 * Mirrors exactly what /api/backups/run, /api/backups/send, and /api/backups/auto do.
 * Runs without a web server — uses the service-role key directly.
 *
 * Usage (from nextask-app/):
 *   node scripts/test-e2e-backup.mjs
 */

import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { randomUUID } from "crypto";
import https from "https";

// ── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL       = "https://wydphvbdyyxryxeqdbxk.supabase.co";
const SERVICE_ROLE_KEY   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5ZHBodmJkeXl4cnl4ZXFkYnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA0MTEyNCwiZXhwIjoyMDk0NjE3MTI0fQ.Ix9PaviqX7rMlIEu2mIg1jwpZmuL5fT2iFz6e9cyzuY";
const RESEND_API_KEY     = "re_J6iZZDyW_MFbbVGZ1FYxRCyuW8SYZ7KDZ";
const RESEND_FROM        = "NexTask Backups <onboarding@resend.dev>";
const TEST_EMAIL         = "premium.global.official@gmail.com"; // Resend account owner — use until domain is verified
const SUBMISSIONS_BUCKET = "submissions";
const BACKUP_BUCKET      = "backups";
const MAX_ATTACH_BYTES   = 20 * 1024 * 1024;

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const TABLES = [
  "users","departments","submission_types","submissions","attachments",
  "revisions","projects","holidays","notifications","activity_logs",
  "backup_logs","work_settings",
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, "0"); }
function stamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
function sanitize(s) { return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80); }
function mb(n) { return (n / 1024 / 1024).toFixed(2); }
function section(title) {
  console.log(`\n${"─".repeat(52)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(52));
}
function ok(msg)   { console.log(`  ✅  ${msg}`); }
function fail(msg) { console.log(`  ❌  ${msg}`); }
function info(msg) { console.log(`      ${msg}`); }

async function resendSend(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: "api.resend.com",
      path: "/emails",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Core: build the zip ───────────────────────────────────────────────────────
async function buildZip({ triggeredBy = "test", attachmentsForDate = null, label = "" }) {
  const startedAt = new Date();
  const zip = new JSZip();

  info(`Snapshotting ${TABLES.length} tables…`);
  const snapshot = { _meta: { generatedAt: startedAt.toISOString(), triggeredBy, project: "NexTask" } };
  const rowCounts = {};
  for (const t of TABLES) {
    const { data, error } = await sb.from(t).select("*");
    if (error) throw new Error(`Table read failed [${t}]: ${error.message}`);
    snapshot[t] = data ?? [];
    rowCounts[t] = (data ?? []).length;
  }
  info(`Tables OK — ${Object.values(rowCounts).reduce((a,b) => a+b, 0)} total rows`);
  zip.file("data.json", JSON.stringify(snapshot, null, 2));

  const usersById = new Map(snapshot.users.map(u => [u.id, u]));
  const subsById  = new Map(snapshot.submissions.map(s => [s.id, s]));
  const allAtts   = (snapshot.attachments ?? []).filter(a => a.storage_path);
  const want = attachmentsForDate
    ? allAtts.filter(a => { const s = subsById.get(a.submission_id); return s && s.date === attachmentsForDate; })
    : allAtts;
  info(`${want.length} attachment(s) to include (${attachmentsForDate ?? "all dates"})`);

  let attachmentCount = 0, attachmentBytes = 0;
  const BATCH = 6;
  for (let i = 0; i < want.length; i += BATCH) {
    const results = await Promise.all(want.slice(i, i + BATCH).map(async a => {
      try {
        const { data, error } = await sb.storage.from(SUBMISSIONS_BUCKET).download(a.storage_path);
        if (error || !data) return { a, ok: false, err: error?.message ?? "no data" };
        return { a, ok: true, buf: Buffer.from(await data.arrayBuffer()) };
      } catch (e) { return { a, ok: false, err: e.message }; }
    }));
    for (const r of results) {
      if (!r.ok) { info(`  ⚠ SKIP ${r.a.storage_path}: ${r.err}`); continue; }
      const sub    = subsById.get(r.a.submission_id);
      const user   = sub ? usersById.get(sub.user_id) : undefined;
      const folder = sanitize(user?.name ?? "unknown_user");
      const date   = sub?.date ?? "no-date";
      zip.file(`attachments/${folder}/${date}__${sanitize(r.a.original_name)}`, r.buf);
      attachmentCount++;
      attachmentBytes += r.buf.length;
    }
  }
  info(`${attachmentCount} attachment(s) downloaded (${mb(attachmentBytes)} MB)`);

  const skipped = want.length - attachmentCount;
  const lines = [
    `NexTask Backup${label ? " — " + label : ""}`,
    "=".repeat(50),
    `Generated:       ${startedAt.toISOString()}`,
    `Generated local: ${startedAt.toLocaleString()}`,
    `Triggered by:    ${triggeredBy}`,
    `Attachments for: ${attachmentsForDate ?? "all dates"}`,
    "",
    "Row counts:",
    ...Object.entries(rowCounts).map(([t,n]) => `  ${t.padEnd(22)} ${n}`),
    "",
    `Attachments included: ${attachmentCount} (${mb(attachmentBytes)} MB)`,
    `Attachments skipped:  ${skipped}`,
  ];
  zip.file("manifest.txt", lines.join("\n"));

  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const fileName = `nextask_backup_${stamp(startedAt)}.zip`;
  const yearMonth = `${startedAt.getFullYear()}/${pad(startedAt.getMonth()+1)}`;
  const storagePath = `${yearMonth}/${fileName}`;
  info(`Compressed to ${mb(buf.length)} MB`);

  const { data: upData, error: upErr } = await sb.storage.from(BACKUP_BUCKET).upload(storagePath, buf, { contentType: "application/zip", upsert: true });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}. Did you create the '${BACKUP_BUCKET}' bucket?`);
  info(`Uploaded → ${upData.path}`);

  return { fileName, storagePath, buf, rowCounts, attachmentCount, attachmentBytes, startedAt };
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 1: Manual backup (mirrors /api/backups/run)
// ════════════════════════════════════════════════════════════════════════════
async function testManualBackup(today) {
  section("TEST 1 — Manual Backup  (/api/backups/run)");

  const id = `bk_${randomUUID().slice(0, 8)}`;
  const startedAt = new Date().toISOString();

  // Insert "running" row first (exactly as the route does)
  const { error: insErr } = await sb.from("backup_logs").insert({
    id, admin_id: null, file_name: "(pending)", file_path: "(pending)",
    size_bytes: 0, started_at: startedAt, completed_at: null, status: "running",
  });
  if (insErr) throw new Error(`Insert running row: ${insErr.message}`);
  info(`backup_logs row ${id} created with status=running`);

  let built;
  try {
    built = await buildZip({ triggeredBy: "manual:test-script", attachmentsForDate: today, label: "MANUAL TEST" });
    await sb.from("backup_logs").update({
      file_name: built.fileName, file_path: built.storagePath,
      size_bytes: built.buf.length, completed_at: new Date().toISOString(), status: "completed",
    }).eq("id", id);
  } catch (e) {
    await sb.from("backup_logs").update({ completed_at: new Date().toISOString(), status: "failed", file_name: `(failed) ${e.message.slice(0, 80)}` }).eq("id", id);
    throw e;
  }

  // Verify row is now completed
  const { data: row } = await sb.from("backup_logs").select("*").eq("id", id).single();
  if (row.status !== "completed") throw new Error(`Expected completed, got ${row.status}`);
  if (row.file_path === "(pending)") throw new Error("file_path was never updated from (pending)");

  ok(`Manual backup completed`);
  info(`File:       ${row.file_name}`);
  info(`Size:       ${mb(row.size_bytes)} MB  (${row.size_bytes} bytes)`);
  info(`Attachments: ${built.attachmentCount}`);
  info(`backup_logs id: ${id}  status=completed`);

  return { id, built, row };
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 2: Email the backup to jcuady@gmail.com (mirrors /api/backups/send)
// ════════════════════════════════════════════════════════════════════════════
async function testEmailBackup(built) {
  section(`TEST 2 — Email Backup  → ${TEST_EMAIL}`);

  const { data: zipData, error: dlErr } = await sb.storage.from(BACKUP_BUCKET).download(built.storagePath);
  if (dlErr || !zipData) throw new Error(`Download for email: ${dlErr?.message}`);
  const zipBuf = Buffer.from(await zipData.arrayBuffer());
  ok(`Downloaded backup ZIP for emailing (${mb(zipBuf.length)} MB)`);

  const tooBig = zipBuf.length > MAX_ATTACH_BYTES;
  let signedUrl = null;
  if (tooBig) {
    const { data: s, error: se } = await sb.storage.from(BACKUP_BUCKET).createSignedUrl(built.storagePath, 24 * 60 * 60);
    signedUrl = se ? null : s?.signedUrl;
    info(`ZIP > 20 MB — will use signed URL instead of attachment`);
  }

  const now = new Date();
  const sizeMB = mb(zipBuf.length);
  const downloadBlock = tooBig
    ? `<p style="margin:0 0 12px;color:#b45309"><strong>Note:</strong> ${sizeMB} MB file attached via download link (24h expiry):</p>
       ${signedUrl ? `<p><a href="${signedUrl}" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Download backup</a></p>` : ""}`
    : `<p style="color:#16a34a;font-size:13px">✓ ZIP attached to this email (${sizeMB} MB)</p>`;

  const countsHtml = `
    <table style="border-collapse:collapse;width:100%;font-size:13px;background:#f8fafc;border-radius:8px;overflow:hidden;margin-top:12px">
      <thead><tr style="background:#f1f5f9">
        <th style="padding:8px 12px;text-align:left;color:#475569">Table</th>
        <th style="padding:8px 12px;text-align:right;color:#475569">Rows</th>
      </tr></thead>
      <tbody>${Object.entries(built.rowCounts).map(([t,n]) =>
        `<tr><td style="padding:4px 12px;color:#475569">${t}</td><td style="padding:4px 12px;text-align:right;font-weight:600">${n}</td></tr>`
      ).join("")}</tbody>
    </table>`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <div style="padding:24px 0;border-bottom:2px solid #0f172a">
        <h1 style="margin:0;font-size:22px;letter-spacing:-0.5px">NexTask Backup</h1>
        <p style="margin:6px 0 0;color:#64748b;font-size:14px">Workspace snapshot delivered.</p>
      </div>
      <div style="padding:20px 0">
        <table style="width:100%;font-size:14px;border-collapse:collapse">
          <tr><td style="padding:4px 0;color:#64748b;width:130px">File</td><td style="font-weight:600">${built.fileName}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b">Size</td><td style="font-weight:600">${sizeMB} MB</td></tr>
          <tr><td style="padding:4px 0;color:#64748b">Generated</td><td>${now.toLocaleString()}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b">Attachments</td><td>${built.attachmentCount} employee submission files for today</td></tr>
        </table>
        <div style="margin-top:16px">${downloadBlock}</div>
        ${countsHtml}
      </div>
      <div style="padding:16px 0;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px">
        Sent by NexTask &middot; test-e2e-backup.mjs &middot; ${now.toISOString()}
      </div>
    </div>`;

  const payload = {
    from: RESEND_FROM,
    to: [TEST_EMAIL],
    subject: `NexTask Backup — ${now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
    html,
    ...(tooBig ? {} : { attachments: [{ filename: built.fileName, content: zipBuf.toString("base64") }] }),
  };

  info(`Sending via Resend (attached=${!tooBig}) to ${TEST_EMAIL}…`);
  const { status, body: res } = await resendSend(payload);

  if (status !== 200 && status !== 201) {
    throw new Error(`Resend API returned ${status}: ${JSON.stringify(res)}`);
  }
  ok(`Email sent — messageId: ${res.id}`);
  info(`To:       ${TEST_EMAIL}`);
  info(`Subject:  ${payload.subject}`);
  info(`Attached: ${!tooBig} (${sizeMB} MB)`);

  return res.id;
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 3: Auto-backup logic (mirrors /api/backups/auto)
// ════════════════════════════════════════════════════════════════════════════
async function testAutoBackup(today) {
  section("TEST 3 — Auto-Backup Logic  (/api/backups/auto)");

  // Read work_settings
  const { data: ws, error: wsErr } = await sb.from("work_settings").select("auto_backup_enabled,auto_backup_email,auto_backup_time,last_auto_backup_date").eq("id", true).maybeSingle();
  if (wsErr) throw new Error(wsErr.message);

  info(`auto_backup_enabled:    ${ws?.auto_backup_enabled}`);
  info(`auto_backup_email:      ${ws?.auto_backup_email || "(not set)"}`);
  info(`auto_backup_time:       ${ws?.auto_backup_time || "22:00"}`);
  info(`last_auto_backup_date:  ${ws?.last_auto_backup_date || "(never)"}`);

  if (!ws?.auto_backup_enabled) {
    info(`⏭  Auto-backup is disabled — forcing a one-off run for this test (not marking last_auto_backup_date)`);
  } else if (ws?.last_auto_backup_date === today) {
    info(`⏭  Auto-backup already ran today (${today}) — forcing another run for test only`);
  }

  // Run regardless of settings for test purposes — but do NOT update last_auto_backup_date
  // so we don't corrupt the real schedule.
  info("Running backup (forced for test — schedule check bypassed)…");
  const id = `bk_${randomUUID().slice(0, 8)}`;
  await sb.from("backup_logs").insert({
    id, admin_id: null, file_name: "(pending)", file_path: "(pending)",
    size_bytes: 0, started_at: new Date().toISOString(), completed_at: null, status: "running",
  });

  let built;
  try {
    built = await buildZip({ triggeredBy: "auto-cron:test-script", attachmentsForDate: today, label: "AUTO TEST" });
    await sb.from("backup_logs").update({
      file_name: built.fileName, file_path: built.storagePath,
      size_bytes: built.buf.length, completed_at: new Date().toISOString(), status: "completed",
    }).eq("id", id);
  } catch (e) {
    await sb.from("backup_logs").update({ completed_at: new Date().toISOString(), status: "failed", file_name: `(failed) ${e.message.slice(0, 80)}` }).eq("id", id);
    throw e;
  }

  ok(`Auto-backup completed — ${built.fileName} (${mb(built.buf.length)} MB)`);

  // Email if configured — override to TEST_EMAIL for this test
  const emailTarget = TEST_EMAIL; // always send to our test address
  const { data: zipData } = await sb.storage.from(BACKUP_BUCKET).download(built.storagePath);
  const zipBuf = Buffer.from(await zipData.arrayBuffer());
  const tooBig = zipBuf.length > MAX_ATTACH_BYTES;
  let signedUrl = null;
  if (tooBig) {
    const { data: s } = await sb.storage.from(BACKUP_BUCKET).createSignedUrl(built.storagePath, 24 * 60 * 60);
    signedUrl = s?.signedUrl ?? null;
  }

  const now = new Date();
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
      <div style="padding:20px 0;border-bottom:2px solid #0f172a">
        <h1 style="margin:0;font-size:18px">NexTask Auto Backup</h1>
        <p style="margin:6px 0 0;color:#64748b;font-size:14px">Scheduled daily backup completed.</p>
      </div>
      <div style="padding:16px 0">
        <p style="margin:0 0 6px;font-size:14px"><strong>File:</strong> ${built.fileName}</p>
        <p style="margin:0 0 6px;font-size:14px"><strong>Size:</strong> ${mb(built.buf.length)} MB</p>
        <p style="margin:0 0 6px;font-size:14px"><strong>Attachments:</strong> ${built.attachmentCount} employee submission files for today</p>
        <p style="margin:0 0 16px;font-size:14px"><strong>Completed:</strong> ${now.toLocaleString()}</p>
        ${tooBig && signedUrl ? `<p><a href="${signedUrl}" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Download backup</a></p>` : `<p style="color:#16a34a;font-size:13px">✓ ZIP attached (${mb(zipBuf.length)} MB)</p>`}
      </div>
      <div style="padding:14px 0;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px">
        Sent automatically by NexTask &middot; ${now.toISOString()}
      </div>
    </div>`;

  info(`Sending auto-backup email to ${emailTarget}…`);
  const { status, body: res } = await resendSend({
    from: RESEND_FROM,
    to: [emailTarget],
    subject: `NexTask Auto Backup — ${now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
    html,
    ...(tooBig ? {} : { attachments: [{ filename: built.fileName, content: zipBuf.toString("base64") }] }),
  });

  if (status !== 200 && status !== 201) {
    throw new Error(`Resend API returned ${status}: ${JSON.stringify(res)}`);
  }
  ok(`Auto-backup email sent — messageId: ${res.id}`);
  info(`To: ${emailTarget}`);

  return { id, built };
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
(async () => {
  const today = new Date().toISOString().slice(0, 10);
  const results = { manualId: null, autoId: null, emailMessageId: null, errors: [] };

  console.log("\n" + "═".repeat(52));
  console.log("  NexTask E2E Backup Test Suite");
  console.log(`  Date: ${today}  |  Email: ${TEST_EMAIL}`);
  console.log("═".repeat(52));

  // ── Test 1: Manual backup ───────────────────────────────────────────────
  try {
    const { id, built } = await testManualBackup(today);
    results.manualId = id;

    // ── Test 2: Email the manual backup ──────────────────────────────────
    try {
      results.emailMessageId = await testEmailBackup(built);
    } catch (e) {
      fail(`Email test failed: ${e.message}`);
      results.errors.push(`Email: ${e.message}`);
    }
  } catch (e) {
    fail(`Manual backup failed: ${e.message}`);
    results.errors.push(`Manual: ${e.message}`);
  }

  // ── Test 3: Auto backup ─────────────────────────────────────────────────
  try {
    const { id } = await testAutoBackup(today);
    results.autoId = id;
  } catch (e) {
    fail(`Auto backup failed: ${e.message}`);
    results.errors.push(`Auto: ${e.message}`);
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  section("SUMMARY");
  if (results.errors.length === 0) {
    console.log("\n  ✅  ALL TESTS PASSED\n");
  } else {
    console.log("\n  ⚠️  SOME TESTS FAILED:\n");
    results.errors.forEach(e => console.log(`     - ${e}`));
  }
  console.log(`  Manual backup ID:   ${results.manualId ?? "—"}`);
  console.log(`  Auto backup ID:     ${results.autoId ?? "—"}`);
  console.log(`  Email message ID:   ${results.emailMessageId ?? "—"}`);
  console.log(`  Email sent to:      ${TEST_EMAIL}`);
  console.log(`\n  Check backup_logs table in Supabase to confirm entries.`);
  console.log("═".repeat(52) + "\n");

  if (results.errors.length > 0) process.exit(1);
})();
