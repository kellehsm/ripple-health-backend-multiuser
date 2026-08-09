const BASE_URL = "http://129.121.125.214:4000/api";

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export const api = {
  today: (userId: string) => request(`/summary/today?user_id=${userId}`),
  pattern: (userId: string, date?: string) =>
    request(`/summary/pattern?user_id=${userId}${date ? `&date=${date}` : ""}`),

  books: (userId: string, status?: string) =>
    request(`/books?user_id=${userId}${status ? `&status=${status}` : ""}`),
  addBook: (payload: Record<string, unknown>) =>
    request(`/books`, { method: "POST", body: JSON.stringify(payload) }),
  bookProgress: (bookId: string) => request(`/books/${bookId}/progress`),
  bookProgressBatch: (ids: string[]): Promise<Record<string, any>> =>
    request(`/books/progress/batch?ids=${ids.join(",")}`),
  logPages: (bookId: string, pages_read: number) =>
    request(`/books/${bookId}/logs`, { method: "POST", body: JSON.stringify({ pages_read }) }),
  updateBook: (bookId: string, updates: Record<string, unknown>) =>
    request(`/books/${bookId}`, { method: "PATCH", body: JSON.stringify(updates) }),

  hobbies: (userId: string) => request(`/hobbies?user_id=${userId}`),
  logHobby: (hobbyId: string, amount: number, rating?: number, note?: string) =>
    request(`/hobbies/${hobbyId}/logs`, { method: "POST", body: JSON.stringify({ amount, rating, note }) }),

  glucoseToday: (userId: string, date: string) =>
    request(`/glucose?user_id=${userId}&date=${date}`),

  addMeal: (payload: Record<string, unknown>) =>
    request(`/meals`, { method: "POST", body: JSON.stringify(payload) }),

  spending: (userId: string, since?: string) =>
    request(`/spending?user_id=${userId}${since ? `&since=${since}` : ""}`),

  addSpending: (payload: Record<string, unknown>) =>
    request(`/spending`, { method: "POST", body: JSON.stringify(payload) }),

  logMood: (userId: string, mood_score: number, entry_text?: string) =>
    request(`/journal`, { method: "POST", body: JSON.stringify({ user_id: userId, mood_score, entry_text }) }),

  getSettings: () => request(`/settings`),
  updateSettings: (patch: Record<string, unknown>) =>
    request(`/settings`, { method: "PATCH", body: JSON.stringify(patch) }),

  hardcoverStatus: (): Promise<{ connected: boolean; last_synced_at: string | null }> =>
    request(`/hardcover/status`),
  hardcoverConnect: (api_token: string): Promise<{ ok: boolean; username: string }> =>
    request(`/hardcover/connect`, { method: "POST", body: JSON.stringify({ api_token }) }),
  hardcoverDisconnect: (): Promise<{ ok: boolean }> =>
    request(`/hardcover/disconnect`, { method: "DELETE" }),
  hardcoverSync: (): Promise<{ books_checked: number; pushed: number; pulled: number; errors: number }> =>
    request(`/hardcover/sync`, { method: "POST" }),

  // ── Insights (Phase-5 upgrade) ─────────────────────────────────────────────
  getInsights: () => request(`/insights`),
  getInsightHistory: () => request(`/insights/history`),
  dismissInsight: (id: string) => request(`/insights/${id}/dismiss`, { method: "POST", body: "{}" }),
  undismissInsight: (id: string) => request(`/insights/${id}/undismiss`, { method: "POST", body: "{}" }),
  regenerateInsights: () => request(`/insights/regenerate`, { method: "POST", body: "{}" }),
  insightFeedback: (id: string, rating: "helpful" | "neutral" | "not_useful" | "already_knew") =>
    request(`/insights/${id}/feedback`, { method: "POST", body: JSON.stringify({ rating }) }),
  insightTry: (id: string) => request(`/insights/${id}/try`, { method: "POST", body: "{}" }),
  insightPin: (id: string, pinned: boolean) =>
    request(`/insights/${id}/pin`, { method: "POST", body: JSON.stringify({ pinned }) }),
  insightExplain: (id: string) => request(`/insights/${id}/explain`, { method: "POST", body: "{}" }),
  insightDebug: (id: string) => request(`/insights/${id}/debug`),
  insightTimeline: () => request(`/insights/timeline`),
  insightDigest: () => request(`/insights/digest`),
};
