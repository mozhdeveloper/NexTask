// Seeds a real submission with 4 attachments (pdf, docx, xlsx, csv), runs the
// backup pipeline locally (same logic as src/lib/backup/build.ts), then lists
// the resulting ZIP layout. Cleans up after itself.

import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";

const SUPABASE_URL = "https://wydphvbdyyxryxeqdbxk.supabase.co";
const SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5ZHBodmJkeXl4cnl4ZXFkYnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA0MTEyNCwiZXhwIjoyMDk0NjE3MTI0fQ.Ix9PaviqX7rMlIEu2mIg1jwpZmuL5fT2iFz6e9cyzuY";

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const today = new Date().toISOString().slice(0, 10);
const subId = "verif_" + Math.random().toString(36).slice(2, 10);
const attIds = [];
const storagePaths = [];

function sanitize(s) { return (s ?? "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "untitled"; }

async function seed() {
  const { data: users } = await sb.from("users").select("id,name,email,role,job_title,department_id").limit(1);
  const { data: types } = await sb.from("submission_types").select("id,name").eq("is_active", true).limit(1);
  if (!users?.length || !types?.length) throw new Error("Need user + submission_type");
  const user = users[0], type = types[0];
  console.log(`Seeding: ${user.name} / ${type.name}`);

  const { error: subErr } = await sb.from("submissions").insert({
    id: subId, user_id: user.id, submission_type_id: type.id, date: today,
    work_summary: "VERIFICATION RUN — checks per-employee folder layout in backup ZIP",
    tasks_details: "- Verify employees/<name>/<date>__<type>/ structure\n- Verify description.json\n- Verify 1:1 file copies",
    status: "submitted", version_number: 1, submitted_at: new Date().toISOString(),
  });
  if (subErr) throw new Error("submission insert: " + subErr.message);

  const files = [
    { name: "report.pdf",     mime: "application/pdf",                                                          data: Buffer.from("%PDF-1.4 dummy-content-for-verification\n") },
    { name: "task-list.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  data: Buffer.from("PK\u0003\u0004 dummy-docx-content") },
    { name: "metrics.xlsx",   mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",        data: Buffer.from("PK\u0003\u0004 dummy-xlsx-content") },
    { name: "data.csv",       mime: "text/csv",                                                                 data: Buffer.from("name,score\nAlice,95\nBob,88\n") },
  ];
  for (const f of files) {
    const path = `${user.id}/${subId}/${f.name}`;
    const { error: upErr } = await sb.storage.from("submissions").upload(path, f.data, { contentType: f.mime, upsert: true });
    if (upErr) throw new Error(`upload ${f.name}: ${upErr.message}`);
    storagePaths.push(path);
    const attId = "att_" + Math.random().toString(36).slice(2, 10);
    const { error: attErr } = await sb.from("attachments").insert({
      id: attId, submission_id: subId, storage_path: path, stored_name: f.name, original_name: f.name, mime: f.mime, size_bytes: f.data.length,
    });
    if (attErr) throw new Error(`attachment insert ${f.name}: ${attErr.message}`);
    attIds.push(attId);
  }
  console.log(`  → ${files.length} files uploaded (pdf, docx, xlsx, csv)`);
}

async function buildBackup(targetDate) {
  const zip = new JSZip();
  const tables = ["users","departments","submission_types","submissions","attachments"];
  const snap = {};
  for (const t of tables) {
    const { data, error } = await sb.from(t).select("*");
    if (error) throw new Error(`read ${t}: ${error.message}`);
    snap[t] = data ?? [];
  }
  zip.file("data.json", JSON.stringify(snap, null, 2));

  const usersById = new Map(snap.users.map(u => [u.id, u]));
  const deptsById = new Map(snap.departments.map(d => [d.id, d]));
  const typesById = new Map(snap.submission_types.map(t => [t.id, t]));
  const attBySub = new Map();
  for (const a of snap.attachments) {
    if (!attBySub.has(a.submission_id)) attBySub.set(a.submission_id, []);
    attBySub.get(a.submission_id).push(a);
  }

  const targetSubs = snap.submissions.filter(s => s.date === targetDate);
  const queue = [];
  for (const sub of targetSubs) {
    const user = usersById.get(sub.user_id);
    if (!user) continue;
    const dept = user.department_id ? deptsById.get(user.department_id) : null;
    const type = sub.submission_type_id ? typesById.get(sub.submission_type_id) : null;
    const folder = `employees/${sanitize(user.name)}/${sub.date}__${sanitize(type?.name ?? "submission")}`;

    const atts = (attBySub.get(sub.id) ?? []).filter(a => a.storage_path);
    zip.file(`${folder}/description.json`, JSON.stringify({
      submissionId: sub.id, date: sub.date,
      employee: { id: user.id, name: user.name, email: user.email, role: user.role, jobTitle: user.job_title, department: dept?.name ?? null },
      submissionType: type?.name ?? null,
      status: sub.status, locked: sub.locked ?? false, submittedAt: sub.submitted_at, versionNumber: sub.version_number ?? 1,
      taskDescription: { workSummary: sub.work_summary ?? "", tasksDetails: sub.tasks_details ?? "" },
      files: atts.map(a => ({ originalName: a.original_name, sizeBytes: a.size_bytes, mime: a.mime })),
    }, null, 2));

    for (const a of atts) {
      queue.push({ folder, fileName: sanitize(a.original_name), storage_path: a.storage_path });
    }
  }
  for (const q of queue) {
    const { data, error } = await sb.storage.from("submissions").download(q.storage_path);
    if (error || !data) { console.log(`  ⚠ SKIP ${q.storage_path}: ${error?.message}`); continue; }
    zip.file(`${q.folder}/${q.fileName}`, Buffer.from(await data.arrayBuffer()));
  }
  return zip;
}

async function inspect(zip) {
  console.log("\n═══════ ZIP layout ═══════");
  const paths = Object.keys(zip.files).filter(p => !zip.files[p].dir).sort();
  for (const p of paths) {
    const size = (await zip.file(p).async("uint8array")).byteLength;
    console.log(`  ${p}  (${size} bytes)`);
  }

  const descPath = paths.find(p => p.endsWith("description.json") && p.startsWith("employees/") && p.includes(subId));
  if (descPath) {
    console.log(`\n═══════ ${descPath} ═══════`);
    console.log(await zip.file(descPath).async("string"));
  }
}

async function cleanup() {
  console.log("\nCleaning up…");
  for (const id of attIds) await sb.from("attachments").delete().eq("id", id);
  await sb.from("submissions").delete().eq("id", subId);
  for (const p of storagePaths) await sb.storage.from("submissions").remove([p]);
  console.log("  → done");
}

(async () => {
  try {
    await seed();
    const zip = await buildBackup(today);
    await inspect(zip);
    console.log("\n✅ Verified: backup ZIP contains per-employee folders with description.json + original files (1:1).");
  } catch (e) {
    console.error("FAILED:", e.message);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
})();
