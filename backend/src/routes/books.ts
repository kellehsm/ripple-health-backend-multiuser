import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function booksRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const user_id = req.user_id;
    const { status } = req.query as any;
    if (status) {
      return query(`SELECT * FROM books WHERE user_id = $1 AND status = $2 ORDER BY started_at DESC`, [user_id, status]);
    }
    return query(`SELECT * FROM books WHERE user_id = $1 ORDER BY started_at DESC`, [user_id]);
  });

  app.get("/:bookId/progress", async (req, reply) => {
    const user_id = req.user_id;
    const { bookId } = req.params as any;
    const [bookRows, logRows] = await Promise.all([
      query(`SELECT total_pages FROM books WHERE id = $1 AND user_id = $2`, [bookId, user_id]),
      query(`SELECT COALESCE(SUM(pages_read), 0) AS pages_read_total FROM reading_logs WHERE book_id = $1`, [bookId]),
    ]);
    if (!bookRows[0]) return reply.status(404).send({ error: "not found" });
    const total_pages: number | null = bookRows[0]?.total_pages ?? null;
    const pages_read_total = Number(logRows[0]?.pages_read_total ?? 0);
    const percent_complete = total_pages ? Math.round((pages_read_total / total_pages) * 100) : null;
    return { pages_read_total, total_pages, percent_complete };
  });

  app.post("/", async (req) => {
    const user_id = req.user_id;
    const { title, author, cover_url, total_pages, total_chapters } = req.body as any;
    const rows = await query(
      `INSERT INTO books (user_id, title, author, cover_url, total_pages, total_chapters, started_at)
       VALUES ($1,$2,$3,$4,$5,$6, current_date) RETURNING *`,
      [user_id, title, author, cover_url, total_pages, total_chapters ?? null]
    );
    return rows[0];
  });

  app.post("/:bookId/logs", async (req, reply) => {
    const user_id = req.user_id;
    const { bookId } = req.params as any;
    const { pages_read, logged_at } = req.body as any;
    const rows = await query(
      `INSERT INTO reading_logs (book_id, pages_read, logged_at)
       SELECT $1, $2, COALESCE($3, current_date)
       WHERE EXISTS (SELECT 1 FROM books WHERE id = $1 AND user_id = $4)
       RETURNING *`,
      [bookId, pages_read, logged_at, user_id]
    );
    if (!rows[0]) return reply.status(404).send({ error: "not found" });
    return rows[0];
  });

  app.delete("/:id", async (req, reply) => {
    const user_id = req.user_id;
    const { id } = req.params as any;
    const owned = await query(`SELECT id FROM books WHERE id = $1 AND user_id = $2`, [id, user_id]);
    if (!owned[0]) return reply.status(404).send({ error: "not found" });
    await query(`DELETE FROM reading_logs WHERE book_id = $1`, [id]);
    await query(`DELETE FROM books WHERE id = $1`, [id]);
    return { ok: true };
  });

  app.patch("/:bookId", async (req, reply) => {
    const user_id = req.user_id;
    const { bookId } = req.params as any;
    const { status, rating, current_chapter, total_chapters } = req.body as any;
    const rows = await query(
      `UPDATE books SET
         status = COALESCE($2, status),
         rating = COALESCE($3, rating),
         current_chapter = COALESCE($4, current_chapter),
         total_chapters = COALESCE($5, total_chapters),
         finished_at = CASE WHEN $2 = 'finished' THEN current_date ELSE finished_at END
       WHERE id = $1 AND user_id = $6 RETURNING *`,
      [bookId, status, rating, current_chapter, total_chapters, user_id]
    );
    if (!rows[0]) return reply.status(404).send({ error: "not found" });
    return rows[0];
  });
}
