import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function booksRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const { user_id, status } = req.query as any;
    if (status) {
      return query(`SELECT * FROM books WHERE user_id = $1 AND status = $2 ORDER BY started_at DESC`, [user_id, status]);
    }
    return query(`SELECT * FROM books WHERE user_id = $1 ORDER BY started_at DESC`, [user_id]);
  });

  app.get("/:bookId/progress", async (req) => {
    const { bookId } = req.params as any;
    const [bookRows, logRows] = await Promise.all([
      query(`SELECT total_pages, total_chapters FROM books WHERE id = $1`, [bookId]),
      query(`SELECT COALESCE(SUM(pages_read), 0) AS pages_read_total FROM reading_logs WHERE book_id = $1`, [bookId]),
    ]);
    const total_pages: number | null = bookRows[0]?.total_pages ?? null;
    const total_chapters: number | null = bookRows[0]?.total_chapters ?? null;
    const pages_read_total = Number(logRows[0]?.pages_read_total ?? 0);
    const percent_complete = total_pages ? Math.round((pages_read_total / total_pages) * 100) : null;
    let estimated_chapter: number | null = null;
    if (total_pages && total_chapters) {
      const pagesPerChapter = total_pages / total_chapters;
      estimated_chapter = Math.min(
        total_chapters,
        Math.max(1, Math.ceil(pages_read_total / pagesPerChapter))
      );
    }
    return { pages_read_total, total_pages, percent_complete, estimated_chapter };
  });

  app.post("/", async (req) => {
    const { user_id, title, author, cover_url, total_pages, total_chapters } = req.body as any;
    const rows = await query(
      `INSERT INTO books (user_id, title, author, cover_url, total_pages, total_chapters, started_at)
       VALUES ($1,$2,$3,$4,$5,$6, current_date) RETURNING *`,
      [user_id, title, author, cover_url, total_pages, total_chapters ?? null]
    );
    return rows[0];
  });

  app.post("/:bookId/logs", async (req) => {
    const { bookId } = req.params as any;
    const { pages_read, logged_at } = req.body as any;
    const rows = await query(
      `INSERT INTO reading_logs (book_id, pages_read, logged_at)
       VALUES ($1,$2, COALESCE($3, current_date)) RETURNING *`,
      [bookId, pages_read, logged_at]
    );
    return rows[0];
  });

  app.patch("/:bookId", async (req) => {
    const { bookId } = req.params as any;
    const { status, rating, current_chapter, total_chapters } = req.body as any;
    const rows = await query(
      `UPDATE books SET
         status = COALESCE($2, status),
         rating = COALESCE($3, rating),
         current_chapter = COALESCE($4, current_chapter),
         total_chapters = COALESCE($5, total_chapters),
         finished_at = CASE WHEN $2 = 'finished' THEN current_date ELSE finished_at END
       WHERE id = $1 RETURNING *`,
      [bookId, status, rating, current_chapter, total_chapters]
    );
    return rows[0];
  });
}
