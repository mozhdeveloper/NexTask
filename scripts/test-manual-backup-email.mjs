/**
 * Smoke test: manual backup email send with the locked configuration.
 *
 * Mirrors /api/backups/send exactly:
 *   FROM = NexTask Backups <onboarding@resend.dev>   (always allowed by Resend)
 *   TO   = premium.global.official@gmail.com         (account owner — locked)
 *
 * Builds a tiny synthetic ZIP and ships it as an attachment so we can prove
 * end-to-end deliverability without dragging in the full Supabase pipeline.
 *
 * Usage:
 *   node scripts/test-manual-backup-email.mjs
 */
import { request } from "node:https";
import { createGzip } from "node:zlib";
import { promisify } from "node:util";
import { pipeline } from "node:stream";

const RESEND_API_KEY            = "re_J6iZZDyW_MFbbVGZ1FYxRCyuW8SYZ7KDZ";
const MANUAL_BACKUP_FROM        = "NexTask Backups <onboarding@resend.dev>";
const MANUAL_BACKUP_RECIPIENT   = "premium.global.official@gmail.com";

const ok    = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const info  = (m) => console.log(`\x1b[36mi\x1b[0m ${m}`);
const fail  = (m) => { console.error(`\x1b[31m✗\x1b[0m ${m}`); process.exit(1); };

async function resendSend(payload) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = request({
      method: "POST",
      hostname: "api.resend.com",
      path: "/emails",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const txt = Buffer.concat(chunks).toString("utf8");
        let json = {};
        try { json = JSON.parse(txt); } catch { /* keep raw */ }
        resolve({ status: res.statusCode ?? 0, body: json, raw: txt });
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log("\n=== Manual Backup Email — Locked Recipient Smoke Test ===\n");
  info(`FROM: ${MANUAL_BACKUP_FROM}`);
  info(`TO:   ${MANUAL_BACKUP_RECIPIENT}`);

  // Minimal synthetic attachment so we exercise the attachments codepath.
  const fakeZip = Buffer.from(
    "NexTask manual-send smoke test attachment.\nGenerated " + new Date().toISOString(),
    "utf8",
  );
  const fileName = `nextask_smoke_${Date.now()}.txt`;
  const sizeKB = (fakeZip.length / 1024).toFixed(2);

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <h1 style="margin:0 0 8px;font-size:20px">NexTask — Manual Backup Email Smoke Test</h1>
      <p style="margin:0 0 8px;color:#475569;font-size:14px">
        This message confirms the manual <em>Email backup</em> flow works end-to-end with the locked
        configuration (FROM <code>onboarding@resend.dev</code>, TO <strong>${MANUAL_BACKUP_RECIPIENT}</strong>).
      </p>
      <p style="margin:0 0 8px;font-size:14px"><strong>Attachment:</strong> ${fileName} (${sizeKB} KB)</p>
      <p style="margin:0 0 8px;font-size:14px"><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0" />
      <p style="margin:0;color:#94a3b8;font-size:12px">If you received this, the production /api/backups/send route will deliver too.</p>
    </div>`;

  info("Sending via Resend…");
  const { status, body, raw } = await resendSend({
    from: MANUAL_BACKUP_FROM,
    to: [MANUAL_BACKUP_RECIPIENT],
    subject: `NexTask Backup — Manual Smoke Test ${new Date().toLocaleDateString()}`,
    html,
    attachments: [{ filename: fileName, content: fakeZip.toString("base64") }],
  });

  if (status >= 200 && status < 300) {
    ok(`Resend accepted the message (status ${status}).`);
    if (body?.id) ok(`Message ID: ${body.id}`);
    console.log("\n=== ✓ All checks passed — check the inbox at " + MANUAL_BACKUP_RECIPIENT + " ===\n");
    return;
  }

  console.error("\n--- Resend response ---");
  console.error("Status:", status);
  console.error("Body:  ", body || raw);
  console.error("-----------------------");
  fail(`Resend send failed (status ${status}). See body above.`);
}

// keep imports above tree-shake-friendly
void promisify; void pipeline; void createGzip;

main().catch((e) => fail(e.stack || e.message));
