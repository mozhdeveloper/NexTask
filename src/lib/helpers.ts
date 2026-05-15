export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function hashStub(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16).padStart(8, "0");
}

export function pseudoIp(seed: string) {
  const h = parseInt(hashStub(seed), 16);
  return `192.168.${h % 254}.${(h >> 8) % 254}`;
}

export function downloadBlob(filename: string, content: string | Blob, mime = "text/plain") {
  const blob =
    typeof content === "string" ? new Blob([content], { type: mime }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
}

export function buildSubmissionPath(opts: {
  username: string;
  date: string; // yyyy-MM-dd
  fileName: string;
  submittedAt: string; // ISO
}) {
  const [yyyy, mm, dd] = opts.date.split("-");
  const months = [
    "01-Jan",
    "02-Feb",
    "03-Mar",
    "04-Apr",
    "05-May",
    "06-Jun",
    "07-Jul",
    "08-Aug",
    "09-Sep",
    "10-Oct",
    "11-Nov",
    "12-Dec",
  ];
  const month = months[parseInt(mm, 10) - 1];
  const ts = opts.submittedAt
    .replace("T", "_")
    .replace(/:/g, "-")
    .replace(/\..+/, "");
  const safeName = opts.fileName.replace(/\s+/g, "_");
  return `employees/${opts.username}/${yyyy}/${month}/${dd}/${ts}_${opts.username}_${safeName}`;
}

export function backupFileName(date = new Date()) {
  const ts = date
    .toISOString()
    .replace("T", "_")
    .replace(/:/g, "-")
    .replace(/\..+/, "");
  return `office_uploads_backup_${ts}.zip`;
}

export function userAgent() {
  if (typeof navigator === "undefined") return "node";
  return navigator.userAgent.slice(0, 120);
}
