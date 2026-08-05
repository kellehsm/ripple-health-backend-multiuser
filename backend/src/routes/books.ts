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
      query(`SELECT COALESCE(SUM(rl.pages_read), 0) AS pages_read_total FROM reading_logs rl JOIN books b ON b.id = rl.book_id WHERE rl.book_id = $1 AND b.user_id = $2`, [bookId, user_id]),
    ]);
    if (!bookRows[0]) return reply.status(404).send({ error: "not found" });
    const total_pages: number | null = bookRows[0]?.total_pages ?? null;
    const pages_read_total = Number(logRows[0]?.pages_read_total ?? 0);
    const percent_complete = total_pages ? Math.round((pages_read_total / total_pages) * 100) : null;
    return { pages_read_total, total_pages, percent_complete };
  });

  // GET /progress/batch?ids=id1,id2,id3 — batch fetch progress for multiple books
  app.get("/progress/batch", async (req, reply) => {
    const user_id = req.user_id;
    const { ids } = req.query as any;
    if (!ids) return {};
    const bookIds: string[] = String(ids).split(",").map(s => s.trim()).filter(Boolean);
    if (bookIds.length === 0) return {};

    // Fetch book totals and reading log totals in two parallel queries
    const [books, logs] = await Promise.all([
      query<any>(
        `SELECT id, total_pages FROM books WHERE id = ANY($1::uuid[]) AND user_id = $2`,
        [bookIds, user_id]
      ),
      query<any>(
        `SELECT rl.book_id, COALESCE(SUM(rl.pages_read), 0) AS pages_read_total
         FROM reading_logs rl
         JOIN books b ON b.id = rl.book_id
         WHERE rl.book_id = ANY($1::uuid[]) AND b.user_id = $2
         GROUP BY rl.book_id`,
        [bookIds, user_id]
      ),
    ]);

    const pagesMap = new Map<string, number>();
    for (const row of logs) pagesMap.set(row.book_id, Number(row.pages_read_total));

    const result: Record<string, { pages_read_total: number; total_pages: number | null; percent_complete: number | null }> = {};
    for (const book of books) {
      const total_pages: number | null = book.total_pages ?? null;
      const pages_read_total = pagesMap.get(book.id) ?? 0;
      const percent_complete = total_pages ? Math.round((pages_read_total / total_pages) * 100) : null;
      result[book.id] = { pages_read_total, total_pages, percent_complete };
    }
    return result;
  });

  app.post("/", async (req) => {
    const user_id = req.user_id;
    const { title, author, cover_url, total_pages, total_chapters, hardcover_id } = req.body as any;
    const rows = await query(
      `INSERT INTO books (user_id, title, author, cover_url, total_pages, total_chapters, hardcover_id, started_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, current_date) RETURNING *`,
      [user_id, title, author, cover_url, total_pages, total_chapters ?? null, hardcover_id ?? null]
    );
    return rows[0];
  });

  app.post("/:bookId/logs", async (req, reply) => {
    const user_id = req.user_id;
    const { bookId } = req.params as any;
    const { pages_read, logged_at } = req.body as any;
    const rows = await query(
      `INSERT INTO reading_logs (book_id, user_id, pages_read, logged_at)
       SELECT $1, $4, $2, COALESCE($3, current_date)
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
    // Collapse ownership check + delete; RETURNING id signals 404 if not found
    const deleted = await query<any>(`DELETE FROM books WHERE id = $1 AND user_id = $2 RETURNING id`, [id, user_id]);
    if (!deleted[0]) return reply.status(404).send({ error: "not found" });
    await query(`DELETE FROM reading_logs WHERE book_id = $1`, [id]);
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
