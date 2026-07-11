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

  app.post("/", async (req) => {
    const { user_id, title, author, cover_url, total_pages } = req.body as any;
    const rows = await query(
      `INSERT INTO books (user_id, title, author, cover_url, total_pages, started_at)
       VALUES ($1,$2,$3,$4,$5, current_date) RETURNING *`,
      [user_id, title, author, cover_url, total_pages]
    );
    return rows[0];
  });

  // Log pages read today, and roll rating/status changes in on finish
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
    const { status, rating } = req.body as any;
    const rows = await query(
      `UPDATE books SET
         status = COALESCE($2, status),
         rating = COALESCE($3, rating),
         finished_at = CASE WHEN $2 = 'finished' THEN current_date ELSE finished_at END
       WHERE id = $1 RETURNING *`,
      [bookId, status, rating]
    );
    return rows[0];
  });
}
