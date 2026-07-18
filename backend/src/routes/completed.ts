import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function completedRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const user_id = req.user_id;
    const books = await query<any>(
      `SELECT id, title AS name, 'book' AS kind, finished_at AS completed_at, author, cover_url, rating
       FROM books WHERE user_id = $1 AND status = 'finished' AND finished_at IS NOT NULL
       ORDER BY finished_at DESC`,
      [user_id]
    );
    const hobbies = await query<any>(
      `SELECT h.id, h.name, 'hobby' AS kind, h.icon, h.color_key, h.unit_label,
              (SELECT MAX(logged_at) FROM hobby_logs WHERE hobby_id = h.id) AS completed_at
       FROM hobbies h
       WHERE h.user_id = $1 AND h.status = 'completed'
       ORDER BY completed_at DESC NULLS LAST`,
      [user_id]
    );
    const merged = [...books, ...hobbies].sort((a, b) => {
      const da = new Date(a.completed_at).getTime();
      const db2 = new Date(b.completed_at).getTime();
      return db2 - da;
    });
    return merged;
  });
}
