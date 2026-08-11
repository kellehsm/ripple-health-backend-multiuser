import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import { query } from "../db.js";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { randomUUID } from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "media-uploads");

const ALLOWED_MIME: Record<string, string> = {
  "audio/mpeg": "audio",
  "audio/mp4": "audio",
  "audio/x-m4a": "audio",
  "audio/aac": "audio",
  "audio/wav": "audio",
  "audio/x-wav": "audio",
  "audio/ogg": "audio",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "image/gif": "image",
  "video/mp4": "video",
  "video/webm": "video",
};

type Asset = {
  id: string;
  kind: string;
  category: string | null;
  title: string;
  filename: string;
  original_name: string | null;
  mime: string;
  size_bytes: string;
  meta: any;
  sort_order: number;
  created_at: string;
};

async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const rows = await query<{ is_admin: boolean }>(
    `SELECT is_admin FROM users WHERE id = $1`,
    [req.user_id]
  );
  if (!rows[0]?.is_admin) {
    reply.code(403).send({ error: "Admin access required" });
    return false;
  }
  return true;
}

export default async function mediaRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: { fileSize: 200 * 1024 * 1024, files: 1 },
  });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  // GET /api/media — list assets, optional ?kind=audio&category=soundscape
  app.get("/", async (req) => {
    const { kind, category } = req.query as any;
    const conds: string[] = [];
    const params: any[] = [];
    if (kind) { params.push(kind); conds.push(`kind = $${params.length}`); }
    if (category) { params.push(category); conds.push(`category = $${params.length}`); }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    return query<Asset>(
      `SELECT id, kind, category, title, mime, size_bytes, meta, sort_order, created_at
       FROM media_assets ${where}
       ORDER BY sort_order, created_at`,
      params
    );
  });

  // GET /api/media/me — whether the caller can manage media (drives admin UI)
  app.get("/me", async (req) => {
    const rows = await query<{ is_admin: boolean }>(
      `SELECT is_admin FROM users WHERE id = $1`, [req.user_id]);
    return { is_admin: !!rows[0]?.is_admin };
  });

  // GET /api/media/file/:id — stream with HTTP Range support (audio/video seeking)
  app.get("/file/:id", async (req, reply) => {
    const { id } = req.params as any;
    const rows = await query<Asset>(
      `SELECT * FROM media_assets WHERE id = $1`, [id]);
    const asset = rows[0];
    if (!asset) return reply.code(404).send({ error: "Not found" });

    const filePath = path.join(UPLOAD_DIR, asset.filename);
    if (!fs.existsSync(filePath)) return reply.code(404).send({ error: "File missing" });
    const size = fs.statSync(filePath).size;

    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m && m[1] ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
      if (start >= size || start > end) {
        return reply.code(416).header("Content-Range", `bytes */${size}`).send();
      }
      reply
        .code(206)
        .header("Content-Type", asset.mime)
        .header("Accept-Ranges", "bytes")
        .header("Content-Range", `bytes ${start}-${end}/${size}`)
        .header("Content-Length", end - start + 1);
      return reply.send(fs.createReadStream(filePath, { start, end }));
    }

    reply
      .header("Content-Type", asset.mime)
      .header("Accept-Ranges", "bytes")
      .header("Content-Length", size);
    return reply.send(fs.createReadStream(filePath));
  });

  // POST /api/media — admin multipart upload (file + optional fields)
  app.post("/", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;

    const parts = req.parts();
    let saved: { filename: string; mime: string; original: string; size: number } | null = null;
    const fields: Record<string, string> = {};

    for await (const part of parts) {
      if (part.type === "file") {
        const kind = ALLOWED_MIME[part.mimetype];
        if (!kind) {
          part.file.resume();
          return reply.code(400).send({ error: `Unsupported type: ${part.mimetype}` });
        }
        const ext = path.extname(part.filename || "") || "." + part.mimetype.split("/")[1];
        const filename = randomUUID() + ext.toLowerCase();
        const dest = path.join(UPLOAD_DIR, filename);
        await pipeline(part.file, fs.createWriteStream(dest));
        if (part.file.truncated) {
          fs.unlinkSync(dest);
          return reply.code(400).send({ error: "File exceeds 200MB limit" });
        }
        saved = {
          filename,
          mime: part.mimetype,
          original: part.filename || filename,
          size: fs.statSync(dest).size,
        };
      } else {
        fields[part.fieldname] = String(part.value);
      }
    }

    if (!saved) return reply.code(400).send({ error: "No file provided" });

    let meta = {};
    try { meta = fields.meta ? JSON.parse(fields.meta) : {}; } catch {}

    const [row] = await query<Asset>(
      `INSERT INTO media_assets (kind, category, title, filename, original_name, mime, size_bytes, meta, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, kind, category, title, mime, size_bytes, meta, sort_order, created_at`,
      [
        fields.kind || ALLOWED_MIME[saved.mime],
        fields.category || null,
        fields.title || saved.original.replace(/\.[^.]+$/, ""),
        saved.filename,
        saved.original,
        saved.mime,
        saved.size,
        JSON.stringify(meta),
        fields.sort_order ? parseInt(fields.sort_order, 10) || 0 : 0,
      ]
    );
    return row;
  });

  // PATCH /api/media/:id — admin metadata edit
  app.patch("/:id", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const { id } = req.params as any;
    const { title, category, meta, sort_order } = req.body as any;
    const [row] = await query<Asset>(
      `UPDATE media_assets SET
         title = COALESCE($2, title),
         category = COALESCE($3, category),
         meta = COALESCE($4::jsonb, meta),
         sort_order = COALESCE($5, sort_order)
       WHERE id = $1
       RETURNING id, kind, category, title, mime, size_bytes, meta, sort_order, created_at`,
      [id, title ?? null, category ?? null, meta ? JSON.stringify(meta) : null, sort_order ?? null]
    );
    if (!row) return reply.code(404).send({ error: "Not found" });
    return row;
  });

  // DELETE /api/media/:id — admin remove (row + file)
  app.delete("/:id", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const { id } = req.params as any;
    const rows = await query<Asset>(
      `DELETE FROM media_assets WHERE id = $1 RETURNING filename`, [id]);
    if (!rows[0]) return reply.code(404).send({ error: "Not found" });
    try { fs.unlinkSync(path.join(UPLOAD_DIR, rows[0].filename)); } catch {}
    return { ok: true };
  });
}
