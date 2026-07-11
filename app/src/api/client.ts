// Point this at your VPS once the backend is deployed, e.g.
// "https://wellness-api.yourdomain.com" - for local dev, your machine's
// LAN IP (not "localhost", since the phone/emulator can't resolve that).
const BASE_URL = http://129.121.114.242:4000:4000/api";

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

  books: (userId: string) => request(`/books?user_id=${userId}`),
  logPages: (bookId: string, pages_read: number) =>
    request(`/books/${bookId}/logs`, { method: "POST", body: JSON.stringify({ pages_read }) }),

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
