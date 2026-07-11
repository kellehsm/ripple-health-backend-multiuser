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
};
