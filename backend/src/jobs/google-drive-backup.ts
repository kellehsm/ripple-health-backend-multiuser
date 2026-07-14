import { exec } from "child_process";
import zlib from "zlib";
import { promisify } from "util";
import { query } from "../db.js";

const execAsync = promisify(exec);
const gzipAsync = promisify(zlib.gzip);

function parseDatabaseUrl(url: string) {
  const withoutProto = url.replace(/^postgres(ql)?:\/\//, "");
  const atIdx = withoutProto.lastIndexOf("@");
  const hostPart = withoutProto.slice(atIdx + 1);
  const userPart = withoutProto.slice(0, atIdx);
  const colonIdx = userPart.indexOf(":");
  const user = userPart.slice(0, colonIdx);
  const pass = userPart.slice(colonIdx + 1);
  const slashIdx = hostPart.indexOf("/");
  const hostPort = hostPart.slice(0, slashIdx);
  const database = hostPart.slice(slashIdx + 1);
  const [host, port] = hostPort.split(":");
  return { user, pass, host, port: port ?? "5432", database };
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  });
  const data: any = await res.json();
  if (!data.access_token) throw new Error("Token refresh failed: " + JSON.stringify(data));
  return data.access_token;
}

export async function backupToGoogleDrive(userId: string): Promise<string> {
  const rows = await query<any>("SELECT settings FROM user_settings WHERE user_id = $1", [userId]);
  const gd = rows[0]?.settings?.google_drive;
  if (!gd?.refresh_token) throw new Error("Google Drive not connected");

  const accessToken = await refreshAccessToken(gd.refresh_token);

  // Dump database to SQL text
  const db = parseDatabaseUrl(process.env.DATABASE_URL!);
  const { stdout: dumpSql } = await execAsync(
    `pg_dump -h ${db.host} -p ${db.port} -U ${db.user} -d ${db.database}`,
    { env: { ...process.env, PGPASSWORD: db.pass }, maxBuffer: 100 * 1024 * 1024 }
  );
  const gzipped = await gzipAsync(Buffer.from(dumpSql));

  // Multipart upload to Google Drive
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `ripple-health-backup-${timestamp}.sql.gz`;
  const boundary = "ripple_boundary_" + Date.now();
  const metaPart = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name: filename, mimeType: "application/gzip" })}\r\n`;
  const dataPart = `--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = Buffer.concat([Buffer.from(metaPart), Buffer.from(dataPart), gzipped, Buffer.from(tail)]);

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!uploadRes.ok) throw new Error("Drive upload failed: " + (await uploadRes.text()));

  // Rotate — delete backups older than 14 days
  const listRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?" +
      new URLSearchParams({
        q: "name contains 'ripple-health-backup-' and trashed=false",
        fields: "files(id,name,createdTime)",
        orderBy: "createdTime",
      }),
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const listData: any = await listRes.json();
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  for (const file of listData.files ?? []) {
    if (new Date(file.createdTime).getTime() < cutoff) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }
  }

  // Update last_backup timestamp
  const rows2 = await query<any>("SELECT settings FROM user_settings WHERE user_id = $1", [userId]);
  const existing = rows2[0]?.settings ?? {};
  await query(
    `INSERT INTO user_settings (user_id, settings) VALUES ($1, $2::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET settings = $2::jsonb`,
    [userId, JSON.stringify({ ...existing, google_drive: { ...existing.google_drive, last_backup: new Date().toISOString() } })]
  );

  return filename;
}
