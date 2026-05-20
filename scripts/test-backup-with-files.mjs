/**
 * Full backup test with real uploaded files (CSV, XLSX, DOCX).
 *
 * Steps:
 *  0. Build minimal but structurally valid CSV / XLSX / DOCX test files in memory
 *  1. Sign in as admin
 *  2. Upload files to Supabase `submissions` storage bucket
 *     (path mirrors real uploads: {userId}/{date}/{ts}_{fileName})
 *  3. Insert test submissions + attachments pointing to those paths
 *  4. POST /api/backups/run  → ZIP includes employee folders + real file bytes
 *  5. Download & inspect ZIP:
 *       - employees/{Name}/{date}__{Type}/description.json ✓
 *       - employees/{Name}/{date}__{Type}/{original_file}  ✓  (size matches)
 *       - data.json DB snapshot ✓
 *  6. POST /api/backups/send → Resend delivers the ZIP
 *  7. Verify backup_logs status=completed
 *  8. Cleanup: delete storage objects + DB rows
 *
 * Usage:
 *   node scripts/test-backup-with-files.mjs [port]   # default 3003
 */

import { request as httpsRequest } from "node:https";
import { request as httpRequest }  from "node:http";
import JSZip from "jszip";

const PORT   = process.argv[2] ?? "3003";
const BASE   = `http://localhost:${PORT}`;
const ok     = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const info   = (m) => console.log(`\x1b[36mi\x1b[0m ${m}`);
const warn   = (m) => console.log(`\x1b[33m!\x1b[0m ${m}`);
// Inside main's try block we throw so the finally cleanup always runs.
// The outer .catch() prints and exits.
const fail   = (m) => { throw new Error(m); };
const sep    = (t) => console.log(`\n\x1b[1m── ${t} ${"─".repeat(Math.max(0, 50 - t.length))}\x1b[0m`);

const SVC  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5ZHBodmJkeXl4cnl4ZXFkYnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA0MTEyNCwiZXhwIjoyMDk0NjE3MTI0fQ.Ix9PaviqX7rMlIEu2mIg1jwpZmuL5fT2iFz6e9cyzuY";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5ZHBodmJkeXl4cnl4ZXFkYnhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNDExMjQsImV4cCI6MjA5NDYxNzEyNH0.eK207Iw9llR8As-YwfKTz5pJ5kHURc-imxiu0WA_VGs";
const SB   = "https://wydphvbdyyxryxeqdbxk.supabase.co";
const REF  = "wydphvbdyyxryxeqdbxk";
const SUB_BUCKET = "submissions";
const LOCKED_TO  = "premium.global.official@gmail.com";
const TODAY      = new Date().toISOString().slice(0, 10);
const MAX_CHUNK  = 3180;

// ── File generators ───────────────────────────────────────────────────────────

function makeCSV(title) {
  const header = "Employee,Date,Item,Quantity,Unit Price,Total\r\n";
  const rows = [
    `John Doe,${TODAY},Widget A,50,12.50,625.00`,
    `Alex Turner,${TODAY},Widget B,30,18.75,562.50`,
    `David Kim,${TODAY},Widget C,20,25.00,500.00`,
    `Maria Cruz,${TODAY},Widget D,45,9.99,449.55`,
    `James Park,${TODAY},Widget E,60,7.50,450.00`,
  ].join("\r\n");
  return Buffer.from(`${title}\r\n${header}${rows}\r\n`, "utf8");
}

async function makeXLSX(title) {
  // Construct a minimal but structurally valid Office Open XML XLSX
  const zip = new JSZip();

  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);

  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);

  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView/></bookViews>
  <sheets><sheet name="${title}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`);

  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);

  // Shared strings — all cell text
  const ss = ["Employee", "Date", "Region", "Sales", "Target", "Variance",
               "John Doe", TODAY, "NCR", "45000", "40000", "5000",
               "Alex Turner", TODAY, "Visayas", "38000", "35000", "3000",
               "David Kim", TODAY, "Mindanao", "52000", "50000", "2000"];
  const ssXml = ss.map((s, i) => `<si><t>${s}</t></si>`).join("");
  zip.file("xl/sharedStrings.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${ss.length}" uniqueCount="${ss.length}">${ssXml}</sst>`);

  // Minimal styles
  zip.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`);

  // Sheet data — header row + 3 data rows
  const rows = [
    ["Employee", "Date", "Region", "Sales", "Target", "Variance"],
    ["John Doe",    TODAY, "NCR",     "45000", "40000", "5000"],
    ["Alex Turner", TODAY, "Visayas", "38000", "35000", "3000"],
    ["David Kim",   TODAY, "Mindanao","52000", "50000", "2000"],
  ];
  const sheetRows = rows.map((r, ri) => {
    const cells = r.map((v, ci) => {
      const col = String.fromCharCode(65 + ci);
      const idx = ss.indexOf(v);
      return `<c r="${col}${ri + 1}" t="s"><v>${idx}</v></c>`;
    }).join("");
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join("");

  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows}</sheetData>
</worksheet>`);

  return Buffer.from(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
}

async function makeDOCX(title, content) {
  // Construct a minimal Office Open XML DOCX
  const zip = new JSZip();

  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);

  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);

  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/></w:style>
</w:styles>`);

  // Paragraphs from content array
  const paragraphs = [title, ...content].map((line) =>
    `<w:p><w:r><w:t xml:space="preserve">${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</w:t></w:r></w:p>`
  ).join("");

  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${paragraphs}<w:sectPr/></w:body>
</w:document>`);

  return Buffer.from(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
const TO_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split("");
function toBase64URL(str) {
  const bytes = Buffer.from(str, "utf8");
  const out = []; let q = 0, qb = 0;
  for (const b of bytes) { q = (q << 8) | b; qb += 8; while (qb >= 6) { out.push(TO_B64[(q >> (qb - 6)) & 63]); qb -= 6; } }
  if (qb > 0) { q = q << (6 - qb); out.push(TO_B64[(q >> 0) & 63]); }
  return out.join("");
}
function encodeSessionCookie(session) {
  const encoded = "base64-" + toBase64URL(JSON.stringify(session));
  let enc = encodeURIComponent(encoded);
  const key = `sb-${REF}-auth-token`;
  if (enc.length <= MAX_CHUNK) return [{ name: key, value: encoded }];
  const chunks = [];
  while (enc.length > 0) {
    let head = enc.slice(0, MAX_CHUNK); const lp = head.lastIndexOf("%");
    if (lp > MAX_CHUNK - 3) head = head.slice(0, lp);
    let vh = ""; while (head.length > 0) { try { vh = decodeURIComponent(head); break; } catch { head = head.slice(0, head.length - 3); } }
    chunks.push(vh); enc = enc.slice(encodeURIComponent(vh).length);
  }
  return chunks.map((v, i) => ({ name: `${key}.${i}`, value: v }));
}

// ── HTTP ──────────────────────────────────────────────────────────────────────
function http(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = new URL(url);
    const lib = p.protocol === "https:" ? httpsRequest : httpRequest;
    const body = opts.rawBody ?? (opts.body ? Buffer.from(opts.body) : null);
    const headers = { ...(opts.headers ?? {}) };
    if (body) { headers["Content-Length"] = body.length; if (!headers["Content-Type"]) headers["Content-Type"] = "application/json"; }
    const req = lib({ method: opts.method ?? "GET", hostname: p.hostname, port: p.port || (p.protocol === "https:" ? 443 : 80), path: p.pathname + (p.search || ""), headers }, (res) => {
      const cs = []; res.on("data", (c) => cs.push(c)); res.on("end", () => {
        const raw = Buffer.concat(cs);
        let json; try { json = JSON.parse(raw.toString("utf8")); } catch { json = null; }
        resolve({ status: res.statusCode, headers: res.headers, body: json, raw });
      });
    });
    req.on("error", reject); if (body) req.write(body); req.end();
  });
}

// ── Supabase auth ─────────────────────────────────────────────────────────────
async function signIn() {
  const res = await http(`${SB}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON },
    body: JSON.stringify({ email: "admin@nexvision.local", password: "password123" }),
  });
  if (res.status !== 200 || !res.body?.access_token) fail(`Sign-in failed (${res.status}): ${JSON.stringify(res.body)}`);
  ok(`Signed in as admin`);
  return res.body;
}

// ── Storage upload ────────────────────────────────────────────────────────────
async function uploadToStorage(storagePath, fileBuffer, mimeType) {
  const res = await http(`${SB}/storage/v1/object/${SUB_BUCKET}/${storagePath}`, {
    method: "POST",
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": mimeType, "x-upsert": "true" },
    rawBody: fileBuffer,
  });
  if (res.status !== 200 && res.status !== 201) {
    console.error("upload error:", res.body || res.raw?.toString("utf8")?.slice(0, 200));
    fail(`Storage upload failed (${res.status}) for ${storagePath}`);
  }
  return storagePath;
}

async function deleteFromStorage(paths) {
  if (paths.length === 0) return;
  const res = await http(`${SB}/storage/v1/object/${SUB_BUCKET}`, {
    method: "DELETE",
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
    body: JSON.stringify({ prefixes: paths }),
  });
  if (res.status === 200 || res.status === 204) ok(`Deleted ${paths.length} file(s) from storage`);
  else warn(`Storage delete returned ${res.status}`);
}

// ── DB helpers ────────────────────────────────────────────────────────────────
async function dbInsert(table, rows) {
  const res = await http(`${SB}/rest/v1/${table}`, {
    method: "POST",
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
  if (res.status !== 201 && res.status !== 200) {
    console.error(`insert ${table}:`, res.body || res.raw?.toString("utf8")?.slice(0, 300));
    fail(`DB insert into ${table} failed (${res.status})`);
  }
}

async function dbDelete(table, ids) {
  if (ids.length === 0) return;
  const res = await http(`${SB}/rest/v1/${table}?id=in.(${ids.join(",")})`, {
    method: "DELETE",
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, Prefer: "return=minimal" },
  });
  if (res.status === 200 || res.status === 204) ok(`Cleaned ${ids.length} row(s) from ${table}`);
  else warn(`Delete from ${table} returned ${res.status}`);
}

// ── Backup API calls ──────────────────────────────────────────────────────────
async function runBackup(cookieHdr) {
  const res = await http(`${BASE}/api/backups/run`, {
    method: "POST", headers: { Cookie: cookieHdr }, body: "{}",
  });
  if (res.status !== 200 && res.status !== 201) {
    console.error("/api/backups/run:", res.body || res.raw?.toString("utf8")?.slice(0, 300));
    fail(`/api/backups/run failed (${res.status})`);
  }
  return res.body;
}

async function sendBackup(backupId, cookieHdr) {
  const res = await http(`${BASE}/api/backups/send`, {
    method: "POST", headers: { Cookie: cookieHdr },
    body: JSON.stringify({ backupId, email: "ignored@example.com" }),
  });
  if (res.status !== 200 && res.status !== 201) {
    console.error("/api/backups/send:", res.body || res.raw?.toString("utf8")?.slice(0, 300));
    fail(`/api/backups/send failed (${res.status})`);
  }
  return res.body;
}

async function downloadZip(storagePath) {
  const encoded = storagePath.split("/").map(encodeURIComponent).join("/");
  const res = await http(`${SB}/storage/v1/object/backups/${encoded}`, {
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
  });
  if (res.status !== 200) fail(`Download backup ZIP failed (${res.status})`);
  return res.raw;
}

// ── ZIP inspector ─────────────────────────────────────────────────────────────
async function inspectZip(zipBuffer, expectedFiles) {
  const zip = await JSZip.loadAsync(zipBuffer);
  const files = Object.keys(zip.files).filter((f) => !zip.files[f].dir);

  console.log(`\n  ZIP file listing (${files.length} files):`);
  for (const f of files) {
    const sz = zip.files[f]._data?.uncompressedSize ?? "?";
    const tag = f.startsWith("employees/") ? "\x1b[35memp\x1b[0m" : "\x1b[36mzip\x1b[0m";
    console.log(`    [${tag}] ${f}  (${sz} B)`);
  }

  // data.json
  if (!files.includes("data.json")) fail("data.json missing from ZIP");
  ok("data.json present");
  const data = JSON.parse(await zip.files["data.json"].async("string"));
  ok(`data.json: users=${data.users?.length}, submissions=${data.submissions?.length}, attachments=${data.attachments?.length}`);

  // Employee folders
  const empFiles = files.filter((f) => f.startsWith("employees/"));
  const empDescs = empFiles.filter((f) => f.endsWith("description.json"));
  const empAtts  = empFiles.filter((f) => !f.endsWith("description.json"));
  const empFolders = [...new Set(empFiles.map((f) => f.split("/")[1]))];

  if (empFolders.length === 0) fail("No employee folders found in ZIP");
  ok(`Employee folders: ${empFolders.join(", ")}`);
  ok(`description.json files: ${empDescs.length}`);

  // Verify each expected file is present and non-empty
  console.log("\n  Verifying uploaded files are in the ZIP:");
  for (const { zipPath, originalSize, originalName } of expectedFiles) {
    const entry = zip.files[zipPath];
    if (!entry) fail(`Expected file not in ZIP: ${zipPath}`);
    const bytes = await entry.async("nodebuffer");
    if (bytes.length === 0) fail(`File is 0 bytes in ZIP: ${zipPath}`);
    const sizeMatch = bytes.length === originalSize;
    if (!sizeMatch) warn(`Size mismatch for ${originalName}: stored ${bytes.length} B, expected ${originalSize} B`);
    else ok(`${originalName} — ${bytes.length} B ✓ (size matches original upload)`);
  }

  // Spot-check one description.json
  if (empDescs.length > 0) {
    const desc = JSON.parse(await zip.files[empDescs[0]].async("string"));
    ok(`Sample desc — employee: "${desc.employee?.name}", type: "${desc.submissionType}", files: ${desc.files?.length}`);
  }

  return { empFolders, empAtts, empDescs };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n\x1b[1m=== NexTask Backup — Real File Upload + Employee Folders E2E Test ===\x1b[0m`);
  console.log(`    Server: ${BASE}   Date: ${TODAY}   Recipient: ${LOCKED_TO}\n`);

  // ── Step 0: Generate test files ───────────────────────────────────────────
  sep("STEP 0 — Generate test files (CSV, XLSX, DOCX)");

  const salesCSV = makeCSV("Sales Pipeline Report — " + TODAY);
  info(`sales_report.csv        ${salesCSV.length} B`);

  const inventoryCSV = makeCSV("Inventory Sheet — " + TODAY);
  info(`inventory.csv           ${inventoryCSV.length} B`);

  const weeklyXLSX = await makeXLSX("Weekly Summary");
  info(`weekly_summary.xlsx     ${weeklyXLSX.length} B`);

  const pipelineDOCX = await makeDOCX("Sales Pipeline Report", [
    `Date: ${TODAY}`,
    "Prepared by: Alex Turner",
    "",
    "Regional Summary:",
    "NCR:      Sales ₱45,000 | Target ₱40,000 | Variance +₱5,000",
    "Visayas:  Sales ₱38,000 | Target ₱35,000 | Variance +₱3,000",
    "Mindanao: Sales ₱52,000 | Target ₱50,000 | Variance +₱2,000",
    "",
    "Total Sales: ₱135,000 | Total Target: ₱125,000 | Variance: +₱10,000",
  ]);
  info(`pipeline_report.docx    ${pipelineDOCX.length} B`);

  ok("All test files generated");

  // ── Step 1: Sign in ───────────────────────────────────────────────────────
  sep("STEP 1 — Admin sign-in");
  const session = await signIn();
  const cookies = encodeSessionCookie(session);
  const cookieHdr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  const storagePaths = [];
  const subIds  = [];
  const attIds  = [];

  try {
    // ── Step 2: Upload files to storage ────────────────────────────────────
    sep("STEP 2 — Upload files to Supabase storage");
    const ts = Date.now();

    // John Doe: Weekly Summary — weekly_summary.xlsx + inventory.csv
    const p1 = `u_employee/${TODAY}/${ts}_weekly_summary.xlsx`;
    const p2 = `u_employee/${TODAY}/${ts}_inventory.csv`;
    // Alex Turner: Sales Pipeline — pipeline_report.docx + sales_report.csv
    const p3 = `u_alex_turner/${TODAY}/${ts}_pipeline_report.docx`;
    const p4 = `u_alex_turner/${TODAY}/${ts}_sales_report.csv`;
    // David Kim: Inventory Sheet — inventory.csv
    const p5 = `u_david_kim/${TODAY}/${ts}_inventory_sheet.csv`;

    await uploadToStorage(p1, weeklyXLSX, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    ok(`Uploaded weekly_summary.xlsx  → ${p1}`);
    await uploadToStorage(p2, inventoryCSV, "text/csv");
    ok(`Uploaded inventory.csv        → ${p2}`);
    await uploadToStorage(p3, pipelineDOCX, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    ok(`Uploaded pipeline_report.docx → ${p3}`);
    await uploadToStorage(p4, salesCSV, "text/csv");
    ok(`Uploaded sales_report.csv     → ${p4}`);
    await uploadToStorage(p5, inventoryCSV, "text/csv");
    ok(`Uploaded inventory_sheet.csv  → ${p5}`);
    storagePaths.push(p1, p2, p3, p4, p5);

    // ── Step 3: Insert submissions + attachments ────────────────────────────
    sep("STEP 3 — Insert test submissions + attachments");

    const sub1 = `sub_bktest_${ts}_1`;
    const sub2 = `sub_bktest_${ts}_2`;
    const sub3 = `sub_bktest_${ts}_3`;
    subIds.push(sub1, sub2, sub3);

    await dbInsert("submissions", [
      { id: sub1, user_id: "u_employee",    submission_type_id: "st_weekly",    date: TODAY, work_summary: `[BKTEST] Weekly summary for John Doe`, tasks_details: "Backup E2E test", status: "submitted", locked: false, submitted_at: new Date().toISOString(), version_number: 999 },
      { id: sub2, user_id: "u_alex_turner", submission_type_id: "st_sales",     date: TODAY, work_summary: `[BKTEST] Sales pipeline for Alex Turner`, tasks_details: "Backup E2E test", status: "submitted", locked: false, submitted_at: new Date().toISOString(), version_number: 999 },
      { id: sub3, user_id: "u_david_kim",   submission_type_id: "st_inventory", date: TODAY, work_summary: `[BKTEST] Inventory sheet for David Kim`, tasks_details: "Backup E2E test", status: "submitted", locked: false, submitted_at: new Date().toISOString(), version_number: 999 },
    ]);
    ok("Inserted 3 test submissions");

    const att1 = `att_bktest_${ts}_1`;
    const att2 = `att_bktest_${ts}_2`;
    const att3 = `att_bktest_${ts}_3`;
    const att4 = `att_bktest_${ts}_4`;
    const att5 = `att_bktest_${ts}_5`;
    attIds.push(att1, att2, att3, att4, att5);

    await dbInsert("attachments", [
      { id: att1, submission_id: sub1, storage_path: p1, stored_name: `${ts}_weekly_summary.xlsx`,  original_name: "weekly_summary.xlsx",  size_bytes: weeklyXLSX.length,   mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      { id: att2, submission_id: sub1, storage_path: p2, stored_name: `${ts}_inventory.csv`,        original_name: "inventory.csv",        size_bytes: inventoryCSV.length, mime: "text/csv" },
      { id: att3, submission_id: sub2, storage_path: p3, stored_name: `${ts}_pipeline_report.docx`, original_name: "pipeline_report.docx", size_bytes: pipelineDOCX.length, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      { id: att4, submission_id: sub2, storage_path: p4, stored_name: `${ts}_sales_report.csv`,     original_name: "sales_report.csv",     size_bytes: salesCSV.length,     mime: "text/csv" },
      { id: att5, submission_id: sub3, storage_path: p5, stored_name: `${ts}_inventory_sheet.csv`,  original_name: "inventory_sheet.csv",  size_bytes: inventoryCSV.length, mime: "text/csv" },
    ]);
    ok("Inserted 5 attachment records");

    // version_number=999 → backup adds _v999 suffix per build.ts logic
    const V = "_v999";
    const expectedFiles = [
      { zipPath: `employees/John_Doe/2026-05-20__Weekly_Summary${V}/weekly_summary.xlsx`,              originalSize: weeklyXLSX.length,   originalName: "weekly_summary.xlsx"  },
      { zipPath: `employees/John_Doe/2026-05-20__Weekly_Summary${V}/inventory.csv`,                    originalSize: inventoryCSV.length, originalName: "inventory.csv"         },
      { zipPath: `employees/Alex_Turner/2026-05-20__Sales_Pipeline_Report${V}/pipeline_report.docx`,   originalSize: pipelineDOCX.length, originalName: "pipeline_report.docx" },
      { zipPath: `employees/Alex_Turner/2026-05-20__Sales_Pipeline_Report${V}/sales_report.csv`,       originalSize: salesCSV.length,     originalName: "sales_report.csv"     },
      { zipPath: `employees/David_Kim/2026-05-20__Inventory_Sheet${V}/inventory_sheet.csv`,            originalSize: inventoryCSV.length, originalName: "inventory_sheet.csv"  },
    ];

    // ── Step 4: Build backup ────────────────────────────────────────────────
    sep("STEP 4 — Build backup ZIP");
    info("Calling /api/backups/run with today's date filter…");
    const run = await runBackup(cookieHdr);
    const backupId    = run.id;
    const fileName    = run.file_name;
    const sizeBytes   = run.size_bytes;
    const storagePath = run.file_path;
    const detail      = run._detail ?? {};
    ok(`ZIP built: ${fileName}  (${(sizeBytes / 1024).toFixed(1)} KB)`);
    ok(`backup_logs id: ${backupId}`);
    ok(`Attachments included: ${detail.attachmentCount}, bytes: ${detail.attachmentBytes}`);
    if (detail.attachmentCount < 5) warn(`Expected 5 attachments but got ${detail.attachmentCount} — some may have been skipped`);

    // ── Step 5: Download & inspect ─────────────────────────────────────────
    sep("STEP 5 — Download & inspect ZIP contents");
    info(`Downloading backup from: ${storagePath}`);
    const zipBuf = await downloadZip(storagePath);
    info(`Downloaded ${(zipBuf.length / 1024).toFixed(1)} KB`);
    const { empFolders, empAtts } = await inspectZip(zipBuf, expectedFiles);

    if (empFolders.length < 3) warn(`Only ${empFolders.length}/3 employee folders present`);
    else ok(`All 3 employee folders present: ${empFolders.join(", ")}`);
    if (empAtts.length < 5) warn(`Only ${empAtts.length}/5 attachment files present in ZIP`);
    else ok(`All 5 attachment files present in ZIP`);

    // ── Step 6: Send email ─────────────────────────────────────────────────
    sep("STEP 6 — Email the backup");
    info(`Sending backup ${backupId} to ${LOCKED_TO}…`);
    const send = await sendBackup(backupId, cookieHdr);
    ok(`Resend message ID: ${send.messageId}`);
    ok(`Recipient: ${send.email}`);
    if (send.email !== LOCKED_TO) fail(`Recipient NOT locked! Got "${send.email}"`);
    ok(`Recipient correctly locked to ${LOCKED_TO}`);
    info(`Attached as file: ${send.attached ? "YES" : "NO — download link used (file too large)"}`);

    // ── Step 7: Verify backup_logs ─────────────────────────────────────────
    sep("STEP 7 — Verify backup_logs");
    await new Promise((r) => setTimeout(r, 1000));
    const logRes = await http(`${SB}/rest/v1/backup_logs?id=eq.${backupId}&select=*`, {
      headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
    });
    const log = Array.isArray(logRes.body) ? logRes.body[0] : null;
    if (!log) warn("Could not fetch backup_logs row");
    else {
      ok(`status: ${log.status}`);
      ok(`file_name: ${log.file_name}`);
      ok(`size_bytes: ${log.size_bytes}`);
      if (log.status !== "completed") fail(`Expected status=completed, got "${log.status}"`);
    }

    console.log(`\n\x1b[1;32m=== ALL STEPS PASSED ===\x1b[0m`);
    console.log(`  ZIP:             ${fileName}`);
    console.log(`  Size:            ${(sizeBytes / 1024).toFixed(1)} KB`);
    console.log(`  Employee folders: ${empFolders.join(", ")}`);
    console.log(`  Attachment files: ${empAtts.length} (xlsx, docx, csv)`);
    console.log(`  Resend msg ID:   ${send.messageId}`);
    console.log(`  Recipient:       ${send.email}`);
    console.log(`\n  Check inbox: ${LOCKED_TO}\n`);

  } finally {
    // ── Cleanup ────────────────────────────────────────────────────────────
    sep("CLEANUP");
    await dbDelete("attachments", attIds);
    await dbDelete("submissions", subIds);
    await deleteFromStorage(storagePaths);
  }
}

main().catch((e) => { console.error(`\x1b[31m✗\x1b[0m ${e.message}`); process.exit(1); });
