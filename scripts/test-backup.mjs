/**
 * End-to-end backup smoke test.
 * Run from the nextask-app directory:
 *   node scripts/test-backup.mjs
 *
 * Uses the service-role key directly (same as the API routes do via supabaseAdmin).
 * Does NOT require a running web server.
 */

import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";

const URL   = "https://wydphvbdyyxryxeqdbxk.supabase.co";
const KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUBMISSIONS_BUCKET = "submissions";
const BACKUP_BUCKET      = process.env.BACKUP_STORAGE_BUCKET ?? "backups";

if (!KEY) {
  console.error("❌  SUPABASE_SERVICE_ROLE_KEY not set. Run: node -r dotenv/config scripts/test-backup.mjs or set it manually.");
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

function stamp(d) {
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
function sanitize(s) {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

const TABLES = [
  "users","departments","submission_types","submissions","attachments",
  "revisions","projects","holidays","notifications","activity_logs",
  "backup_logs","work_settings",
];

async function run() {
  const startedAt = new Date();
  const today     = startedAt.toISOString().slice(0, 10);
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  NexTask Backup Smoke Test — ${startedAt.toLocaleString()}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // ── Step 1: Table snapshot ─────────────────────────────────────────────
  console.log("📋  [1/5] Snapshotting tables…");
  const zip = new JSZip();
  const snapshot = { _meta: { generatedAt: startedAt.toISOString(), project: "NexTask", test: true } };
  const rowCounts = {};
  for (const t of TABLES) {
    const { data, error } = await sb.from(t).select("*");
    if (error) throw new Error(`Table read failed [${t}]: ${error.message}`);
    snapshot[t] = data ?? [];
    rowCounts[t] = (data ?? []).length;
    process.stdout.write(`    ${t.padEnd(22)} ${rowCounts[t]} rows\n`);
  }
  zip.file("data.json", JSON.stringify(snapshot, null, 2));

  // ── Step 2: Collect attachments for today ─────────────────────────────
  console.log(`\n📎  [2/5] Collecting today's attachments (${today})…`);
  const usersById = new Map(snapshot.users.map(u => [u.id, u]));
  const subsById  = new Map(snapshot.submissions.map(s => [s.id, s]));
  const allAtts   = (snapshot.attachments ?? []).filter(a => a.storage_path);
  const todayAtts = allAtts.filter(a => {
    const sub = subsById.get(a.submission_id);
    return sub && sub.date === today;
  });
  console.log(`    ${allAtts.length} total attachments, ${todayAtts.length} for today`);

  // ── Step 3: Download attachments ──────────────────────────────────────
  console.log(`\n⬇️   [3/5] Downloading ${todayAtts.length} attachment(s) from '${SUBMISSIONS_BUCKET}' bucket…`);
  let attachmentCount = 0;
  let attachmentBytes = 0;
  const BATCH = 6;
  for (let i = 0; i < todayAtts.length; i += BATCH) {
    const slice = todayAtts.slice(i, i + BATCH);
    const results = await Promise.all(slice.map(async a => {
      try {
        const { data, error } = await sb.storage.from(SUBMISSIONS_BUCKET).download(a.storage_path);
        if (error || !data) return { a, ok: false, err: error?.message ?? "no data" };
        const buf = Buffer.from(await data.arrayBuffer());
        return { a, ok: true, buf };
      } catch (e) {
        return { a, ok: false, err: e.message };
      }
    }));
    for (const r of results) {
      if (!r.ok) {
        console.log(`    ⚠️  SKIP ${r.a.storage_path}: ${r.err}`);
        continue;
      }
      const sub    = subsById.get(r.a.submission_id);
      const user   = sub ? usersById.get(sub.user_id) : undefined;
      const folder = sanitize(user?.name ?? "unknown_user");
      const date   = sub?.date ?? "no-date";
      const name   = sanitize(r.a.original_name);
      zip.file(`attachments/${folder}/${date}__${name}`, r.buf);
      attachmentCount++;
      attachmentBytes += r.buf.length;
      console.log(`    ✓ ${folder}/${date}__${name} (${r.buf.length} bytes)`);
    }
  }
  if (todayAtts.length === 0) console.log("    (no attachments today — ZIP will contain only data.json + manifest)");

  // ── Step 4: Build ZIP ─────────────────────────────────────────────────
  console.log(`\n🗜️   [4/5] Compressing…`);
  const lines = [
    `NexTask Backup — SMOKE TEST`, `===========================================`,
    `Generated:       ${startedAt.toISOString()}`,
    `Triggered by:    smoke-test-script`,
    ``,
    `Row counts:`,
    ...Object.entries(rowCounts).map(([t,n]) => `  ${t.padEnd(22)} ${n}`),
    ``,
    `Attachments included: ${attachmentCount} (${(attachmentBytes/1024/1024).toFixed(2)} MB)`,
    `Attachments skipped:  ${todayAtts.length - attachmentCount}`,
    ``,
    `⚠  This file was generated by the smoke-test script. Not a production backup.`,
  ];
  zip.file("manifest.txt", lines.join("\n"));
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  console.log(`    ZIP size: ${(buf.length / 1024).toFixed(1)} KB`);

  // ── Step 5: Upload ────────────────────────────────────────────────────
  const fileName = `nextask_smoketest_${stamp(startedAt)}.zip`;
  const yearMonth = `${startedAt.getFullYear()}/${String(startedAt.getMonth()+1).padStart(2,"0")}`;
  const storagePath = `${yearMonth}/${fileName}`;
  console.log(`\n⬆️   [5/5] Uploading to '${BACKUP_BUCKET}' bucket at ${storagePath}…`);

  const { data: upData, error: upErr } = await sb.storage.from(BACKUP_BUCKET).upload(storagePath, buf, {
    contentType: "application/zip",
    upsert: true,
  });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
  console.log(`    ✓ Upload OK — path: ${upData.path}`);

  // ── Download it back to verify round-trip ─────────────────────────────
  console.log(`\n🔄   Verifying round-trip download…`);
  const { data: dl, error: dlErr } = await sb.storage.from(BACKUP_BUCKET).download(storagePath);
  if (dlErr || !dl) throw new Error(`Download verification failed: ${dlErr?.message}`);
  const dlBuf = Buffer.from(await dl.arrayBuffer());
  if (dlBuf.length !== buf.length) throw new Error(`Size mismatch: uploaded ${buf.length}, got ${dlBuf.length}`);
  console.log(`    ✓ Download OK — ${dlBuf.length} bytes match`);

  // ── Signed URL ────────────────────────────────────────────────────────
  console.log(`\n🔗   Generating signed URL (5 min expiry)…`);
  const { data: signed, error: signErr } = await sb.storage.from(BACKUP_BUCKET).createSignedUrl(storagePath, 300);
  if (signErr || !signed?.signedUrl) throw new Error(signErr?.message ?? "Failed to sign");
  console.log(`    ✓ ${signed.signedUrl.slice(0, 80)}…`);

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  ✅  SMOKE TEST PASSED`);
  console.log(`      File: ${fileName}`);
  console.log(`      Size: ${(buf.length/1024).toFixed(1)} KB`);
  console.log(`      Attachments: ${attachmentCount}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Clean up test file so it doesn't pollute backup history
  await sb.storage.from(BACKUP_BUCKET).remove([storagePath]);
  console.log("🧹  Test file cleaned up.\n");
}

run().catch(e => {
  console.error("\n❌  SMOKE TEST FAILED:", e.message, "\n");
  process.exit(1);
});
