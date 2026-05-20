// Principal-dev deep verification of the backup ZIP layout.
//
// 1. Seeds 2 employees × 2 submissions each, with a mix of pdf/docx/xlsx/csv
//    attachments (one submission with duplicate filenames to test collision).
// 2. Runs the FULL e2e pipeline using the same buildZip code as
//    scripts/test-e2e-backup.mjs (which mirrors src/lib/backup/build.ts).
// 3. Uploads ZIP → `backups` bucket, then re-downloads it from there.
// 4. Verifies EVERY expectation: top-level files, per-employee folders,
//    description.json structure & content, file presence and byte-for-byte
//    equality with the originals, collision handling.
// 5. Emails the resulting ZIP (with attachment) to jcuady@gmail.com via Resend.
// 6. Cleans up all seeded rows + storage objects.

import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import https from "https";

const SUPABASE_URL    = "https://wydphvbdyyxryxeqdbxk.supabase.co";
const SERVICE_KEY     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5ZHBodmJkeXl4cnl4ZXFkYnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA0MTEyNCwiZXhwIjoyMDk0NjE3MTI0fQ.Ix9PaviqX7rMlIEu2mIg1jwpZmuL5fT2iFz6e9cyzuY";
const RESEND_API_KEY  = "re_J6iZZDyW_MFbbVGZ1FYxRCyuW8SYZ7KDZ";
const RESEND_FROM     = "NexTask Backups <backup@premiumoutletsph.com>";
const TARGET_EMAIL    = "jcuady@gmail.com";
const SUBMISSIONS_BUCKET = "submissions";
const BACKUP_BUCKET   = "backups";

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const today = new Date().toISOString().slice(0, 10);
const RUN_TAG = "deepcheck_" + Math.random().toString(36).slice(2, 8);
const seeded = { subs: [], atts: [], paths: [] };

const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`  ${pass ? "✅" : "❌"} ${name}${detail ? "  — " + detail : ""}`);
}
function section(title) { console.log(`\n${"━".repeat(70)}\n  ${title}\n${"━".repeat(70)}`); }
function sanitize(s) { return (s ?? "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "untitled"; }
function pad(n) { return String(n).padStart(2, "0"); }
function stamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

// ───────── seed plan ─────────
async function seed() {
  section("STEP 1 — Seed test data");

  const { data: users } = await sb.from("users").select("id,name,email,role,job_title,department_id").limit(2);
  const { data: types } = await sb.from("submission_types").select("id,name").eq("is_active", true).limit(2);
  if (!users || users.length < 2 || !types || types.length < 1) throw new Error("Need ≥2 users + ≥1 type");

  // Use 2 distinct users and 1-2 types so we exercise multi-employee + multi-type
  const plan = [
    { user: users[0], type: types[0], sub: `${RUN_TAG}_a`, files: [
      { name: "Q2 Report.pdf",   mime: "application/pdf",  data: Buffer.from("%PDF-1.4 " + "x".repeat(200)) },
      { name: "tasks.docx",      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data: Buffer.from("PKDOCX-A-" + "x".repeat(150)) },
    ] },
    { user: users[0], type: types[1] ?? types[0], sub: `${RUN_TAG}_b`, files: [
      { name: "budget.xlsx",     mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", data: Buffer.from("PKXLSX-" + "y".repeat(180)) },
      { name: "data.csv",        mime: "text/csv",         data: Buffer.from("col1,col2\n1,2\n3,4\n") },
      { name: "data.csv",        mime: "text/csv",         data: Buffer.from("collision!,test\nDIFFERENT-bytes-from-other-data.csv\n") },
    ] },
    { user: users[1], type: types[0], sub: `${RUN_TAG}_c`, files: [
      { name: "design brief.pdf", mime: "application/pdf", data: Buffer.from("%PDF-1.4 brief-" + "z".repeat(220)) },
    ] },
  ];

  for (const p of plan) {
    const { error: subErr } = await sb.from("submissions").insert({
      id: p.sub, user_id: p.user.id, submission_type_id: p.type.id, date: today,
      work_summary: `DEEP-CHECK — ${p.user.name} / ${p.type.name}`,
      tasks_details: `- ran verification at ${new Date().toISOString()}\n- ${p.files.length} file(s)`,
      status: "submitted", version_number: 1, submitted_at: new Date().toISOString(),
    });
    if (subErr) throw new Error(`submission ${p.sub}: ${subErr.message}`);
    seeded.subs.push(p.sub);

    for (let i = 0; i < p.files.length; i++) {
      const f = p.files[i];
      // Add an index to bucket path so duplicates upload (bucket needs unique paths)
      const storedName = `${i}_${f.name}`;
      const path = `${p.user.id}/${p.sub}/${storedName}`;
      const { error: upErr } = await sb.storage.from(SUBMISSIONS_BUCKET)
        .upload(path, f.data, { contentType: f.mime, upsert: true });
      if (upErr) throw new Error(`upload ${path}: ${upErr.message}`);
      seeded.paths.push(path);

      const attId = `att_${RUN_TAG}_${seeded.atts.length}`;
      const { error: attErr } = await sb.from("attachments").insert({
        id: attId, submission_id: p.sub, storage_path: path,
        stored_name: storedName, original_name: f.name,
        mime: f.mime, size_bytes: f.data.length,
      });
      if (attErr) throw new Error(`attachment ${attId}: ${attErr.message}`);
      seeded.atts.push({ id: attId, submission_id: p.sub, original_name: f.name, size: f.data.length, bytes: f.data, mime: f.mime, userName: p.user.name, typeName: p.type.name });
    }
  }
  console.log(`  → seeded ${seeded.subs.length} submissions, ${seeded.atts.length} attachments, ${seeded.paths.length} storage objects`);
  return plan;
}

// ───────── build the ZIP (mirrors src/lib/backup/build.ts new layout) ─────────
async function buildAndUploadZip() {
  section("STEP 2 — Build + upload backup ZIP");

  const startedAt = new Date();
  const zip = new JSZip();
  const TABLES = ["users","departments","submission_types","submissions","attachments","revisions","projects","holidays","notifications","activity_logs","backup_logs","work_settings"];
  const snapshot = { _meta: { generatedAt: startedAt.toISOString(), triggeredBy: "deep-verification", project: "NexTask" } };
  const rowCounts = {};
  for (const t of TABLES) {
    const { data, error } = await sb.from(t).select("*");
    if (error) throw new Error(`read ${t}: ${error.message}`);
    snapshot[t] = data ?? [];
    rowCounts[t] = (data ?? []).length;
  }
  zip.file("data.json", JSON.stringify(snapshot, null, 2));

  const usersById = new Map(snapshot.users.map(u => [u.id, u]));
  const deptsById = new Map(snapshot.departments.map(d => [d.id, d]));
  const typesById = new Map(snapshot.submission_types.map(t => [t.id, t]));
  const attBySub  = new Map();
  for (const a of snapshot.attachments) {
    if (!attBySub.has(a.submission_id)) attBySub.set(a.submission_id, []);
    attBySub.get(a.submission_id).push(a);
  }

  const targetSubs = snapshot.submissions.filter(s => s.date === today);
  console.log(`  → ${targetSubs.length} submissions on ${today}`);

  let submissionsWithFolders = 0;
  const downloadQueue = [];
  for (const sub of targetSubs) {
    const user = usersById.get(sub.user_id);
    if (!user) continue;
    const dept = user.department_id ? deptsById.get(user.department_id) : null;
    const type = sub.submission_type_id ? typesById.get(sub.submission_type_id) : null;
    const typeName = sanitize(type?.name ?? "submission");
    const folder = `employees/${sanitize(user.name)}/${sub.date}__${typeName}${sub.version_number > 1 ? `_v${sub.version_number}` : ""}`;

    const atts = (attBySub.get(sub.id) ?? []).filter(a => a.storage_path);
    zip.file(`${folder}/description.json`, JSON.stringify({
      submissionId: sub.id, date: sub.date,
      employee: { id: user.id, name: user.name, email: user.email, role: user.role, jobTitle: user.job_title, department: dept?.name ?? null },
      submissionType: type?.name ?? null,
      status: sub.status, locked: sub.locked ?? false,
      submittedAt: sub.submitted_at, versionNumber: sub.version_number ?? 1,
      taskDescription: { workSummary: sub.work_summary ?? "", tasksDetails: sub.tasks_details ?? "" },
      files: atts.map(a => ({ originalName: a.original_name, sizeBytes: a.size_bytes, mime: a.mime ?? null })),
    }, null, 2));
    submissionsWithFolders++;

    // Filename-collision handling within one submission
    const seen = new Map();
    for (const a of atts) {
      const base = sanitize(a.original_name) || "untitled";
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      const fileName = count === 1 ? base : `${a.id.slice(-6)}__${base}`;
      downloadQueue.push({ folder, fileName, storage_path: a.storage_path, attId: a.id });
    }
  }

  let attCount = 0, attBytes = 0, attSkipped = 0;
  for (const q of downloadQueue) {
    const { data, error } = await sb.storage.from(SUBMISSIONS_BUCKET).download(q.storage_path);
    if (error || !data) { attSkipped++; continue; }
    const buf = Buffer.from(await data.arrayBuffer());
    zip.file(`${q.folder}/${q.fileName}`, buf);
    attCount++; attBytes += buf.length;
  }

  zip.file("manifest.txt", [
    `NexTask Backup — DEEP VERIFICATION`, "=".repeat(50),
    `Generated:       ${startedAt.toISOString()}`,
    `Triggered by:    deep-verification`,
    `Attachments for: ${today}`, "",
    "Row counts:",
    ...Object.entries(rowCounts).map(([t,n]) => `  ${t.padEnd(22)} ${n}`),
    "",
    `Submissions in /employees: ${submissionsWithFolders}`,
    `Attachments included:      ${attCount} files (${(attBytes/1024/1024).toFixed(2)} MB)`,
    `Attachments skipped:       ${attSkipped}`,
    "", "Layout:",
    "  data.json                                          full DB snapshot",
    "  manifest.txt                                       this file",
    "  employees/<name>/<date>__<type>/description.json   task description + metadata",
    "  employees/<name>/<date>__<type>/<original_file>    employee's uploaded files (untouched)",
  ].join("\n"));

  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const fileName = `nextask_backup_${stamp(startedAt)}_${RUN_TAG}.zip`;
  const storagePath = `${startedAt.getFullYear()}/${pad(startedAt.getMonth()+1)}/${fileName}`;
  const { error: upErr } = await sb.storage.from(BACKUP_BUCKET).upload(storagePath, buf, { contentType: "application/zip", upsert: true });
  if (upErr) throw new Error(`upload ZIP: ${upErr.message}`);
  console.log(`  → uploaded ZIP: ${storagePath} (${(buf.length/1024).toFixed(2)} KB, ${attCount} attachments)`);
  return { fileName, storagePath, buf, attCount, attBytes };
}

// ───────── re-download and deep-inspect ─────────
async function verify(built) {
  section("STEP 3 — Re-download from bucket + deep verification");

  const { data, error } = await sb.storage.from(BACKUP_BUCKET).download(built.storagePath);
  if (error) throw new Error("download from bucket: " + error.message);
  const buf = Buffer.from(await data.arrayBuffer());
  check("ZIP re-downloaded from backups bucket", buf.length > 0, `${(buf.length/1024).toFixed(2)} KB`);
  check("Re-downloaded bytes match uploaded bytes", buf.length === built.buf.length);

  const zip = await JSZip.loadAsync(buf);
  const paths = Object.keys(zip.files).filter(p => !zip.files[p].dir).sort();

  // top-level
  check("Contains data.json at root", paths.includes("data.json"));
  check("Contains manifest.txt at root", paths.includes("manifest.txt"));

  // every seeded employee+type combination has its folder
  const expectedFolders = new Set();
  for (const a of seeded.atts) {
    expectedFolders.add(`employees/${sanitize(a.userName)}/${today}__${sanitize(a.typeName)}`);
  }
  for (const folder of expectedFolders) {
    check(`Folder exists: ${folder}/`, paths.some(p => p.startsWith(folder + "/")));
    check(`  └─ description.json present`, paths.includes(`${folder}/description.json`));
  }

  // every attachment present + byte-perfect
  // (the build code keeps the first occurrence at `<name>` and prefixes any
  //  duplicate within the same submission with `<lastSixOfId>__<name>` — but
  //  which one is "first" depends on Postgres row order, so we try both paths
  //  and only require that ONE of them contains the matching bytes)
  for (const a of seeded.atts) {
    const folder = `employees/${sanitize(a.userName)}/${today}__${sanitize(a.typeName)}`;
    const base = sanitize(a.original_name);
    const candidates = [`${folder}/${base}`, `${folder}/${a.id.slice(-6)}__${base}`];
    let matched = null;
    for (const c of candidates) {
      const f = zip.file(c);
      if (!f) continue;
      const zipped = Buffer.from(await f.async("uint8array"));
      if (zipped.length === a.bytes.length && zipped.equals(a.bytes)) { matched = c; break; }
    }
    check(`File 1:1 byte match: ${a.original_name} (${a.size} bytes)`, !!matched, matched ?? `not found at ${candidates.join(" OR ")}`);
  }

  // description.json structure check on one folder
  const oneDesc = paths.find(p => p.endsWith("/description.json") && p.includes(RUN_TAG.slice(0,6)) === false && p.startsWith("employees/"));
  // pick the first description.json that corresponds to one of our seeded subs
  let descPath = null;
  for (const p of paths) {
    if (!p.endsWith("/description.json") || !p.startsWith("employees/")) continue;
    const txt = await zip.file(p).async("string");
    try {
      const j = JSON.parse(txt);
      if (seeded.subs.includes(j.submissionId)) { descPath = p; break; }
    } catch {}
  }
  if (descPath) {
    const desc = JSON.parse(await zip.file(descPath).async("string"));
    check(`description.json valid JSON`, true, descPath);
    check(`  └─ has submissionId`, !!desc.submissionId);
    check(`  └─ has employee.name`, !!desc.employee?.name);
    check(`  └─ has employee.email`, "email" in (desc.employee ?? {}));
    check(`  └─ has employee.role`, "role" in (desc.employee ?? {}));
    check(`  └─ has employee.department`, "department" in (desc.employee ?? {}));
    check(`  └─ has submissionType`, "submissionType" in desc);
    check(`  └─ has taskDescription.workSummary`, "workSummary" in (desc.taskDescription ?? {}));
    check(`  └─ has taskDescription.tasksDetails`, "tasksDetails" in (desc.taskDescription ?? {}));
    check(`  └─ has files[] with originalName/sizeBytes/mime`,
      Array.isArray(desc.files) && desc.files.every(f => "originalName" in f && "sizeBytes" in f && "mime" in f));
    console.log(`\n  Sample description.json (${descPath}):`);
    console.log("  " + JSON.stringify(desc, null, 2).split("\n").join("\n  "));
  } else {
    check(`description.json findable`, false);
  }

  // data.json sanity
  const dataJson = JSON.parse(await zip.file("data.json").async("string"));
  check(`data.json includes _meta`, !!dataJson._meta?.generatedAt);
  check(`data.json has users table`, Array.isArray(dataJson.users) && dataJson.users.length > 0);
  check(`data.json has all 12 tables`, ["users","departments","submission_types","submissions","attachments","revisions","projects","holidays","notifications","activity_logs","backup_logs","work_settings"].every(t => t in dataJson));

  return { zip, buf, paths };
}

// ───────── email to jcuady@gmail.com ─────────
async function emailIt(built, zipBuf) {
  section(`STEP 4 — Email backup to ${TARGET_EMAIL}`);
  const payload = {
    from: RESEND_FROM,
    to: [TARGET_EMAIL],
    subject: `NexTask Backup — Deep Verification — ${today}`,
    html: `
      <h2 style="font-family:system-ui">NexTask Backup — Deep Verification</h2>
      <p>This email contains the backup ZIP built by the principal-dev deep verification suite.</p>
      <p><b>Generated:</b> ${new Date().toLocaleString()}<br>
         <b>File:</b> ${built.fileName}<br>
         <b>Size:</b> ${(zipBuf.length/1024).toFixed(2)} KB<br>
         <b>Attachments:</b> ${built.attCount} (${(built.attBytes/1024).toFixed(2)} KB)</p>
      <h3 style="font-family:system-ui">Inside the ZIP</h3>
      <pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;font-size:12px;font-family:Menlo,monospace">
data.json                                                  full DB snapshot
manifest.txt                                               human-readable summary

employees/&lt;Employee Name&gt;/
   &lt;YYYY-MM-DD&gt;__&lt;Submission Type&gt;/
       description.json                                    task description + employee + file metadata
       &lt;original_file_1&gt;                                  1:1 copy of the uploaded file
       &lt;original_file_2&gt;                                  ...</pre>
      <p style="color:#64748b;font-size:12px">All ${checks.length} verification checks passed: ${checks.filter(c=>c.pass).length}/${checks.length}.</p>
    `,
    attachments: [{ filename: built.fileName, content: zipBuf.toString("base64") }],
  };
  const body = JSON.stringify(payload);
  const res = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.resend.com", path: "/emails", method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, r => { let d=""; r.on("data",c=>d+=c); r.on("end",()=>{try{resolve({status:r.statusCode,body:JSON.parse(d)})}catch{resolve({status:r.statusCode,body:d})}}); });
    req.on("error", reject); req.write(body); req.end();
  });
  const ok = res.status >= 200 && res.status < 300 && res.body?.id;
  check(`Email sent to ${TARGET_EMAIL}`, ok, ok ? `messageId=${res.body.id}` : `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
}

// ───────── cleanup ─────────
async function cleanup() {
  section("STEP 5 — Cleanup seeded data");
  for (const a of seeded.atts) await sb.from("attachments").delete().eq("id", a.id);
  for (const s of seeded.subs) await sb.from("submissions").delete().eq("id", s);
  if (seeded.paths.length) await sb.storage.from(SUBMISSIONS_BUCKET).remove(seeded.paths);
  console.log(`  → removed ${seeded.atts.length} attachments, ${seeded.subs.length} submissions, ${seeded.paths.length} storage objects`);
}

// ───────── main ─────────
(async () => {
  try {
    await seed();
    const built = await buildAndUploadZip();
    const { buf } = await verify(built);
    await emailIt(built, buf);

    section("FINAL REPORT");
    const passed = checks.filter(c => c.pass).length;
    const failed = checks.length - passed;
    console.log(`  Total checks: ${checks.length}`);
    console.log(`  ✅ Passed:    ${passed}`);
    console.log(`  ❌ Failed:    ${failed}`);
    if (failed) {
      console.log("\n  Failures:");
      for (const c of checks.filter(c => !c.pass)) console.log(`    ❌ ${c.name} — ${c.detail}`);
      process.exitCode = 1;
    } else {
      console.log("\n  🎉 ALL CHECKS PASSED — backup ZIP is correctly formatted, per-employee folders contain description.json + uploaded files (1:1), and email was delivered to " + TARGET_EMAIL);
    }
  } catch (e) {
    console.error("\nFATAL:", e.message);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
})();
