import { FastifyInstance } from "fastify";
import Anthropic from "@anthropic-ai/sdk";
import { query } from "../db.js";
import { estToday } from "../lib/estDate.js";

const MODEL = "claude-sonnet-4-6";
const CONTEXT_DAYS = 14;
const MAX_MESSAGES = 30;

type ChatMessage = { role: "user" | "assistant"; content: string };

export default async function chatRoutes(app: FastifyInstance) {
  app.post("/", async (req, reply) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      reply.code(503);
      return { error: "Chat is not configured on this server." };
    }

    const user_id = req.user_id;
    const { messages } = req.body as { messages: ChatMessage[] };
    if (!Array.isArray(messages) || messages.length === 0) {
      reply.code(400);
      return { error: "messages required" };
    }
    const trimmed = messages
      .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-MAX_MESSAGES);

    const rows = await query<any>(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date, overall_score, sleep_score, glucose_score,
              activity_score, hydration_score, nutrition_score, mood_score, productivity_score,
              stress_score, summary_data
       FROM daily_summaries
       WHERE user_id = $1 AND date >= CURRENT_DATE - ${CONTEXT_DAYS} * INTERVAL '1 day'
       ORDER BY date DESC`,
      [user_id]
    );

    const system = [
      {
        type: "text" as const,
        text:
`You are Ripple's wellness assistant. You answer questions about the user's own tracked health data (below). Today is ${estToday()}.

Rules:
- Be concise, warm, and specific — cite dates and numbers from the data.
- Describe patterns, never diagnose or give medical advice. Use observational language ("your glucose ran higher on...", not causal or diagnostic claims).
- Scores are 0-100 daily domain scores computed by the app.
- If the data doesn't cover the question, say so plainly.

USER DATA (last ${CONTEXT_DAYS} days of daily summaries, newest first):
${JSON.stringify(rows)}`,
        cache_control: { type: "ephemeral" as const },
      },
    ];

    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: trimmed,
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("");

    return { reply: text, usage: response.usage };
  });
}
