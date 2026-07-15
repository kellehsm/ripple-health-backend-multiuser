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
      `SELECT id, name, 'hobby' AS kind, completed_at, icon, color_key, unit_label
       FROM hobbies WHERE user_id = $1 AND status = 'completed' AND completed_at IS NOT NULL
       ORDER BY completed_at DESC`,
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
